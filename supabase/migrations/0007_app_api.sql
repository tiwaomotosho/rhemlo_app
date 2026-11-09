-- =====================================================================
-- Rhemlo · 0007_app_api.sql
-- The web app's server API, on top of 0001-0006. Every function the app calls is named app_*
-- and returns the exact shape its screen expects. Internal helpers are named rh_* and are not
-- callable from the app.
--
--   * sign-up: a profile and a public handle for every new account
--   * progress sync: one snapshot per learner (the app merges safely), plus the study activity
--     derived from it (sittings per day, lessons finished, Secure count) for co-op, circles and coaches
--   * weekly tier leagues (Bronze to Lantern) scored from server-verified points only
--   * the daily challenge, marked on the server
--   * friends, feed, cheers, co-op; circles, class chat, assignments, coach-set mocks
--   * inbox, direct messages with the 0006 safeguards, guardian consent requests
--   * leaderboards, private leagues, hosted rooms and friendly duels
--   * administration: manual catalogue, seasons, organisations, consents, sanctions,
--     content reports, item verification, anomalies; a queue of emails for the mail sender
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------
create or replace function rh_ms(t timestamptz) returns bigint
language sql immutable as $$ select (extract(epoch from t) * 1000)::bigint $$;

create or replace function rh_from_ms(ms bigint) returns timestamptz
language sql immutable as $$ select to_timestamp(ms / 1000.0) $$;

-- avatar 'preset:<colourway>' -> the app's Glim colourway name
create or replace function rh_cw(p_avatar text) returns text
language sql immutable as $$
  select case when p_avatar ~ '^preset:(classic|twilight|meadow|rosewood|midnight|ocean)$'
              then substr(p_avatar, 8) else 'classic' end
$$;

create or replace function rh_week_start(d date default null) returns date
language sql stable as $$ select date_trunc('week', coalesce(d, local_today()))::date $$;

create or replace function rh_week_id(d date default null) returns text
language sql stable as $$ select to_char(rh_week_start(d), 'IYYY-"W"IW') $$;

-- the app's role for a user: admin (super admin, moderator, support), steward (content editor),
-- coach (coaches at least one class) or learner
create or replace function rh_role(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when bool_or(role in ('super_admin', 'moderator', 'support')) then 'admin'
                 when bool_or(role = 'content_editor') then 'steward' end
     from platform_staff where user_id = p_user),
    case when exists (select 1 from group_members where user_id = p_user and role = 'coach') then 'coach' end,
    'learner')
$$;

create or replace function rh_is_uuid(t text) returns boolean
language sql immutable as $$ select t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' $$;

-- ---------------------------------------------------------------------
-- 1. Sign-up: profile + public handle from the sign-up form (raw_user_meta_data)
-- ---------------------------------------------------------------------
create or replace function rh_on_signup() returns trigger
language plpgsql security definer set search_path = public as $$
declare h text; meta jsonb := coalesce(to_jsonb(new) -> 'raw_user_meta_data', '{}');
begin
  -- Supabase always has raw_user_meta_data; the local test stand-in does not, and its tests create profiles themselves
  if not (to_jsonb(new) ? 'raw_user_meta_data') then return new; end if;
  h := left(lower(regexp_replace(coalesce(meta->>'handle', ''), '[^A-Za-z0-9_]', '', 'g')), 20);
  if length(h) < 3 then h := 'learner_' || substr(replace(new.id::text, '-', ''), 1, 8); end if;
  while exists (select 1 from public_profiles where handle = h) loop
    h := left(h, 15) || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  insert into profiles (user_id, display_name) values (new.id, nullif(btrim(meta->>'display_name'), ''))
  on conflict do nothing;
  insert into public_profiles (user_id, handle, display_name) values (new.id, h, nullif(btrim(meta->>'display_name'), ''))
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists rh_on_auth_user_created on auth.users;
create trigger rh_on_auth_user_created after insert on auth.users
  for each row execute function rh_on_signup();

-- tier per user (weekly leagues), read by rh_user
create table tier_members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  edition_code text not null references editions(code),
  tier         text not null default 'bronze'
               check (tier in ('bronze', 'silver', 'gold', 'jade', 'amethyst', 'lantern')),
  since        timestamptz not null default now()
);
alter table tier_members enable row level security;
create policy own_row on tier_members for select to authenticated using (user_id = (select auth.uid()));

-- one user as the app shows them (PublicUser). Hidden learners stay anonymous to others.
create or replace function rh_user(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p_user,
    'handle', case when pp.visibility = 'hidden' and p_user is distinct from (select auth.uid())
                   then 'Hidden learner' else coalesce(pp.handle, 'learner') end,
    'name', shown_name(p_user),
    'cw', rh_cw(pp.avatar),
    'tier', coalesce((select tier from tier_members where user_id = p_user), 'bronze'),
    'role', rh_role(p_user))
  from (select 1) one left join public_profiles pp on pp.user_id = p_user
$$;

create or replace function app_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select rh_user((select auth.uid()))
         || jsonb_build_object('email', (select email from auth.users where id = (select auth.uid())),
                               'minor', is_minor((select auth.uid())))
$$;

-- the edition the user studies now (falls back to the first one available)
create or replace function rh_my_edition() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select edition_code from user_manuals where user_id = (select auth.uid()) and is_active),
                  (select m from my_editions() m order by m limit 1))
$$;

-- ---------------------------------------------------------------------
-- 2. Progress sync. The device is the source of truth for practice; the server keeps the latest
--    snapshot and derives the activity that other people may see (never answers or cards).
-- ---------------------------------------------------------------------
create table user_snapshots (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null,
  bytes      integer not null,
  updated_at timestamptz not null default now()
);
alter table user_snapshots enable row level security;
create policy own_row on user_snapshots for select to authenticated using (user_id = (select auth.uid()));

create table user_activity_daily (                     -- sittings per day, for co-op, circles, coaches
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  sittings integer not null,
  answers  integer not null,
  correct  integer not null,
  primary key (user_id, day)
);
alter table user_activity_daily enable row level security;
create policy own_rows on user_activity_daily for select to authenticated using (user_id = (select auth.uid()));

create table user_lesson_done (                        -- lessons cleared, for the friends feed
  user_id      uuid not null references auth.users(id) on delete cascade,
  edition_code text not null,
  lesson       text not null,                          -- 'L07'
  done_at      timestamptz not null,
  primary key (user_id, edition_code, lesson)
);
alter table user_lesson_done enable row level security;
create policy own_rows on user_lesson_done for select to authenticated using (user_id = (select auth.uid()));

create table user_stats (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  secure     integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table user_stats enable row level security;
create policy own_row on user_stats for select to authenticated using (user_id = (select auth.uid()));

insert into app_config values ('snapshot_max_bytes', '8000000', 'largest progress snapshot one user may store')
on conflict (key) do nothing;

create or replace function app_push_snapshot(p_data jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); n int := octet_length(p_data::text); tz text := cfg('timezone') #>> '{}';
begin
  if me is null then raise exception 'not signed in'; end if;
  if n > (cfg('snapshot_max_bytes') #>> '{}')::int then raise exception 'progress is too large to sync'; end if;
  insert into user_snapshots as s (user_id, data, bytes) values (me, p_data, n)
  on conflict (user_id) do update set data = excluded.data, bytes = excluded.bytes, updated_at = now();

  delete from user_activity_daily where user_id = me and day >= local_today() - 120;
  insert into user_activity_daily (user_id, day, sittings, answers, correct)
  select me, (rh_from_ms((h->>'at')::bigint) at time zone tz)::date as d, count(*),
         sum(coalesce((h->>'total')::int, 0)), sum(coalesce((h->>'right')::int, 0))
  from jsonb_array_elements(case when jsonb_typeof(p_data->'history') = 'array' then p_data->'history' else '[]' end) h
  where (h->>'at') ~ '^\d+$' and rh_from_ms((h->>'at')::bigint) >= now() - interval '120 days'
  group by d
  on conflict (user_id, day) do nothing;

  insert into user_lesson_done (user_id, edition_code, lesson, done_at)
  select me, split_part(k, '|', 1), split_part(k, '|', 2), rh_from_ms(v::bigint)
  from jsonb_each_text(case when jsonb_typeof(p_data->'done') = 'object' then p_data->'done' else '{}' end) e(k, v)
  where k ~ '^[A-Z0-9]+\|L\d+$' and v ~ '^\d+$'
  on conflict do nothing;

  insert into user_stats as s (user_id, secure)
  select me, count(*) from jsonb_each(case when jsonb_typeof(p_data->'cards') = 'object' then p_data->'cards' else '{}' end) c
  where coalesce((c.value->>'box')::int, 0) >= 4
  on conflict (user_id) do update set secure = excluded.secure, updated_at = now();

  update public_profiles set xp = greatest(0, coalesce((p_data->>'points')::int, xp))
  where user_id = me and p_data->>'points' ~ '^\d+$';
  -- the Glim style chosen in the app is the public avatar (a preset, so it is fine for under-18s too)
  update public_profiles set avatar = 'preset:' || (p_data->'profile'->>'glim')
  where user_id = me and p_data->'profile'->>'glim' in ('classic', 'twilight', 'meadow', 'rosewood', 'midnight', 'ocean');
  return rh_ms(now());
end $$;

create or replace function app_pull_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('at', rh_ms(updated_at), 'data', data) from user_snapshots
  where user_id = (select auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 3. Weekly tier leagues: cohorts of about 30 on the same manual and tier, points from the
--    server-verified ledger (user_points_daily). Ranks 1-10 move up, 26-30 move down, no demotion
--    in the first week, equal points share a rank. Closed every Monday by rh_close_tier_week().
-- ---------------------------------------------------------------------
create table tier_results (
  user_id      uuid not null references auth.users(id) on delete cascade,
  week         text not null,
  edition_code text not null,
  tier         text not null,
  new_tier     text not null,
  rank         integer not null,
  points       integer not null,
  moved        text not null check (moved in ('up', 'down', 'stay')),
  created_at   timestamptz not null default now(),
  primary key (user_id, week)
);
alter table tier_results enable row level security;
create policy own_rows on tier_results for select to authenticated using (user_id = (select auth.uid()));

create or replace function rh_tier_cohort(p_edition text, p_tier text, p_week_start date)
returns table (user_id uuid, cohort integer)
language sql stable security definer set search_path = public as $$
  select t.user_id, ((row_number() over (order by md5(t.user_id::text || p_week_start::text)) - 1) / 30)::int
  from tier_members t
  where t.edition_code = p_edition and t.tier = p_tier
    and t.since < (p_week_start + 7)::timestamp at time zone (cfg('timezone') #>> '{}')
    and not is_restricted(t.user_id, array['suspend', 'ban'])
$$;

create or replace function rh_tier_table(p_edition text, p_tier text, p_week_start date, p_cohort int)
returns table (user_id uuid, points integer, rank integer)
language sql stable security definer set search_path = public as $$
  with c as (select user_id from rh_tier_cohort(p_edition, p_tier, p_week_start) where cohort = p_cohort),
  p as (select c.user_id, coalesce(sum(d.points), 0)::int as pts
        from c left join user_points_daily d on d.user_id = c.user_id and d.edition_code = p_edition
          and d.day between p_week_start and p_week_start + 6
        group by c.user_id)
  select user_id, pts, (rank() over (order by pts desc))::int from p
$$;

create or replace function app_join_tier_league(p_edition text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e text := coalesce(p_edition, rh_my_edition());
begin
  if (select auth.uid()) is null then raise exception 'not signed in'; end if;
  if e not in (select my_editions()) then raise exception 'manual not available'; end if;
  insert into tier_members (user_id, edition_code) values ((select auth.uid()), e)
  on conflict (user_id) do update set edition_code = excluded.edition_code;
end $$;

create or replace function app_leave_tier_league() returns void
language sql security definer set search_path = public as $$
  delete from tier_members where user_id = (select auth.uid())
$$;

create or replace function app_tier_standings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := (select auth.uid()); t tier_members; ws date := rh_week_start(); my_cohort int;
begin
  select * into t from tier_members where user_id = me;
  if t.user_id is null then return null; end if;
  select cohort into my_cohort from rh_tier_cohort(t.edition_code, t.tier, ws) where user_id = me;
  if my_cohort is null then my_cohort := 0; end if;
  return jsonb_build_object(
    'id', t.tier || '-' || rh_week_id() || '-' || my_cohort, 'week', rh_week_id(), 'tier', t.tier,
    'endsAt', rh_ms((ws + 7)::timestamp at time zone (cfg('timezone') #>> '{}')),
    'promoteTo', 10, 'demoteFrom', 26, 'firstWeek', t.since > now() - interval '7 days',
    'rows', coalesce((select jsonb_agg(jsonb_build_object('rank', r.rank, 'user', rh_user(r.user_id),
                                                         'points', r.points, 'you', r.user_id = me)
                                      order by r.rank, r.user_id)
                      from rh_tier_table(t.edition_code, t.tier, ws, my_cohort) r), '[]'));
end $$;

-- run every Monday just after midnight (Lagos): records last week's results and moves tiers
create or replace function rh_close_tier_week() returns integer
language plpgsql security definer set search_path = public as $$
declare ws date := rh_week_start() - 7; wk text := rh_week_id(rh_week_start() - 7); g record; r record;
        tiers text[] := array['bronze', 'silver', 'gold', 'jade', 'amethyst', 'lantern']; i int; nt text; mv text; made int := 0;
begin
  for g in select distinct t.edition_code, t.tier, c.cohort
           from tier_members t cross join lateral rh_tier_cohort(t.edition_code, t.tier, ws) c
           where c.user_id = t.user_id loop
    for r in select * from rh_tier_table(g.edition_code, g.tier, ws, g.cohort) loop
      continue when exists (select 1 from tier_results where user_id = r.user_id and week = wk);
      i := array_position(tiers, g.tier);
      if r.points > 0 and r.rank <= 10 and i < 6 then mv := 'up'; nt := tiers[i + 1];
      elsif r.rank >= 26 and i > 1 and (select since from tier_members where user_id = r.user_id) < ws::timestamptz then
        mv := 'down'; nt := tiers[i - 1];
      else mv := 'stay'; nt := g.tier; end if;
      insert into tier_results values (r.user_id, wk, g.edition_code, g.tier, nt, r.rank, r.points, mv);
      update tier_members set tier = nt where user_id = r.user_id;
      if mv = 'up' then
        perform notify(r.user_id, 'system', jsonb_build_object('title', 'You moved up to ' || initcap(nt),
          'body', 'You finished ' || r.rank || ' in your league last week.', 'link', '/arena'));
      end if;
      made := made + 1;
    end loop;
  end loop;
  return made;
end $$;

create or replace function app_last_week_result() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('week', week, 'tier', tier, 'newTier', new_tier, 'rank', rank, 'points', points, 'moved', moved)
  from tier_results where user_id = (select auth.uid()) and week = rh_week_id(rh_week_start() - 7)
$$;

-- ---------------------------------------------------------------------
-- 4. Daily challenge, marked on the server. The questions are the same for everyone on a manual
--    each day (0006 daily_challenge). One attempt; 10 points per right answer.
-- ---------------------------------------------------------------------
insert into app_config values ('daily_minutes', '30', 'a daily challenge must be submitted within this many minutes')
on conflict (key) do nothing;

-- '6TH SEPTEMBER, 2026' -> 2026-09-06 (null when a lesson prints no usable date)
create or replace function rh_lesson_date(p text) returns date
language plpgsql immutable as $$
begin
  return to_date(regexp_replace(upper(p), '(\d+)(ST|ND|RD|TH)\M', '\1'), 'DD MONTH, YYYY');
exception when others then return null;
end $$;

-- 0006's daily challenge drew from the whole manual. Here it only uses lessons whose Sunday has
-- passed, so nobody meets a lesson their class has not reached. Same questions for everyone.
create or replace function daily_challenge(p_edition text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); d text := local_today()::text; mid uuid; hi int;
begin
  if p_edition not in (select my_editions()) then raise exception 'manual not available'; end if;
  select id into mid from matches where kind = 'daily' and edition_code = p_edition and settings->>'day' = d;
  if mid is null then
    select coalesce(max(number), 1) into hi from lessons
    where edition_code = p_edition and status = 'approved' and rh_lesson_date(date_printed) <= local_today();
    insert into matches (edition_code, kind, ranked, status, settings, question_count, seconds_per_question, reveal_seconds)
    values (p_edition, 'daily', true, 'live',
            jsonb_build_object('day', d, 'formats', jsonb_build_array('mcq', 'typed'), 'lessons', jsonb_build_array(1, greatest(hi, 1))),
            10, 25, 5)
    on conflict do nothing returning id into mid;
    if mid is null then
      select id into mid from matches where kind = 'daily' and edition_code = p_edition and settings->>'day' = d;
    else
      perform pick_match_questions(mid, p_edition || d);
    end if;
  end if;
  insert into match_players (match_id, user_id, started_at) values (mid, me, now() + interval '3 seconds')
  on conflict do nothing;
  return mid;
end $$;

create or replace function rh_challenge_view(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'day', m.settings->>'day', 'manual', m.edition_code,
    'items', coalesce((select jsonb_agg(i.uid order by q.position) from match_questions q join items i on i.id = q.item_id
                       where q.match_id = m.id), '[]'),
    'lessons', coalesce((select jsonb_agg(distinct split_part(i.lesson_uid, ':', 2)) from match_questions q join items i on i.id = q.item_id
                         where q.match_id = m.id), '[]'),
    'state', case when mp.awarded then 'final'
                  when exists (select 1 from match_answers a where a.match_id = m.id and a.user_id = mp.user_id) then 'pending'
                  else 'open' end,
    'accepted', (select count(*) from match_answers a where a.match_id = m.id and a.user_id = mp.user_id),
    'correct', mp.correct, 'points', mp.score, 'startedAt', rh_ms(mp.started_at))
  from matches m join match_players mp on mp.match_id = m.id and mp.user_id = (select auth.uid())
  where m.id = p_match
$$;

-- (plpgsql, two statements: a stable view called in the same SQL statement would not see the new row)
create or replace function app_daily_challenge(p_edition text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  mid := daily_challenge(p_edition);
  return rh_challenge_view(mid);
end $$;

create or replace function app_challenge_state(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select rh_challenge_view(p_match)
$$;

-- p_answers: [{"u": item uid, "value": typed text or chosen option text, "ms": response time}]
create or replace function app_submit_challenge(p_match uuid, p_answers jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); m matches; mp match_players; a jsonb; q record; ok boolean; n int := 0;
begin
  select * into m from matches where id = p_match and kind = 'daily';
  select * into mp from match_players where match_id = p_match and user_id = me;
  if m.id is null or mp.user_id is null then raise exception 'not in this challenge'; end if;
  if exists (select 1 from match_answers where match_id = m.id and user_id = me) then
    return rh_challenge_view(m.id);                     -- refreshing never gives a second attempt
  end if;
  if now() > mp.started_at + make_interval(mins => (cfg('daily_minutes') #>> '{}')::int) then
    raise exception 'time is up for today''s challenge';
  end if;
  for a in select * from jsonb_array_elements(coalesce(p_answers, '[]')) loop
    select mq.position, mq.item_id into q from match_questions mq join items i on i.id = mq.item_id
    where mq.match_id = m.id and i.uid = a->>'u';
    continue when q.position is null;
    ok := coalesce(grade_item(q.item_id, a->>'value', null), false) or coalesce(grade_item(q.item_id, null, a->>'value'), false);
    insert into match_answers (match_id, position, user_id, answer_text, chosen_option, is_correct, points, response_ms, flagged)
    values (m.id, q.position, me, left(a->>'value', 2000), null, ok, case when ok then 10 else 0 end,
            greatest(0, coalesce((a->>'ms')::int, 0)), ok and coalesce((a->>'ms')::int, 0) < 800)
    on conflict do nothing;
    n := n + 1;
  end loop;
  update match_players set score = (select coalesce(sum(points), 0) from match_answers where match_id = m.id and user_id = me),
                           correct = (select count(*) filter (where is_correct) from match_answers where match_id = m.id and user_id = me)
  where match_id = m.id and user_id = me returning * into mp;
  if mp.score > 0 then perform award_points(me, m.edition_code, 'daily_challenge', m.id::text, mp.score); end if;
  update match_players set awarded = true where match_id = m.id and user_id = me;
  update public_profiles set xp = xp + mp.correct * 10 where user_id = me;
  return rh_challenge_view(m.id);
end $$;

-- ---------------------------------------------------------------------
-- 5. Hosted rooms and friendly duels (server-timed play from 0006: match_state, answer_match,
--    match_reveal, finish_match). Rooms and duels never add ranking points.
-- ---------------------------------------------------------------------
create or replace function rh_room_view(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'code', m.join_code, 'kind', m.kind, 'status', m.status, 'manual', m.edition_code,
    'host', m.host_id, 'hostName', shown_name(m.host_id), 'createdAt', rh_ms(m.created_at),
    'options', jsonb_build_object('lessons', coalesce(m.settings->'lesson_ids', '[]'), 'formats', coalesce(m.settings->'formats', '["mcq"]'),
                                  'count', m.question_count, 'seconds', m.seconds_per_question,
                                  'cap', coalesce((m.settings->>'max_players')::int, 20)),
    'players', (select count(*) from match_players where match_id = m.id),
    'playerList', (select coalesce(jsonb_agg(rh_user(user_id) order by joined_at), '[]') from match_players where match_id = m.id),
    'amHost', m.host_id = (select auth.uid()), 'amPlayer', is_match_player(m.id),
    'startsAt', rh_ms(m.starts_at), 'invited', m.settings->>'invited')
  from matches m where m.id = p_match
$$;

-- p_options: {"lessons": ["L01", "L03"], "formats": ["mcq","typed"], "count": 15, "seconds": 20, "cap": 100}
create or replace function app_create_room(p_edition text, p_options jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ns int[]; mid uuid;
begin
  ns := array(select substr(v, 2)::int from jsonb_array_elements_text(coalesce(p_options->'lessons', '[]')) v where v ~ '^L\d+$');
  if cardinality(ns) = 0 then raise exception 'choose at least one lesson'; end if;
  select c.match_id into mid from create_match(p_edition, 'room',
    jsonb_build_object('lessons', jsonb_build_array((select min(x) from unnest(ns) x), (select max(x) from unnest(ns) x)),
                       'lesson_ids', p_options->'lessons', 'formats', coalesce(p_options->'formats', '["mcq"]'),
                       'max_players', least(coalesce((p_options->>'cap')::int, 20), 100)),
    least(greatest(coalesce((p_options->>'count')::int, 15), 3), 50),
    least(greatest(coalesce((p_options->>'seconds')::int, 20), 5), 120), false, null) c;
  return rh_room_view(mid);
end $$;

-- a friendly duel: a two-player room, with an invite in the friend's inbox
create or replace function app_create_duel(p_edition text, p_opponent uuid, p_lessons jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_connected((select auth.uid()), p_opponent) then raise exception 'you can only challenge your connections'; end if;
  v := app_create_room(p_edition, jsonb_build_object('lessons', p_lessons, 'formats', '["mcq"]', 'count', 10, 'seconds', 20, 'cap', 2));
  update matches set kind = 'duel', settings = settings || jsonb_build_object('invited', p_opponent) where id = (v->>'id')::uuid;
  perform notify(p_opponent, 'match_invite', jsonb_build_object('title', shown_name((select auth.uid())) || ' challenged you to a friendly match',
    'body', 'Ten questions, no league points. Tap to join.', 'link', '/arena/room/' || (v->>'code')));
  return rh_room_view((v->>'id')::uuid);
end $$;

create or replace function app_room(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select rh_room_view(id) from matches where join_code = upper(p_code) and kind in ('room', 'duel')
$$;

create or replace function app_join_room(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
  mid := join_match(p_code);
  return rh_room_view(mid);
end $$;

create or replace function app_start_room(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform start_match(p_match, 5);
  return rh_room_view(p_match);
end $$;

-- everything to show once a question closes: the answer, the room's result and the KJV text
create or replace function app_room_reveal(p_match uuid, p_position int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  r := match_reveal(p_match, p_position);
  return r || jsonb_build_object('lesson', split_part(r->>'lesson_uid', ':', 2),
                                 'scripture', item_scripture((r->>'item_id')::bigint, 'KJV'));
end $$;

-- ---------------------------------------------------------------------
-- 6. Friends, feed, cheers, co-op
-- ---------------------------------------------------------------------
create table feed_cheers (
  feed_id    text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  created_at timestamptz not null default now(),
  primary key (feed_id, user_id)
);
alter table feed_cheers enable row level security;
create policy own_rows on feed_cheers for select to authenticated using (user_id = (select auth.uid()));

create or replace function rh_friend_ids(p_user uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select case when user_low = p_user then user_high else user_low end from connections
  where status = 'accepted' and p_user in (user_low, user_high)
    and not is_blocked(user_low, user_high)
$$;

create or replace function app_friends() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(rh_user(f) order by shown_name(f)), '[]') from rh_friend_ids((select auth.uid())) f
$$;

create or replace function app_search_users(p_q text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(rh_user(pp.user_id)), '[]') from (
    select user_id from public_profiles
    where visibility = 'public' and length(btrim(p_q)) >= 2
      and handle like lower(ltrim(btrim(p_q), '@')) || '%' and user_id <> (select auth.uid())
      and not is_blocked(user_id, (select auth.uid()))
    order by handle limit 6) pp
$$;

create or replace function app_request_connection(p_user uuid) returns text
language sql security definer set search_path = public as $$
  select request_connection((select handle from public_profiles where user_id = p_user))
$$;

create or replace function app_respond_connection(p_user uuid, p_accept boolean) returns text
language sql security definer set search_path = public as $$
  select respond_connection(p_user, p_accept)
$$;

create or replace function app_friends_feed() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'at')::bigint desc), '[]') from (
    select jsonb_build_object(
      'id', d.user_id || ':' || d.edition_code || ':' || d.lesson, 'user', rh_user(d.user_id),
      'text', 'completed Chapter ' || ltrim(substr(d.lesson, 2), '0'), 'badge', 'chapter', 'at', rh_ms(d.done_at),
      'cheers', (select count(*) from feed_cheers c where c.feed_id = d.user_id || ':' || d.edition_code || ':' || d.lesson),
      'mine', (select kind from feed_cheers c where c.feed_id = d.user_id || ':' || d.edition_code || ':' || d.lesson
               and c.user_id = (select auth.uid()))) x
    from user_lesson_done d join public_profiles pp on pp.user_id = d.user_id and pp.visibility = 'public'
    where d.user_id in (select rh_friend_ids((select auth.uid()))) and d.done_at > now() - interval '7 days'
    order by d.done_at desc limit 8) f
$$;

create or replace function app_cheer(p_feed text, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare owner uuid;
begin
  owner := case when rh_is_uuid(split_part(p_feed, ':', 1)) then split_part(p_feed, ':', 1)::uuid end;
  if owner is null or owner not in (select rh_friend_ids((select auth.uid()))) then raise exception 'friends only'; end if;
  insert into feed_cheers (feed_id, user_id, kind) values (p_feed, (select auth.uid()), left(p_kind, 20))
  on conflict (feed_id, user_id) do update set kind = excluded.kind;
end $$;

-- co-op: you and your most recent connection each count up to five study days this week
-- (a day counts with 10 or more answers); the goal is ten together
create or replace function app_coop() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select (select auth.uid()) as uid),
  partner as (select case when c.user_low = me.uid then c.user_high else c.user_low end as uid
              from connections c, me where c.status = 'accepted' and me.uid in (c.user_low, c.user_high)
              order by c.accepted_at desc nulls last limit 1),
  days as (select a.user_id, least(count(*), 5)::int as n from user_activity_daily a
           where a.day >= rh_week_start() and a.answers >= 10 and a.user_id in (select uid from me union select uid from partner)
           group by a.user_id)
  select jsonb_build_object('id', 'cq-' || rh_week_id(), 'partner', rh_user(p.uid),
    'endsAt', rh_ms((rh_week_start() + 7)::timestamp at time zone (cfg('timezone') #>> '{}')),
    'you', coalesce((select n from days, me where days.user_id = me.uid), 0),
    'them', coalesce((select n from days where days.user_id = p.uid), 0),
    'goal', 10, 'reward', 'twilight', 'pendingOffline', 0)
  from partner p
$$;

create or replace function app_blocked() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(blocked), '[]') from user_blocks where blocker = (select auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 7. Circles (classes): view, chat, coach progress, assignments, coach-set mocks
-- ---------------------------------------------------------------------
create or replace function rh_group_view(p_group uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with g as (select * from groups where id = p_group),
  mem as (select gm.user_id, gm.role from group_members gm where gm.group_id = p_group),
  qn as (select coalesce((g.settings->'quiz_night'->>'weekday')::int, 5) as wd,
                coalesce(g.settings->'quiz_night'->>'time', '19:00') as tm from g),
  nxt as (select ((local_today() + ((qn.wd - extract(isodow from local_today())::int + 7) % 7))::text || ' ' || qn.tm)::timestamp
                 at time zone (cfg('timezone') #>> '{}') as at from qn)
  select jsonb_build_object(
    'id', g.id, 'name', g.name, 'manual', g.edition_code,
    'members', coalesce((select jsonb_agg(rh_user(user_id)) from mem where role = 'student'), '[]'),
    'coaches', coalesce((select jsonb_agg(rh_user(user_id)) from mem where role = 'coach'), '[]'),
    'goal', jsonb_build_object('target', coalesce((g.settings->>'weekly_goal')::int, 200),
      'done', (select coalesce(sum(a.sittings), 0) from user_activity_daily a
               where a.user_id in (select user_id from mem) and a.day >= rh_week_start())),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object('id', ga.id, 'title', ga.title,
        'lessons', coalesce(ga.scope->'lessons', '[]'), 'count', coalesce((ga.scope->>'count')::int, 20),
        'due', rh_ms(ga.due_at), 'by', shown_name(ga.created_by), 'focus', ga.scope->'focus') order by ga.created_at desc)
      from group_assignments ga where ga.group_id = g.id and ga.kind <> 'mock'
        and (ga.due_at is null or ga.due_at > now() - interval '2 days')), '[]'),
    'quizNight', jsonb_build_object('at', rh_ms(case when nxt.at < now() then nxt.at + interval '7 days' else nxt.at end),
      'room', coalesce(g.settings->>'quiz_room', ''), 'signedUp', (select count(*) from mem)),
    'muted', coalesce((select cm.muted_until > now() from conversations c join conversation_members cm on cm.conversation_id = c.id
                       where c.group_id = g.id and cm.user_id = (select auth.uid())), false),
    'joined', exists (select 1 from mem where user_id = (select auth.uid())),
    'joinCode', case when is_group_coach(g.id) then g.join_code end)
  from g, nxt
$$;

create or replace function app_my_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(rh_group_view(g.id) order by g.name), '[]')
  from groups g join group_members gm on gm.group_id = g.id and gm.user_id = (select auth.uid())
  where g.archived_at is null
$$;

create or replace function app_join_group(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  gid := join_group(p_code);
  return rh_group_view(gid);
end $$;

create or replace function app_leave_group(p_group uuid) returns void
language sql security definer set search_path = public as $$
  delete from group_members where group_id = p_group and user_id = (select auth.uid()) and role = 'student'
$$;

create or replace function app_mute_group(p_group uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := open_group_chat('class', p_group);
begin
  insert into conversation_members (conversation_id, user_id, muted_until)
  values (cid, (select auth.uid()), case when p_muted then 'infinity'::timestamptz end)
  on conflict (conversation_id, user_id) do update set muted_until = excluded.muted_until;
end $$;

create or replace function rh_message(m messages) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', m.id || '@' || m.created_at, 'user', rh_user(m.sender_id),
    'text', coalesce(m.body, ''), 'sticker', m.payload->>'sticker', 'at', rh_ms(m.created_at),
    'mine', m.sender_id = (select auth.uid()), 'deleted', m.deleted_at is not null,
    'from', m.sender_id, 'kind', m.kind)
$$;

create or replace function app_group_messages(p_group uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid uuid := open_group_chat('class', p_group); me uuid := (select auth.uid()); out jsonb;
begin
  select coalesce(jsonb_agg(rh_message(x) order by x.created_at), '[]') into out from (
    select * from messages where conversation_id = cid and deleted_at is null
      and not exists (select 1 from user_blocks b where b.blocker = me and b.blocked = messages.sender_id)
    order by created_at desc limit 200) x;
  perform mark_chat_read(cid);
  return out;
end $$;

create or replace function app_send_group_message(p_group uuid, p_text text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid uuid := open_group_chat('class', p_group); mid bigint;
begin
  mid := send_message(cid, left(p_text, 2000));
  return (select rh_message(m) from messages m where m.id = mid order by created_at desc limit 1);
end $$;

create or replace function app_group_progress(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_group_coach(p_group) then raise exception 'only coaches of this class can see its progress'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user', rh_user(gm.user_id),
      'sittings', (select coalesce(sum(sittings), 0) from user_activity_daily a where a.user_id = gm.user_id and a.day > local_today() - 14),
      'accuracy', (select coalesce(sum(correct)::real / nullif(sum(answers), 0), 0) from user_activity_daily a
                   where a.user_id = gm.user_id and a.day > local_today() - 30),
      'secure', coalesce((select secure from user_stats s where s.user_id = gm.user_id), 0),
      'lastActive', coalesce(rh_ms((select max(day) from user_activity_daily a where a.user_id = gm.user_id)::timestamptz), 0))), '[]')
    from group_members gm where gm.group_id = p_group and gm.role = 'student');
end $$;

-- p_a: {"title", "lessons": ["L07"], "count": 20, "due": ms, "focus": ["verses"]}
create or replace function app_create_assignment(p_group uuid, p_a jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a group_assignments; me uuid := (select auth.uid());
begin
  if not is_group_coach(p_group) then raise exception 'only coaches of this class can set work'; end if;
  insert into group_assignments (group_id, kind, title, scope, due_at, created_by)
  values (p_group, 'review_target', left(coalesce(p_a->>'title', 'Practice'), 120),
          jsonb_build_object('lessons', coalesce(p_a->'lessons', '[]'), 'count', coalesce((p_a->>'count')::int, 20), 'focus', p_a->'focus'),
          case when p_a->>'due' ~ '^\d+$' then rh_from_ms((p_a->>'due')::bigint) end, me)
  returning * into a;
  perform notify(gm.user_id, 'assignment', jsonb_build_object('title', 'New from ' || shown_name(me) || ': ' || a.title,
            'body', coalesce('Due ' || to_char(a.due_at at time zone (cfg('timezone') #>> '{}'), 'Dy DD Mon'), 'No due date'), 'link', '/circle/' || p_group))
  from group_members gm where gm.group_id = p_group and gm.role = 'student';
  return jsonb_build_object('id', a.id, 'title', a.title, 'lessons', a.scope->'lessons', 'count', (a.scope->>'count')::int,
                            'due', rh_ms(a.due_at), 'by', shown_name(me), 'focus', a.scope->'focus');
end $$;

-- p_m: {"title", "lessons": ["L01".."L13"], "count": 50, "minutes": 45, "due": ms}
create or replace function app_set_mock(p_group uuid, p_m jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a group_assignments; me uuid := (select auth.uid());
begin
  if not is_group_coach(p_group) then raise exception 'only coaches of this class can set mocks'; end if;
  insert into group_assignments (group_id, kind, title, scope, due_at, created_by)
  values (p_group, 'mock', left(coalesce(p_m->>'title', 'Mock'), 120),
          jsonb_build_object('lessons', coalesce(p_m->'lessons', '[]'), 'count', coalesce((p_m->>'count')::int, 50),
                             'minutes', coalesce((p_m->>'minutes')::int, 45)),
          case when p_m->>'due' ~ '^\d+$' then rh_from_ms((p_m->>'due')::bigint) end, me)
  returning * into a;
  perform notify(gm.user_id, 'assignment', jsonb_build_object('title', shown_name(me) || ' set a mock: ' || a.title,
            'body', (a.scope->>'count') || ' questions · ' || (a.scope->>'minutes') || ' minutes', 'link', '/circle/' || p_group))
  from group_members gm where gm.group_id = p_group and gm.role = 'student';
  return (select x from jsonb_array_elements(app_mocks_for(p_group)) x where x->>'id' = a.id::text);
end $$;

create or replace function app_mocks_for(p_group uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', ga.id, 'group', ga.group_id, 'title', ga.title,
    'lessons', coalesce(ga.scope->'lessons', '[]'), 'count', coalesce((ga.scope->>'count')::int, 50),
    'minutes', coalesce((ga.scope->>'minutes')::int, 45), 'due', rh_ms(ga.due_at), 'by', shown_name(ga.created_by),
    'at', rh_ms(ga.created_at)) order by ga.created_at desc), '[]')
  from group_assignments ga
  where ga.group_id = p_group and ga.kind = 'mock'
    and exists (select 1 from group_members gm where gm.group_id = p_group and gm.user_id = (select auth.uid()))
$$;

create or replace function app_submit_mock(p_assignment uuid, p_score real, p_used_s int) returns void
language plpgsql security definer set search_path = public as $$
declare a group_assignments; g groups; me uuid := (select auth.uid());
begin
  select * into a from group_assignments where id = p_assignment and kind = 'mock';
  select * into g from groups where id = a.group_id;
  if a.id is null or not exists (select 1 from group_members where group_id = g.id and user_id = me) then
    raise exception 'not your class';
  end if;
  insert into mocks (id, user_id, edition_code, scope, time_limit_s, started_at, submitted_at, score, assignment_id)
  values (gen_random_uuid(), me, g.edition_code, a.scope, coalesce((a.scope->>'minutes')::int, 45) * 60,
          now() - make_interval(secs => greatest(0, coalesce(p_used_s, 0))), now(), least(greatest(p_score, 0), 1), a.id);
end $$;

create or replace function app_submissions(p_assignment uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a group_assignments;
begin
  select * into a from group_assignments where id = p_assignment;
  if a.id is null or not is_group_coach(a.group_id) then raise exception 'only coaches of this class can see its results'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('uid', s.user_id, 'user', rh_user(s.user_id), 'score', s.score,
      'at', rh_ms(s.submitted_at), 'usedS', s.used,
      'flagged', case when s.used < coalesce((a.scope->>'minutes')::int, 45) * 60 * 0.6 and s.score > 0.95
                      then 'Very fast and near-perfect: check fair play' end) order by s.score desc), '[]')
    from (select distinct on (mk.user_id) mk.user_id, mk.score, mk.submitted_at,
                 extract(epoch from mk.submitted_at - mk.started_at)::int as used
          from mocks mk where mk.assignment_id = a.id and mk.submitted_at is not null
          order by mk.user_id, mk.score desc) s);
end $$;

-- ---------------------------------------------------------------------
-- 8. Reports (user, message and content), moderation queue
-- ---------------------------------------------------------------------
create table content_reports (
  id         uuid primary key default gen_random_uuid(),
  reporter   uuid not null references auth.users(id) on delete cascade,
  target     text not null,                              -- item uid or lesson uid
  reason     text not null,
  note       text check (length(note) <= 2000),
  status     text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz
);
alter table content_reports enable row level security;
create policy reporter_or_editor on content_reports for select to authenticated
  using (reporter = (select auth.uid()) or is_staff(array['content_editor']));

create or replace function rh_reason(p text) returns text
language sql immutable as $$
  select case when p ilike '%bully%' or p ilike '%unkind%' then 'harassment'
              when p ilike '%inappropriate%' then 'inappropriate'
              when p ilike '%spam%' then 'spam'
              when p ilike '%unsafe%' then 'child_safety'
              when p ilike '%cheat%' then 'cheating'
              when p ilike '%imperson%' then 'impersonation' else 'other' end
$$;

-- p_kind: 'message' (target 'id@created_at'), 'user' (target user id, or a circle id) or 'content' (item uid)
create or replace function app_report(p_kind text, p_target text, p_reason text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rid uuid; mid bigint; mat timestamptz;
begin
  if p_kind = 'content' then
    insert into content_reports (reporter, target, reason, note) values ((select auth.uid()), p_target, p_reason, nullif(p_note, ''))
    returning id into rid;
  elsif p_kind = 'message' then
    mid := split_part(p_target, '@', 1)::bigint; mat := split_part(p_target, '@', 2)::timestamptz;
    rid := report(rh_reason(p_reason), null, mid, mat, null, null, left(p_reason || coalesce(': ' || nullif(p_note, ''), ''), 2000));
  else
    rid := report(rh_reason(p_reason),
                  case when rh_is_uuid(p_target) and exists (select 1 from public_profiles where user_id = p_target::uuid) then p_target::uuid end,
                  null, null, null, null,
                  left(p_reason || coalesce(': ' || nullif(p_note, ''), '') ||
                       case when rh_is_uuid(p_target) and exists (select 1 from groups where id = p_target::uuid) then ' (circle ' || p_target || ')' else '' end, 2000));
  end if;
  return jsonb_build_object('id', rid, 'ref', 'RPT-' || upper(substr(rid::text, 1, 5)), 'kind', p_kind, 'target', p_target,
                            'reason', p_reason, 'note', coalesce(p_note, ''), 'at', rh_ms(now()), 'state', 'open');
end $$;

create or replace function app_moderation_queue() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'at')::bigint desc), '[]') from (
    select jsonb_build_object('id', r.id, 'ref', 'RPT-' || upper(substr(r.id::text, 1, 5)),
      'kind', case when r.message_id is not null then 'message' else 'user' end,
      'target', coalesce(shown_name(r.target_user), '') ||
                coalesce(' · “' || left((select m.body from messages m where m.id = r.message_id and m.created_at = r.message_created_at), 120) || '”', ''),
      'targetUser', r.target_user, 'reason', r.reason, 'note', coalesce(r.detail, ''), 'at', rh_ms(r.created_at),
      'state', case when r.status = 'open' then 'open' else 'resolved' end) x
    from reports r where is_staff(array['moderator']) and (r.status = 'open' or r.handled_at > now() - interval '7 days')
    union all
    select jsonb_build_object('id', c.id, 'ref', 'RPT-' || upper(substr(c.id::text, 1, 5)), 'kind', 'content',
      'target', c.target, 'reason', c.reason, 'note', coalesce(c.note, ''), 'at', rh_ms(c.created_at),
      'state', case when c.status = 'open' then 'open' else 'resolved' end)
    from content_reports c where is_staff(array['content_editor']) and (c.status = 'open' or c.handled_at > now() - interval '7 days')
  ) q
$$;

create or replace function app_resolve_report(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if is_staff(array['moderator']) then
    update reports set status = 'dismissed', handled_by = (select auth.uid()), handled_at = now() where id = p_id and status = 'open';
  end if;
  if is_staff(array['content_editor']) then
    update content_reports set status = 'resolved', handled_by = (select auth.uid()), handled_at = now() where id = p_id and status = 'open';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. Inbox, safety settings, direct messages, guardian consent requests, email queue
-- ---------------------------------------------------------------------
create or replace function app_inbox() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id::text, 'at', rh_ms(i.created_at), 'read', i.read_at is not null,
    'kind', case i.kind when 'moderation' then 'moderation' when 'assignment' then 'assignment'
                        when 'league_invite' then 'league' when 'match_result' then 'league' when 'match_invite' then 'league'
                        when 'message' then 'dm' else 'system' end,
    'title', coalesce(i.payload->>'title', case i.kind
       when 'connection_request' then coalesce(i.payload->>'name', 'Someone') || ' wants to connect'
       when 'connection_accepted' then coalesce(i.payload->>'name', 'Someone') || ' accepted your request'
       when 'manual_retired' then 'Manual ' || coalesce(i.payload->>'code', '') || ' has been retired'
       when 'moderation' then case i.payload->>'action' when 'warn' then 'You have received a warning'
         when 'mute' then 'Messaging is paused on your account' when 'suspend' then 'Your account is suspended'
         when 'ban' then 'Your account is banned from community features' when 'remove_message' then 'A message you sent was removed'
         when 'reset_points' then 'Your ranking points were reset' when 'lift' then 'A restriction on your account was lifted'
         else 'A note from the safety team' end
       else 'Notice' end),
    'body', coalesce(i.payload->>'body', case i.kind
       when 'connection_request' then 'Accept to see each other''s milestones and to message.'
       when 'manual_retired' then 'Your history stays readable. ' || coalesce(i.payload->>'note', '')
       when 'moderation' then 'Reason: ' || coalesce(i.payload->>'reason', 'community guidelines') ||
         coalesce('. Until ' || to_char((i.payload->>'until')::timestamptz, 'DD Mon YYYY'), '') ||
         '. Your private study is not affected. Use Report a problem to appeal.'
       else '' end),
    'link', i.payload->>'link',
    'action', case when i.kind = 'connection_request' then jsonb_build_object('type', 'connection', 'user', i.payload->>'from') end)
    order by i.created_at desc), '[]')
  from (select * from inbox where user_id = (select auth.uid()) order by created_at desc limit 80) i
$$;

create or replace function app_mark_read(p_ids text[]) returns void
language sql security definer set search_path = public as $$
  update inbox set read_at = now() where user_id = (select auth.uid()) and read_at is null
    and id::text = any(p_ids)
$$;

-- p_s: {"birthYear": 2009, "dmFrom": "connections", "visibility": "public"}
create or replace function app_set_safety(p_s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid());
begin
  if p_s->>'birthYear' ~ '^\d{4}$' then                 -- set once; changes go through support
    update profiles set birth_year = (p_s->>'birthYear')::smallint where user_id = me and birth_year is null;
  end if;
  update public_profiles set
    dm_policy = case when p_s->>'dmFrom' in ('everyone', 'connections', 'nobody') then p_s->>'dmFrom' else dm_policy end,
    visibility = case when p_s->>'visibility' in ('public', 'hidden') then p_s->>'visibility' else visibility end
  where user_id = me;
end $$;

create or replace function app_can_message(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := (select auth.uid()); pol text;
begin
  if can_direct_message(me, p_user) then return jsonb_build_object('ok', true); end if;
  if is_restricted(me, array['mute', 'suspend', 'ban']) then
    return jsonb_build_object('ok', false, 'why', 'Messaging is paused on your account. Check your inbox for the notice.');
  elsif is_blocked(me, p_user) then
    return jsonb_build_object('ok', false, 'why', 'You cannot message this person.');
  elsif is_minor(me) and not has_guardian_consent(me) then
    return jsonb_build_object('ok', false, 'why', 'Under-18s need a guardian’s consent before direct messages. Request it in You → Privacy.');
  elsif is_minor(me) or is_minor(p_user) then
    return jsonb_build_object('ok', false, 'why', 'Under-18s can only message other under-18s in their class, with consent on both sides.');
  end if;
  pol := coalesce((select dm_policy from public_profiles where user_id = p_user), 'connections');
  return jsonb_build_object('ok', false, 'why', case when pol = 'nobody' then 'This person is not taking direct messages.'
                                                      else 'This person only takes messages from connections. Connect first.' end);
end $$;

create or replace function rh_dm(m messages, p_other uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', m.id || '@' || m.created_at, 'from', m.sender_id,
    'to', case when m.sender_id = (select auth.uid()) then p_other else (select auth.uid()) end,
    'text', coalesce(m.body, ''), 'sticker', m.payload->>'sticker', 'at', rh_ms(m.created_at), 'deleted', m.deleted_at is not null)
$$;

create or replace function app_threads() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select (select auth.uid()) as uid),
  mine as (select c.id, cm.last_read_at, (select o.user_id from conversation_members o where o.conversation_id = c.id and o.user_id <> me.uid limit 1) as other
           from conversations c join conversation_members cm on cm.conversation_id = c.id, me
           where c.kind = 'direct' and cm.user_id = me.uid)
  select coalesce(jsonb_agg(jsonb_build_object('with', rh_user(t.other),
      'last', (select rh_dm(m, t.other) from messages m where m.conversation_id = t.id order by m.created_at desc limit 1),
      'unread', (select count(*) from messages m, me where m.conversation_id = t.id and m.sender_id <> me.uid
                 and m.created_at > coalesce(t.last_read_at, '-infinity')))
    order by (select max(created_at) from messages m where m.conversation_id = t.id) desc nulls last), '[]')
  from mine t where t.other is not null and not is_blocked((select uid from me), t.other)
$$;

create or replace function app_dm(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); cid uuid; out jsonb;
begin
  select id into cid from conversations where direct_key = least(me, p_user)::text || ':' || greatest(me, p_user)::text;
  if cid is null then return '[]'; end if;
  select coalesce(jsonb_agg(rh_dm(m, p_user) order by m.created_at), '[]') into out
  from (select * from messages where conversation_id = cid order by created_at desc limit 300) m;
  perform mark_chat_read(cid);
  return out;
end $$;

create or replace function app_send_dm(p_user uuid, p_text text, p_sticker text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); cid uuid; mid bigint;
begin
  if length(coalesce(p_text, '')) > 2000 then raise exception 'Messages are limited to 2,000 characters.'; end if;
  cid := start_direct_chat(p_user);
  mid := send_message(cid, coalesce(p_text, ''), case when p_sticker is not null then 'sticker' else 'text' end,
                      case when p_sticker is not null then jsonb_build_object('sticker', left(p_sticker, 16)) else '{}' end);
  if not exists (select 1 from inbox where user_id = p_user and kind = 'message' and read_at is null
                 and payload->>'from' = me::text and created_at > now() - interval '1 hour') then
    perform notify(p_user, 'message', jsonb_build_object('from', me, 'title', 'Message from ' || shown_name(me),
                                                         'body', 'Open to read and reply.', 'link', '/messages/' || me));
  end if;
  return (select rh_dm(m, p_user) from messages m where m.id = mid order by created_at desc limit 1);
end $$;

create or replace function app_delete_dm(p_id text) returns void
language sql security definer set search_path = public as $$
  select delete_message(split_part(p_id, '@', 1)::bigint, split_part(p_id, '@', 2)::timestamptz)
$$;

create table guardian_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  contact    text not null check (length(contact) between 5 and 200),
  state      text not null default 'pending' check (state in ('pending', 'granted', 'declined')),
  created_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz
);
alter table guardian_requests enable row level security;
create policy own_or_support on guardian_requests for select to authenticated
  using (user_id = (select auth.uid()) or is_staff(array['support']));

create table email_outbox (                            -- sent by the mail job (an Edge Function or worker)
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  to_address text not null,
  subject    text not null,
  body       text not null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  error      text
);
alter table email_outbox enable row level security;
create policy own_rows on email_outbox for select to authenticated using (user_id = (select auth.uid()));

create or replace function rh_consent_view(r guardian_requests) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'uid', r.user_id, 'handle', (select handle from public_profiles where user_id = r.user_id),
                            'guardian', r.contact, 'at', rh_ms(r.created_at), 'state', r.state)
$$;

create or replace function app_request_consent(p_contact text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r guardian_requests; me uuid := (select auth.uid());
begin
  if (select count(*) from guardian_requests where user_id = me and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Too many requests today. Try again tomorrow.';
  end if;
  insert into guardian_requests (user_id, contact) values (me, lower(btrim(p_contact))) returning * into r;
  if r.contact like '%@%' then
    insert into email_outbox (user_id, to_address, subject, body) values (me, r.contact,
      'Please approve messaging on Rhemlo',
      '@' || (select handle from public_profiles where user_id = me) || ' asked for your consent to message classmates on Rhemlo. '
      || 'Reply to this email or contact your church coordinator to agree.');
  end if;
  perform notify(me, 'system', jsonb_build_object('title', 'Consent request sent',
    'body', 'We contacted ' || r.contact || '. Direct messages open once they agree.'));
  return rh_consent_view(r);
end $$;

create or replace function app_consents() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(array['support']) then raise exception 'support staff only'; end if;
  return (select coalesce(jsonb_agg(rh_consent_view(r) order by (r.state = 'pending') desc, r.created_at desc), '[]')
          from guardian_requests r);
end $$;

create or replace function app_decide_consent(p_id uuid, p_granted boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r guardian_requests;
begin
  if not is_staff(array['support']) then raise exception 'support staff only'; end if;
  update guardian_requests set state = case when p_granted then 'granted' else 'declined' end,
         decided_by = (select auth.uid()), decided_at = now()
  where id = p_id and state = 'pending' returning * into r;
  if r.id is null then return; end if;
  if p_granted then
    insert into guardian_consents (user_id, guardian_name, guardian_contact, method, recorded_by)
    values (r.user_id, r.contact, r.contact, 'in_app', (select auth.uid()));
  end if;
  perform notify(r.user_id, 'system', jsonb_build_object(
    'title', case when p_granted then 'Guardian consent received' else 'Guardian consent declined' end,
    'body', case when p_granted then 'Direct messages with your classmates are now open.' else 'Direct messages stay off. Circles and study are unaffected.' end));
end $$;

create or replace function app_email(p_subject text, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into email_outbox (user_id, to_address, subject, body)
  select id, email, left(p_subject, 200), left(p_body, 20000) from auth.users where id = (select auth.uid()) and email is not null
$$;

create or replace function app_outbox() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id::text, 'at', rh_ms(created_at), 'subject', subject, 'body', body)
                            order by created_at desc), '[]')
  from (select * from email_outbox where user_id = (select auth.uid()) order by created_at desc limit 30) o
$$;

-- ---------------------------------------------------------------------
-- 10. Leaderboards, seasons, private leagues
-- ---------------------------------------------------------------------
create or replace function rh_board_rows(p jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('rank', (r->>'rank')::int, 'user', rh_user((r->>'user_id')::uuid),
      'points', (r->>'points')::numeric::int, 'you', (r->>'user_id')::uuid = (select auth.uid()),
      'hidden', coalesce((select visibility = 'hidden' from public_profiles where user_id = (r->>'user_id')::uuid), false))
    order by (r->>'rank')::int), '[]')
  from jsonb_array_elements(p) r
$$;

create or replace function app_leaderboard(p_scope text, p_edition text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare rows jsonb; me uuid := (select auth.uid()); org uuid;
begin
  if p_scope = 'week' then select jsonb_agg(to_jsonb(b)) into rows from weekly_board(p_edition, 200) b;
  elsif p_scope = 'friends' then select jsonb_agg(to_jsonb(b)) into rows from friends_board(p_edition) b;
  elsif p_scope = 'org' then
    select coalesce((select home_org_id from public_profiles where user_id = me),
                    (select org_id from org_members where user_id = me order by joined_at limit 1)) into org;
    if org is null then return '[]'; end if;
    select jsonb_agg(to_jsonb(b)) into rows from org_board(org, p_edition) b;
  else select jsonb_agg(to_jsonb(b)) into rows from leaderboard_top(p_edition, case when p_scope = 'all' then 'all' else 'season' end, 200) b;
  end if;
  rows := coalesce(rows, '[]');
  if not exists (select 1 from jsonb_array_elements(rows) r where (r->>'user_id')::uuid = me) then
    rows := rows || jsonb_build_array(jsonb_build_object('rank', jsonb_array_length(rows) + 1, 'user_id', me, 'points', 0));
  end if;
  return rh_board_rows(rows);
end $$;

create or replace function app_seasons() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', name, 'name', name, 'from', starts_at::date, 'to', ends_at::date,
                                               'active', active) order by starts_at desc), '[]')
  from (select name, min(starts_at) starts_at, max(ends_at) ends_at, bool_or(status = 'active') active
        from seasons group by name) s
$$;

create or replace function rh_league_view(p_league uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', l.id, 'name', l.name, 'code', l.invite_code, 'owner', l.created_by,
    'members', coalesce((select jsonb_agg(e.user_id) from league_entries e where e.league_id = l.id and e.user_id is not null), '[]'),
    'createdAt', rh_ms(l.created_at), 'note', l.settings->>'note', 'ownerUser', rh_user(l.created_by), 'manual', l.edition_code)
  from leagues l where l.id = p_league
$$;

create or replace function app_my_leagues() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(rh_league_view(l.id) order by l.created_at desc), '[]')
  from leagues l where l.kind = 'classic' and l.status = 'open' and in_league(l.id)
$$;

create or replace function app_create_league(p_name text, p_note text default null, p_edition text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  select c.league_id into lid from create_league(coalesce(p_edition, rh_my_edition()), btrim(p_name)) c;
  if nullif(btrim(p_note), '') is not null then
    update leagues set settings = settings || jsonb_build_object('note', left(btrim(p_note), 120)) where id = lid;
  end if;
  return rh_league_view(lid);
end $$;

create or replace function app_league_preview(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lid uuid := (select id from leagues where invite_code = upper(p_code) and kind = 'classic');
begin
  if lid is null then raise exception 'No league uses that invite code. Check the link with whoever sent it.'; end if;
  return rh_league_view(lid);
end $$;

create or replace function app_join_league_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  lid := join_league(p_code);
  return rh_league_view(lid);
end $$;

create or replace function app_leave_private(p_league uuid) returns void
language sql security definer set search_path = public as $$
  select leave_league(p_league)
$$;

create or replace function app_league_table(p_league uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not in_league(p_league) then raise exception 'not in this league'; end if;
  perform ensure_league_standings(p_league);
  return rh_board_rows((select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'user_id', user_id, 'points', points)), '[]')
                        from league_standings_rows where league_id = p_league and user_id is not null));
end $$;

-- ---------------------------------------------------------------------
-- 11. Administration
-- ---------------------------------------------------------------------
create or replace function app_catalogue() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', e.code, 'title', e.title,
      'status', case when e.status = 'retired' then 'retired' when e.status <> 'published' then 'draft'
                     when e.access = 'licensed' then 'licensed' else 'published' end,
      'version', coalesce('published ' || to_char(e.published_at, 'DD Mon YYYY'), 'not published'),
      'checksum', 'sha256:' || left(e.source_sha256, 4) || '…' || right(e.source_sha256, 4),
      'orgs', coalesce((select jsonb_agg(oa.org_id) from org_edition_access oa where oa.edition_code = e.code), '[]'),
      'retiredAt', rh_ms(e.retired_at), 'unlocked', e.code in (select my_editions()))
    order by e.status = 'retired', e.code), '[]')
  from editions e where e.status in ('published', 'retired') or is_staff(array['content_editor'])
$$;

-- p: {"status": "published" | "licensed" | "retired", "orgs": [org ids]}
create or replace function app_set_manual(p_code text, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare st text := p->>'status';
begin
  if not is_staff(array['content_editor']) then raise exception 'content editors only'; end if;
  if st = 'retired' then perform retire_manual(p_code, null, 'Retired by an administrator'); return; end if;
  if st in ('published', 'licensed') then
    update editions set status = 'published', access = case when st = 'licensed' then 'licensed' else 'open' end,
      published_at = coalesce(published_at, now()), retired_at = null where code = p_code;
  end if;
  if p ? 'orgs' then
    insert into org_edition_access (org_id, edition_code)
    select (o #>> '{}')::uuid, p_code from jsonb_array_elements(p->'orgs') o where rh_is_uuid(o #>> '{}')
    on conflict do nothing;
  end if;
end $$;

-- p_s: {"name", "from": "2027-09-05", "to": "2028-08-27", "active": true}; applies to every published manual
create or replace function app_save_season(p_s jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  if not is_staff(array['super_admin']) then raise exception 'administrators only'; end if;
  for e in select code from editions where status = 'published' loop
    if coalesce((p_s->>'active')::boolean, false) then
      update seasons set status = 'final' where edition_code = e and status = 'active' and name <> p_s->>'name';
    end if;
    insert into seasons (edition_code, name, starts_at, ends_at, status)
    values (e, p_s->>'name', (p_s->>'from')::date, (p_s->>'to')::date + 1,
            case when coalesce((p_s->>'active')::boolean, false) then 'active' when (p_s->>'from')::date > current_date then 'upcoming' else 'final' end)
    on conflict (edition_code, name) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = excluded.status;
  end loop;
end $$;

create or replace function app_orgs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(array['support']) then raise exception 'administrators only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'code', coalesce(o.settings->>'code', ''),
      'manuals', coalesce((select jsonb_agg(oa.edition_code) from org_edition_access oa where oa.org_id = o.id), '[]'),
      'members', (select count(*) from org_members m where m.org_id = o.id),
      'region', coalesce((select p.name from organisations p where p.id = o.parent_id), initcap(o.kind)))
    order by o.name), '[]') from organisations o);
end $$;

-- p_o: {"id"?, "name", "code", "manuals": ["AD2627"], "kind"?}
create or replace function app_save_org(p_o jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare oid uuid := case when rh_is_uuid(p_o->>'id') then (p_o->>'id')::uuid end;
begin
  if not is_staff(array['super_admin']) then raise exception 'administrators only'; end if;
  if oid is null or not exists (select 1 from organisations where id = oid) then
    insert into organisations (name, kind, settings) values (p_o->>'name', coalesce(p_o->>'kind', 'parish'),
      jsonb_build_object('code', coalesce(p_o->>'code', ''))) returning id into oid;
  else
    update organisations set name = p_o->>'name', settings = settings || jsonb_build_object('code', coalesce(p_o->>'code', ''))
    where id = oid;
  end if;
  if p_o ? 'manuals' then
    delete from org_edition_access where org_id = oid
      and edition_code not in (select v from jsonb_array_elements_text(p_o->'manuals') v);
    insert into org_edition_access (org_id, edition_code)
    select oid, v from jsonb_array_elements_text(p_o->'manuals') v where v in (select code from editions)
    on conflict do nothing;
  end if;
end $$;

create or replace function rh_sanction(a moderation_actions) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', a.id::text, 'uid', a.user_id,
    'kind', case a.action when 'remove_message' then 'remove' when 'reset_points' then 'reset' else a.action end,
    'reason', a.reason, 'at', rh_ms(a.created_at), 'until', rh_ms(a.until), 'by', shown_name(a.acted_by))
$$;

create or replace function app_people(p_q text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(array['moderator', 'support']) then raise exception 'staff only'; end if;
  return (select coalesce(jsonb_agg(rh_user(pp.user_id) || jsonb_build_object('handle', pp.handle,
      'sanctions', coalesce((select jsonb_agg(rh_sanction(a) order by a.created_at) from moderation_actions a where a.user_id = pp.user_id), '[]'))
      order by pp.handle), '[]')
    from (select * from public_profiles where coalesce(btrim(p_q), '') = '' or handle like '%' || lower(btrim(p_q)) || '%'
            or lower(coalesce(display_name, '')) like '%' || lower(btrim(p_q)) || '%'
          order by handle limit 30) pp);
end $$;

create or replace function app_sanction(p_user uuid, p_kind text, p_reason text, p_days int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare act text := case p_kind when 'remove' then 'remove_message' when 'reset' then 'reset_points' else p_kind end;
        a moderation_actions;
begin
  if act not in ('warn', 'mute', 'suspend', 'ban', 'remove_message', 'reset_points', 'lift') then raise exception 'unknown action'; end if;
  perform moderate(p_user, act, coalesce(nullif(btrim(p_reason), ''), 'Community guidelines'),
                   case when p_days is not null and act in ('mute', 'suspend') then now() + make_interval(days => p_days) end);
  if act = 'reset_points' then
    update leaderboard set points = 0 where user_id = p_user;
    delete from user_points_daily where user_id = p_user;
    delete from league_standings_cache where league_id in (select league_id from league_entries where user_id = p_user);
  end if;
  select * into a from moderation_actions where user_id = p_user order by created_at desc limit 1;
  return rh_sanction(a);
end $$;

create or replace function app_my_sanctions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(rh_sanction(a)), '[]') from moderation_actions a
  where a.user_id = (select auth.uid()) and a.action <> 'lift' and (a.until is null or a.until > now())
    and not exists (select 1 from moderation_actions l where l.user_id = a.user_id and l.action = 'lift' and l.created_at > a.created_at)
$$;

create table item_verifications (
  edition_code text not null references editions(code),
  item_uid     text not null,
  state        text not null check (state in ('approved', 'corrected', 'flagged')),
  note         text,
  correction   text,
  verified_by  uuid references auth.users(id) on delete set null,
  verified_at  timestamptz not null default now(),
  primary key (edition_code, item_uid)
);
alter table item_verifications enable row level security;
create policy editors_read on item_verifications for select to authenticated using (is_staff(array['content_editor']));

create or replace function app_verifications(p_edition text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(array['content_editor']) then raise exception 'content editors only'; end if;
  return (select coalesce(jsonb_object_agg(v.item_uid, jsonb_build_object('u', v.item_uid, 'state', v.state, 'note', coalesce(v.note, ''),
            'correction', v.correction, 'by', shown_name(v.verified_by), 'at', rh_ms(v.verified_at))), '{}')
          from item_verifications v where v.edition_code = p_edition);
end $$;

-- p_v: {"u": item uid, "state": "approved" | "corrected" | "flagged", "note", "correction"}
create or replace function app_verify(p_edition text, p_v jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff(array['content_editor']) then raise exception 'content editors only'; end if;
  insert into item_verifications (edition_code, item_uid, state, note, correction, verified_by)
  values (p_edition, p_v->>'u', p_v->>'state', nullif(p_v->>'note', ''), nullif(p_v->>'correction', ''), (select auth.uid()))
  on conflict (edition_code, item_uid) do update set state = excluded.state, note = excluded.note, correction = excluded.correction,
    verified_by = excluded.verified_by, verified_at = now();
end $$;

create or replace function app_anomalies(p_edition text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(array['content_editor']) then raise exception 'content editors only'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', a.id::text, 'manual', l.edition_code,
      'lesson', 'L' || lpad(l.number::text, 2, '0'), 'where', a.location_uid, 'kind', initcap(replace(a.type, '_', ' ')),
      'detail', a.detail, 'state', case when a.decision is null then 'open' when a.decision = 'fixed' then 'fixed' else 'kept' end,
      'at', rh_ms(coalesce(a.decided_at, l.approved_at, now()))) order by a.decision is not null, l.number, a.id), '[]')
    from anomalies a join lessons l on l.uid = a.lesson_uid where l.edition_code = p_edition);
end $$;

create or replace function app_set_anomaly(p_id text, p_state text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff(array['content_editor']) then raise exception 'content editors only'; end if;
  update anomalies set decision = case when p_state = 'open' then null else p_state end,
                       decided_at = case when p_state = 'open' then null else now() end
  where id = p_id::bigint;
end $$;

-- ---------------------------------------------------------------------
-- 12. Permissions and scheduled jobs
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'app\_%' or p.proname like 'rh\_%') loop
    execute format('revoke execute on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', f.sig);
    end if;
    if f.proname like 'app\_%' or f.proname in ('rh_ms', 'rh_from_ms', 'rh_cw', 'rh_is_uuid', 'rh_week_start', 'rh_week_id', 'rh_reason') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
  -- helpers that the app_* functions call while running as the definer stay private;
  -- rh_user and friends are also safe to call directly, but there is no need to
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function rh_close_tier_week() to service_role;
  end if;
end $$;

-- pg_cron (enable it in Supabase: Database -> Extensions). Times are UTC; Lagos is UTC+1.
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('rhemlo-close-tier-week', '5 23 * * 0', 'select rh_close_tier_week()');
    perform cron.schedule('rhemlo-log-partitions', '0 2 1 * *', 'select ensure_log_partitions(1, 3)');
    perform cron.schedule('rhemlo-prune', '30 2 * * *', 'select prune_old_rows()');
  end if;
end $$;

-- Realtime: rooms, scores, chat and inbox already publish from 0006; add live room settings
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table tier_results; exception when duplicate_object then null; end;
  end if;
end $$;
