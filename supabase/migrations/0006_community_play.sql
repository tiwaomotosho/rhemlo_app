-- =====================================================================
-- Rhemlo · 0006_community_play.sql
-- The social, competitive layer. Everything here is added on top of 0001-0005; nothing earlier
-- changes shape except: editions gains 'retired', profiles gains birth_year, mocks are untouched.
--
--   * platform staff roles (content editor, moderator, support, super admin)
--   * public profiles (handle, avatar), connections, blocks
--   * server marking: rhemlo_norm() mirrors the Python/TypeScript marking rules G1-G7
--   * seasons, points ledger, leaderboards (per manual: global, weekly, friends, organisation)
--   * leagues with invite codes, for people (classic) or for whole organisations (org vs org)
--   * live multiplayer matches and a daily challenge, marked and timed by the server
--   * messaging (direct, class, league, match chats) with safeguards for under-18s
--   * reports, moderation actions, in-app inbox, badges
--   * public-domain Bible text for "read in context" at the answer reveal
--   * retiring a manual: one call freezes its competitions and keeps everyone's history
--
-- Rule: only points earned in server-marked play count for rankings. Private practice
-- (submit_reviews) is marked on the device, so it earns streaks and XP but never ranking points.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Settings anyone may read (changed by the service role)
-- ---------------------------------------------------------------------
create table app_config (
  key   text primary key,
  value jsonb not null,
  note  text
);
insert into app_config values
  ('timezone',                  '"Africa/Lagos"', 'day boundary for the daily challenge and points days'),
  ('ranked_points_daily_cap',   '20000',          'most ranking points one user can earn per day'),
  ('message_rate_per_minute',   '20',             'most messages one user can send per minute'),
  ('adult_age',                 '18',             'under this age: messaging safeguards apply'),
  ('default_bible_translation', '"KJV"',          'translation shown by "read in context"'),
  ('match_max_players',         '100',            'largest live match'),
  ('require_guardian_consent',  'true',           'under-18s need a recorded guardian consent before messaging');
alter table app_config enable row level security;
create policy read_all on app_config for select to authenticated using (true);

create or replace function cfg(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from app_config where key = p_key
$$;

create or replace function local_today() returns date
language sql stable as $$
  select (now() at time zone (cfg('timezone') #>> '{}'))::date
$$;

-- ---------------------------------------------------------------------
-- 1. Platform staff
-- ---------------------------------------------------------------------
create table platform_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('content_editor', 'moderator', 'support', 'super_admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null
);
alter table platform_staff enable row level security;
create policy own_row on platform_staff for select to authenticated using (user_id = (select auth.uid()));

create or replace function is_staff(p_roles text[] default null) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_staff
                 where user_id = (select auth.uid())
                   and (p_roles is null or role = any(p_roles) or role = 'super_admin'))
$$;

-- ---------------------------------------------------------------------
-- 2. Age, public profiles, connections, blocks
-- ---------------------------------------------------------------------
alter table profiles add column birth_year smallint check (birth_year between 1900 and 2100);

-- once set, only support staff (or the service role) may change a birth year
create or replace function guard_birth_year() returns trigger
language plpgsql as $$
begin
  if old.birth_year is not null and new.birth_year is distinct from old.birth_year
     and current_user = 'authenticated' then
    raise exception 'birth year can only be changed by support';
  end if;
  return new;
end $$;
create trigger profiles_birth_year before update on profiles for each row execute function guard_birth_year();

-- unknown age counts as under 18 for messaging, so the safe rules apply until it is set
create or replace function is_minor(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select extract(year from now())::int - birth_year < (cfg('adult_age') #>> '{}')::int
                   from profiles where user_id = p_user and birth_year is not null), true)
$$;

-- a parent's or guardian's consent for an under-18 account (recorded by support or a consent flow)
create table guardian_consents (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  guardian_name    text not null,
  guardian_contact text not null,                     -- phone or email
  relationship     text,
  method           text not null check (method in ('in_app', 'paper', 'church_record', 'other')),
  consented_at     timestamptz not null default now(),
  revoked_at       timestamptz,
  recorded_by      uuid references auth.users(id) on delete set null
);
create index guardian_consents_user_idx on guardian_consents (user_id);
alter table guardian_consents enable row level security;
create policy own_or_support on guardian_consents for select to authenticated
  using (user_id = (select auth.uid()) or is_staff(array['support']));

create or replace function has_guardian_consent(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((cfg('require_guardian_consent') #>> '{}')::boolean, true)
      or not is_minor(p_user)
      or exists (select 1 from guardian_consents where user_id = p_user and revoked_at is null)
$$;

-- the caller's own age band (is_minor itself is internal, so nobody can probe another user's age)
create or replace function i_am_minor() returns boolean
language sql stable security definer set search_path = public as $$
  select is_minor((select auth.uid()))
$$;

create table public_profiles (                         -- what other users may see
  user_id      uuid primary key references auth.users(id) on delete cascade,
  handle       text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text,                                   -- hidden for under-18s
  avatar       text not null default 'preset:1',       -- 'preset:<n>' or an image path; under-18s: presets only
  home_org_id  uuid references organisations(id) on delete set null,
  visibility   text not null default 'public' check (visibility in ('public', 'hidden')),
  dm_policy    text not null default 'connections' check (dm_policy in ('everyone', 'connections', 'nobody')),
  xp           integer not null default 0,             -- practice effort; never used for ranking
  level        smallint not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create or replace function guard_public_profile() returns trigger
language plpgsql as $$
declare minor boolean;
begin
  if current_user = 'authenticated' then             -- a user editing their own profile
    minor := i_am_minor();
  else                                               -- a server function
    minor := is_minor(new.user_id);
  end if;
  if minor then
    new.display_name := null;
    if new.avatar not like 'preset:%' then
      raise exception 'under-18 accounts use a preset avatar';
    end if;
  end if;
  if tg_op = 'UPDATE' and current_user = 'authenticated'
     and (new.xp is distinct from old.xp or new.level is distinct from old.level) then
    raise exception 'xp and level are set by the server';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger public_profiles_guard before insert or update on public_profiles
  for each row execute function guard_public_profile();
alter table public_profiles enable row level security;
create policy read_visible on public_profiles for select to authenticated
  using (visibility = 'public' or user_id = (select auth.uid()));
create policy own_insert on public_profiles for insert to authenticated with check (user_id = (select auth.uid()) and xp = 0);
create policy own_update on public_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- the name to show for any user (hidden profiles stay anonymous; under-18s show their handle only)
create or replace function shown_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select case when visibility = 'hidden' then 'Hidden learner'
                               else coalesce(display_name, handle) end
                   from public_profiles where user_id = p_user), 'Learner')
$$;

create table connections (                             -- friends: request, then accept
  user_low     uuid not null references auth.users(id) on delete cascade,
  user_high    uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (user_low, user_high),
  check (user_low < user_high)
);
create index connections_high_idx on connections (user_high);
alter table connections enable row level security;
create policy mine on connections for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));
create policy remove_mine on connections for delete to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create table user_blocks (
  blocker    uuid not null references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table user_blocks enable row level security;
create policy own_rows on user_blocks for all to authenticated
  using (blocker = (select auth.uid())) with check (blocker = (select auth.uid()));

create or replace function is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

create or replace function is_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from connections where user_low = least(a, b) and user_high = greatest(a, b)
                 and status = 'accepted')
$$;

create or replace function share_class(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members x join group_members y using (group_id)
                 where x.user_id = a and y.user_id = b)
$$;

create or replace function share_org(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from org_members x join org_members y using (org_id)
                 where x.user_id = a and y.user_id = b)
$$;

-- ---------------------------------------------------------------------
-- 3. Reports, moderation, inbox
-- ---------------------------------------------------------------------
create table reports (
  id                 uuid primary key default gen_random_uuid(),
  reporter           uuid not null references auth.users(id) on delete cascade,
  target_user        uuid references auth.users(id) on delete cascade,
  message_id         bigint,
  message_created_at timestamptz,
  match_id           uuid,
  league_id          uuid,
  reason             text not null check (reason in ('harassment', 'spam', 'inappropriate', 'cheating',
                                                      'impersonation', 'child_safety', 'other')),
  detail             text check (length(detail) <= 2000),
  status             text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at         timestamptz not null default now(),
  handled_by         uuid references auth.users(id) on delete set null,
  handled_at         timestamptz
);
create index reports_open_idx on reports (status, created_at) where status = 'open';
alter table reports enable row level security;
create policy reporter_reads on reports for select to authenticated
  using (reporter = (select auth.uid()) or is_staff(array['moderator']));

create table moderation_actions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  action     text not null check (action in ('warn', 'mute', 'suspend', 'ban', 'remove_message', 'reset_points', 'lift')),
  until      timestamptz,                               -- null = permanent (ban) or not applicable
  reason     text not null,
  report_id  uuid references reports(id) on delete set null,
  acted_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index moderation_user_idx on moderation_actions (user_id, created_at desc);
alter table moderation_actions enable row level security;
create policy subject_or_staff on moderation_actions for select to authenticated
  using (user_id = (select auth.uid()) or is_staff(array['moderator', 'support']));

-- is the user currently muted / suspended / banned? (a later 'lift' cancels earlier actions)
create or replace function is_restricted(p_user uuid, p_kinds text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from moderation_actions a
    where a.user_id = p_user and a.action = any(p_kinds)
      and (a.until is null or a.until > now())
      and not exists (select 1 from moderation_actions l where l.user_id = p_user and l.action = 'lift'
                      and l.created_at > a.created_at))
$$;

create table inbox (                                   -- in-app notifications
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('connection_request', 'connection_accepted', 'league_invite',
                                           'match_invite', 'match_result', 'message', 'badge', 'assignment',
                                           'manual_retired', 'moderation', 'system')),
  payload    jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index inbox_user_idx on inbox (user_id, created_at desc);
alter table inbox enable row level security;
create policy own_read on inbox for select to authenticated using (user_id = (select auth.uid()));
create policy own_mark on inbox for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function notify(p_user uuid, p_kind text, p_payload jsonb) returns void
language sql security definer set search_path = public as $$
  insert into inbox (user_id, kind, payload) values (p_user, p_kind, p_payload)
$$;

create or replace function request_connection(p_handle text) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); other uuid;
begin
  select user_id into other from public_profiles where handle = lower(p_handle);
  if other is null or other = me then raise exception 'no such user'; end if;
  if is_blocked(me, other) then raise exception 'not possible'; end if;
  if is_minor(me) <> is_minor(other) then
    raise exception 'connections between under-18 and adult accounts are not available';
  end if;
  insert into connections (user_low, user_high, requested_by)
  values (least(me, other), greatest(me, other), me) on conflict do nothing;
  perform notify(other, 'connection_request', jsonb_build_object('from', me, 'name', shown_name(me)));
  return 'requested';
end $$;

create or replace function respond_connection(p_other uuid, p_accept boolean) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid());
begin
  if p_accept then
    update connections set status = 'accepted', accepted_at = now()
    where user_low = least(me, p_other) and user_high = greatest(me, p_other)
      and status = 'pending' and requested_by = p_other;
    if found then
      perform notify(p_other, 'connection_accepted', jsonb_build_object('by', me, 'name', shown_name(me)));
      return 'accepted';
    end if;
    return 'nothing to accept';
  end if;
  delete from connections where user_low = least(me, p_other) and user_high = greatest(me, p_other);
  return 'declined';
end $$;

-- ---------------------------------------------------------------------
-- 4. Server marking. rhemlo_norm() must equal Python rhemlo.normalize.norm_text and the app's
--    TypeScript grader for every answer (checked by db/test/behaviour_test.sql over the whole bank).
-- ---------------------------------------------------------------------
create or replace function rhemlo_norm(s text) returns text
language plpgsql immutable strict parallel safe as $$
declare
  t text := lower(normalize(s, NFC));
  n int := length(t);
  o text := '';
  ch text; prev text; nxt text;
begin
  for i in 1..n loop
    ch := substr(t, i, 1);
    prev := case when i > 1 then substr(t, i - 1, 1) else '' end;
    nxt := case when i < n then substr(t, i + 1, 1) else '' end;
    if ch ~ '^[[:alnum:]]$' or ch ~ '^\s$' then
      o := o || ch;
    elsif ch in ('-', U&'\2010', U&'\2011', U&'\2012', U&'\2013', U&'\2014', U&'\2212') then
      o := o || case when prev ~ '^[[:alnum:]]$' and nxt ~ '^[[:alnum:]]$' then '-' else ' ' end;
    elsif ch = ':' then
      o := o || case when prev ~ '^[0-9]$' and nxt ~ '^[0-9]$' then ':' else ' ' end;
    end if;                                            -- anything else (quotes, apostrophes, commas) vanishes
  end loop;
  return coalesce(array_to_string(regexp_split_to_array(btrim(o, E' \t\n\r\f' || chr(11)), '\s+'), ' '), '');
end $$;

-- Mark one answer. p_option = the option text chosen (multiple choice); p_answer = typed text or a reference.
create or replace function grade_item(p_item bigint, p_answer text, p_option text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare a jsonb;
begin
  select answer into a from items where id = p_item;
  if a is null then return false; end if;
  if p_option is not null then
    return rhemlo_norm(p_option) = rhemlo_norm(a->>'text');
  end if;
  if p_answer is null or btrim(p_answer) = '' then return false; end if;
  if a ? 'refs' then                                 -- references: compared as a set of canonical keys
    return (select array_agg(rhemlo_norm(r->>'key') order by rhemlo_norm(r->>'key'))
            from jsonb_array_elements(a->'refs') r)
         = (select array_agg(x order by x) from
             (select rhemlo_norm(btrim(p)) x from unnest(string_to_array(p_answer, ';')) p where btrim(p) <> '') q);
  end if;
  if a ? 'accept' then
    return rhemlo_norm(p_answer) = rhemlo_norm(a->>'text')
        or rhemlo_norm(p_answer) in (select rhemlo_norm(v) from jsonb_array_elements_text(a->'accept') v);
  end if;
  if a ? 'lessons' then
    return (select array_agg(m[1]::int order by m[1]::int) from regexp_matches(p_answer, '\d+', 'g') as m)
         = (select array_agg(v::int order by v::int) from jsonb_array_elements_text(a->'lessons') v);
  end if;
  if a ? 'norm' then
    return rhemlo_norm(p_answer) = a->>'norm';
  end if;
  return false;
end $$;

-- ---------------------------------------------------------------------
-- 5. Seasons, points ledger, leaderboards (always per manual, so they are fair)
-- ---------------------------------------------------------------------
create table seasons (
  id           uuid primary key default gen_random_uuid(),
  edition_code text not null references editions(code),
  name         text not null,                           -- 'Q1 2026', 'Road to the Finale'
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'active' check (status in ('upcoming', 'active', 'final')),
  unique (edition_code, name)
);
create index seasons_edition_idx on seasons (edition_code, starts_at);
alter table seasons enable row level security;
create policy read_entitled on seasons for select to authenticated using (edition_code in (select my_editions()));

create table score_events (                            -- append-only ledger of ranking points
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  edition_code text not null references editions(code),
  season_id    uuid references seasons(id) on delete set null,
  source       text not null check (source in ('match', 'daily_challenge', 'league_bonus', 'adjustment')),
  source_id    text not null,                           -- the match id, etc.: points are awarded once
  points       integer not null,
  created_at   timestamptz not null default now(),
  unique (user_id, source, source_id)
);
create index score_events_edition_idx on score_events (edition_code, created_at);
alter table score_events enable row level security;
create policy own_read on score_events for select to authenticated using (user_id = (select auth.uid()));

create table user_points_daily (                       -- feeds weekly boards and league standings
  user_id      uuid not null references auth.users(id) on delete cascade,
  edition_code text not null references editions(code),
  day          date not null,
  points       integer not null default 0,
  primary key (user_id, edition_code, day)
);
create index user_points_daily_edition_idx on user_points_daily (edition_code, day);
alter table user_points_daily enable row level security;
create policy own_read on user_points_daily for select to authenticated using (user_id = (select auth.uid()));

create table leaderboard (                             -- one row per user per manual per scope
  edition_code text not null references editions(code),
  scope        text not null,                           -- 'all' or a season id
  user_id      uuid not null references auth.users(id) on delete cascade,
  points       bigint not null default 0,
  matches      integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (edition_code, scope, user_id)
);
create index leaderboard_rank_idx on leaderboard (edition_code, scope, points desc);
alter table leaderboard enable row level security;
create policy read_entitled on leaderboard for select to authenticated using (edition_code in (select my_editions()));

-- the only way points are created; not callable from the app
create or replace function award_points(p_user uuid, p_edition text, p_source text, p_source_id text, p_points int)
returns integer language plpgsql security definer set search_path = public as $$
declare
  season uuid;
  today date := local_today();
  cap int := (cfg('ranked_points_daily_cap') #>> '{}')::int;
  so_far int;
  pts int;
begin
  if p_points is null or p_points = 0 then return 0; end if;
  select coalesce(sum(points), 0) into so_far from user_points_daily
  where user_id = p_user and day = today;
  pts := case when p_points > 0 then least(p_points, greatest(cap - so_far, 0)) else p_points end;
  if pts = 0 then return 0; end if;
  select id into season from seasons where edition_code = p_edition and status = 'active'
    and now() >= starts_at and now() < ends_at order by starts_at desc limit 1;
  insert into score_events (user_id, edition_code, season_id, source, source_id, points)
  values (p_user, p_edition, season, p_source, p_source_id, pts)
  on conflict (user_id, source, source_id) do nothing;
  if not found then return 0; end if;                 -- already awarded
  insert into user_points_daily as d values (p_user, p_edition, today, pts)
  on conflict (user_id, edition_code, day) do update set points = d.points + excluded.points;
  insert into leaderboard as l (edition_code, scope, user_id, points, matches)
  select p_edition, s, p_user, pts, (p_source in ('match', 'daily_challenge'))::int
  from unnest(case when season is null then array['all'] else array['all', season::text] end) s
  on conflict (edition_code, scope, user_id) do update
    set points = l.points + excluded.points, matches = l.matches + excluded.matches, updated_at = now();
  return pts;
end $$;

-- Global board: top N for a manual, for 'all' time or the current season (scope = 'season').
create or replace function leaderboard_top(p_edition text, p_scope text default 'season', p_limit int default 100,
                                           p_offset int default 0)
returns table (rank bigint, user_id uuid, name text, avatar text, points bigint, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
declare sc text := p_scope;
begin
  if p_edition not in (select my_editions()) then raise exception 'manual not available'; end if;
  if p_scope = 'season' then
    select id::text into sc from seasons where edition_code = p_edition and status <> 'upcoming'
      and starts_at <= now() order by starts_at desc limit 1;
    if sc is null then sc := 'all'; end if;
  end if;
  return query
    select rank() over (order by l.points desc), l.user_id, shown_name(l.user_id),
           coalesce(pp.avatar, 'preset:1'), l.points, l.user_id = (select auth.uid())
    from leaderboard l left join public_profiles pp on pp.user_id = l.user_id
    where l.edition_code = p_edition and l.scope = sc and not is_restricted(l.user_id, array['suspend', 'ban'])
    order by l.points desc limit least(p_limit, 500) offset p_offset;
end $$;

-- My position on a board, without reading the whole board.
create or replace function my_rank(p_edition text, p_scope text default 'season')
returns table (rank bigint, points bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare sc text := p_scope; mine bigint;
begin
  if p_scope = 'season' then
    select id::text into sc from seasons where edition_code = p_edition and status <> 'upcoming'
      and starts_at <= now() order by starts_at desc limit 1;
    if sc is null then sc := 'all'; end if;
  end if;
  select l.points into mine from leaderboard l
  where l.edition_code = p_edition and l.scope = sc and l.user_id = (select auth.uid());
  return query
    select (select count(*) from leaderboard l where l.edition_code = p_edition and l.scope = sc
            and l.points > coalesce(mine, 0)) + 1,
           coalesce(mine, 0),
           (select count(*) from leaderboard l where l.edition_code = p_edition and l.scope = sc);
end $$;

-- Weekly, friends and organisation boards are computed from daily points.
create or replace function board_between(p_edition text, p_from date, p_to date, p_users uuid[] default null,
                                         p_limit int default 100)
returns table (rank bigint, user_id uuid, name text, points bigint, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_edition not in (select my_editions()) then raise exception 'manual not available'; end if;
  return query
    select rank() over (order by sum(d.points) desc), d.user_id, shown_name(d.user_id), sum(d.points)::bigint,
           d.user_id = (select auth.uid())
    from user_points_daily d
    where d.edition_code = p_edition and d.day between p_from and p_to
      and (p_users is null or d.user_id = any(p_users))
    group by d.user_id order by sum(d.points) desc limit least(p_limit, 500);
end $$;

create or replace function weekly_board(p_edition text, p_limit int default 100)
returns table (rank bigint, user_id uuid, name text, points bigint, is_me boolean)
language sql stable as $$
  select * from board_between(p_edition, date_trunc('week', local_today())::date, local_today(), null, p_limit)
$$;

create or replace function friends_board(p_edition text)
returns table (rank bigint, user_id uuid, name text, points bigint, is_me boolean)
language sql stable security definer set search_path = public as $$
  select * from board_between(p_edition, '2000-01-01', local_today(),
    array(select (select auth.uid())
          union select case when user_low = (select auth.uid()) then user_high else user_low end
          from connections where status = 'accepted' and (select auth.uid()) in (user_low, user_high)), 200)
$$;

-- every member of an organisation and of all organisations below it
create or replace function org_subtree_members(p_org uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  with recursive tree as (
    select id from organisations where id = p_org
    union select o.id from organisations o join tree t on o.parent_id = t.id)
  select distinct m.user_id from org_members m join tree t on m.org_id = t.id
$$;

create or replace function org_board(p_org uuid, p_edition text)
returns table (rank bigint, user_id uuid, name text, points bigint, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if (select auth.uid()) not in (select org_subtree_members(p_org)) then
    raise exception 'members only';
  end if;
  return query select * from board_between(p_edition, '2000-01-01', local_today(),
                                           array(select org_subtree_members(p_org)), 500);
end $$;

-- ---------------------------------------------------------------------
-- 6. Leagues with invite links (FPL style). classic = people; org = whole organisations.
--    Link: https://<app>/join/<invite_code>
-- ---------------------------------------------------------------------
create table leagues (
  id           uuid primary key default gen_random_uuid(),
  edition_code text not null references editions(code),
  name         text not null check (length(name) between 3 and 60),
  kind         text not null default 'classic' check (kind in ('classic', 'org')),
  visibility   text not null default 'private' check (visibility in ('private', 'public')),
  invite_code  text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  org_id       uuid references organisations(id) on delete cascade,  -- an organisation's own league
  created_by   uuid references auth.users(id) on delete set null,
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  status       text not null default 'open' check (status in ('open', 'closed')),
  settings     jsonb not null default '{"org_score": "top_n_average", "n": 10, "chat": true, "max_entries": 1000}',
  created_at   timestamptz not null default now()
);
create index leagues_edition_idx on leagues (edition_code, status);

create table league_entries (
  league_id  uuid not null references leagues(id) on delete cascade,
  entry_id   uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete cascade,     -- classic leagues
  org_id     uuid references organisations(id) on delete cascade,  -- org leagues
  entered_by uuid references auth.users(id) on delete set null,
  joined_at  timestamptz not null default now(),
  check ((user_id is null) <> (org_id is null)),
  unique (league_id, user_id),
  unique (league_id, org_id)
);
create index league_entries_user_idx on league_entries (user_id);
create index league_entries_org_idx on league_entries (org_id);

create or replace function in_league(p_league uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from league_entries e where e.league_id = p_league and
                 (e.user_id = (select auth.uid())
                  or (e.org_id is not null and (select auth.uid()) in (select org_subtree_members(e.org_id)))))
      or exists (select 1 from leagues where id = p_league and created_by = (select auth.uid()))
$$;

alter table leagues enable row level security;
create policy visible on leagues for select to authenticated
  using (visibility = 'public' or in_league(id));
alter table league_entries enable row level security;
create policy visible on league_entries for select to authenticated
  using (exists (select 1 from leagues l where l.id = league_id and (l.visibility = 'public' or in_league(l.id))));

create or replace function create_league(p_edition text, p_name text, p_kind text default 'classic',
                                         p_visibility text default 'private', p_org uuid default null,
                                         p_starts timestamptz default now(), p_ends timestamptz default null)
returns table (league_id uuid, invite_code text)
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); l leagues;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_edition not in (select my_editions()) then raise exception 'manual not available'; end if;
  if p_org is not null and not exists (select 1 from org_members where org_id = p_org and user_id = me
                                       and role = 'admin') then
    raise exception 'only an organisation admin can create its league';
  end if;
  insert into leagues (edition_code, name, kind, visibility, org_id, created_by, starts_at, ends_at, settings)
  values (p_edition, p_name, p_kind, p_visibility, p_org, me, p_starts, p_ends,
          jsonb_build_object('org_score', 'top_n_average', 'n', 10, 'chat', p_visibility = 'private',
                             'max_entries', 1000))
  returning * into l;
  if p_kind = 'classic' then
    insert into league_entries (league_id, user_id, entered_by) values (l.id, me, me);
  end if;
  return query select l.id, l.invite_code;
end $$;

-- what an invite link shows before joining
create or replace function league_preview(p_code text)
returns table (league_id uuid, name text, kind text, edition_code text, entries bigint, status text)
language sql stable security definer set search_path = public as $$
  select l.id, l.name, l.kind, l.edition_code, (select count(*) from league_entries e where e.league_id = l.id), l.status
  from leagues l where l.invite_code = upper(p_code)
$$;

create or replace function join_league(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); l leagues;
begin
  select * into l from leagues where invite_code = upper(p_code);
  if l.id is null or l.status <> 'open' then raise exception 'no open league with that code'; end if;
  if l.kind <> 'classic' then raise exception 'organisations enter this league through an admin'; end if;
  if l.edition_code not in (select my_editions()) then raise exception 'manual not available'; end if;
  if (select count(*) from league_entries where league_id = l.id) >= (l.settings->>'max_entries')::int then
    raise exception 'league is full';
  end if;
  insert into league_entries (league_id, user_id, entered_by) values (l.id, me, me) on conflict do nothing;
  return l.id;
end $$;

create or replace function enter_org_in_league(p_code text, p_org uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); l leagues;
begin
  select * into l from leagues where invite_code = upper(p_code);
  if l.id is null or l.status <> 'open' or l.kind <> 'org' then raise exception 'no open organisation league with that code'; end if;
  if not exists (select 1 from org_members where org_id = p_org and user_id = me and role = 'admin') then
    raise exception 'only an admin of that organisation can enter it';
  end if;
  insert into league_entries (league_id, org_id, entered_by) values (l.id, p_org, me) on conflict do nothing;
  return l.id;
end $$;

create or replace function leave_league(p_league uuid) returns void
language sql security definer set search_path = public as $$
  delete from league_entries where league_id = p_league and user_id = (select auth.uid())
$$;

-- Standings. classic: each person's points in the league window. org: each organisation's score
-- = average (or sum) of its top n members' points, so big and small organisations compete fairly.
-- Results are kept in league_standings_rows: small leagues are recomputed on every view, large ones
-- at most once per 'standings_cache_seconds', so thousands of viewers cost one computation.
insert into app_config values
  ('standings_cache_seconds', '60', 'large leagues: how old cached standings may be'),
  ('standings_live_entries',  '300', 'classic leagues up to this many people are recomputed on every view');

create table league_standings_rows (
  league_id  uuid not null references leagues(id) on delete cascade,
  entry_id   uuid not null,
  user_id    uuid,                                     -- classic leagues
  org_id     uuid,                                     -- org leagues
  rank       bigint not null,
  points     numeric not null,
  counted    integer not null,
  primary key (league_id, entry_id)
);
create index league_standings_rank_idx on league_standings_rows (league_id, rank);
create index league_standings_user_idx on league_standings_rows (league_id, user_id);
create table league_standings_cache (
  league_id   uuid primary key references leagues(id) on delete cascade,
  computed_at timestamptz not null
);
alter table league_standings_rows enable row level security;   -- read through the functions below
alter table league_standings_cache enable row level security;

create or replace function refresh_league_standings(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l leagues; d_from date; d_to date; n int; how text;
begin
  select * into l from leagues where id = p_league;
  d_from := (l.starts_at at time zone (cfg('timezone') #>> '{}'))::date;
  d_to := coalesce((l.ends_at at time zone (cfg('timezone') #>> '{}'))::date, local_today());
  n := coalesce((l.settings->>'n')::int, 10);
  how := coalesce(l.settings->>'org_score', 'top_n_average');
  delete from league_standings_rows where league_id = l.id;
  if l.kind = 'classic' then
    insert into league_standings_rows (league_id, entry_id, user_id, rank, points, counted)
    select l.id, t.eid, t.uid, rank() over (order by t.pts desc), t.pts, 1
    from (select e.entry_id as eid, e.user_id as uid, coalesce(sum(d.points), 0)::numeric as pts
          from league_entries e
          left join user_points_daily d on d.user_id = e.user_id and d.edition_code = l.edition_code
                                        and d.day between d_from and d_to
          where e.league_id = l.id group by e.entry_id, e.user_id) t;
  else
    insert into league_standings_rows (league_id, entry_id, org_id, rank, points, counted)
    with members as materialized (
      select e.entry_id, e.org_id, m.uid
      from league_entries e cross join lateral (select org_subtree_members(e.org_id) as uid) m
      where e.league_id = l.id
    ), pts as materialized (
      select d.user_id, sum(d.points) as p from user_points_daily d
      where d.edition_code = l.edition_code and d.day between d_from and d_to
        and d.user_id in (select uid from members)
      group by d.user_id
    ), ranked as (
      select mb.entry_id, mb.org_id, coalesce(pt.p, 0) as pts,
             row_number() over (partition by mb.entry_id order by coalesce(pt.p, 0) desc) as rn
      from members mb left join pts pt on pt.user_id = mb.uid
    ), scored as (
      select r.entry_id, r.org_id,
             case when how = 'top_n_sum' then sum(r.pts)::numeric else round(avg(r.pts), 1) end as score,
             count(*)::int as counted
      from ranked r where r.rn <= n group by r.entry_id, r.org_id
    )
    select l.id, s.entry_id, s.org_id, rank() over (order by s.score desc), s.score, s.counted from scored s;
  end if;
  insert into league_standings_cache values (l.id, now())
  on conflict (league_id) do update set computed_at = now();
end $$;

create or replace function ensure_league_standings(p_league uuid) returns void
language plpgsql security definer set search_path = public as $$
declare fresh boolean; small boolean;
begin
  -- organisation leagues always count many members, so they are always cached
  select l.kind = 'classic' and (select count(*) from league_entries where league_id = p_league)
         <= (cfg('standings_live_entries') #>> '{}')::int into small from leagues l where l.id = p_league;
  select computed_at > now() - make_interval(secs => (cfg('standings_cache_seconds') #>> '{}')::int) into fresh
  from league_standings_cache where league_id = p_league;
  if (small or not coalesce(fresh, false)) and pg_try_advisory_xact_lock(hashtext(p_league::text)) then
    perform refresh_league_standings(p_league);        -- anyone else meanwhile reads the previous result
  end if;
end $$;

create or replace function league_standings(p_league uuid, p_limit int default 200)
returns table (rank bigint, entry_id uuid, name text, points numeric, members_counted int, is_me boolean)
language plpgsql security definer set search_path = public as $$
declare l leagues; me uuid := (select auth.uid());
begin
  select * into l from leagues where id = p_league;
  if l.id is null or not (l.visibility = 'public' or in_league(l.id)) then raise exception 'league not visible'; end if;
  perform ensure_league_standings(l.id);
  return query
    select r.rank, r.entry_id,
           case when r.user_id is not null then shown_name(r.user_id) else (select o.name from organisations o where o.id = r.org_id) end,
           r.points, r.counted,
           case when r.user_id is not null then r.user_id = me
                else exists (select 1 from org_members om where om.org_id = r.org_id and om.user_id = me) end
    from league_standings_rows r where r.league_id = l.id
    order by r.rank, r.entry_id limit least(p_limit, 500);
end $$;

-- my place in a league, however large
create or replace function my_league_position(p_league uuid)
returns table (rank bigint, points numeric, entries bigint)
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid());
begin
  if not in_league(p_league) then raise exception 'not in this league'; end if;
  perform ensure_league_standings(p_league);
  return query
    select r.rank, r.points, (select count(*) from league_standings_rows x where x.league_id = p_league)
    from league_standings_rows r
    where r.league_id = p_league
      and (r.user_id = me or (r.org_id is not null and me in (select org_subtree_members(r.org_id))))
    order by r.rank limit 1;
end $$;

-- ---------------------------------------------------------------------
-- 7. Live matches and the daily challenge. The server picks the questions, keeps the answers
--    hidden, times every answer and marks it. Question k is open from
--    base + (k-1)*(seconds+reveal) for <seconds>; base = match start (live) or your start (daily).
-- ---------------------------------------------------------------------
create table matches (
  id                   uuid primary key default gen_random_uuid(),
  edition_code         text not null references editions(code),
  kind                 text not null check (kind in ('duel', 'room', 'daily')),
  ranked               boolean not null default true,
  status               text not null default 'lobby' check (status in ('lobby', 'live', 'finished', 'cancelled')),
  host_id              uuid references auth.users(id) on delete set null,
  join_code            text unique,
  league_id            uuid references leagues(id) on delete set null,
  settings             jsonb not null default '{}',      -- {"lessons":[1,12],"formats":["mcq","typed"],"max_players":20,"day":"2026-10-15"}
  question_count       smallint not null default 10 check (question_count between 3 and 50),
  seconds_per_question smallint not null default 20 check (seconds_per_question between 5 and 120),
  reveal_seconds       smallint not null default 6 check (reveal_seconds between 2 and 30),
  starts_at            timestamptz,
  created_at           timestamptz not null default now(),
  finished_at          timestamptz
);
create index matches_open_idx on matches (edition_code, status) where status in ('lobby', 'live');
create unique index matches_daily_idx on matches (edition_code, (settings->>'day')) where kind = 'daily';

create table match_players (
  match_id   uuid not null references matches(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  started_at timestamptz,                                -- daily challenge: your own start
  score      integer not null default 0,
  correct    smallint not null default 0,
  final_rank smallint,
  awarded    boolean not null default false,
  primary key (match_id, user_id)
);
create index match_players_user_idx on match_players (user_id, joined_at desc);

create table match_questions (                         -- never readable directly: answers are inside
  match_id       uuid not null references matches(id) on delete cascade,
  position       smallint not null,
  item_id        bigint not null references items(id),
  format         text not null check (format in ('mcq', 'typed')),
  options        text[],
  correct_option smallint,
  primary key (match_id, position)
);

create table match_answers (
  match_id      uuid not null references matches(id) on delete cascade,
  position      smallint not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  answer_text   text,
  chosen_option smallint,
  is_correct    boolean not null,
  points        integer not null default 0,
  response_ms   integer not null,
  flagged       boolean not null default false,          -- suspiciously fast typed answer: for moderators
  answered_at   timestamptz not null default now(),
  primary key (match_id, position, user_id)
);

create or replace function is_match_player(p_match uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from match_players where match_id = p_match and user_id = (select auth.uid()))
$$;

alter table matches enable row level security;
create policy players_or_open on matches for select to authenticated
  using (is_match_player(id) or host_id = (select auth.uid()));
alter table match_players enable row level security;
create policy same_match on match_players for select to authenticated using (is_match_player(match_id));
alter table match_questions enable row level security;                -- no policy: functions only
alter table match_answers enable row level security;
create policy own_answers on match_answers for select to authenticated using (user_id = (select auth.uid()));

create or replace function match_base(m matches, p_user uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select case when m.kind = 'daily'
              then (select started_at from match_players where match_id = m.id and user_id = p_user)
              else m.starts_at end
$$;

create or replace function create_match(p_edition text, p_kind text default 'room', p_settings jsonb default '{}',
                                        p_questions int default 10, p_seconds int default 20,
                                        p_ranked boolean default true, p_league uuid default null)
returns table (match_id uuid, join_code text)
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); m matches;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_kind not in ('duel', 'room') then raise exception 'kind must be duel or room'; end if;
  if p_edition not in (select my_editions()) then raise exception 'manual not available'; end if;
  if (select status from editions where code = p_edition) <> 'published' then raise exception 'manual is not open for play'; end if;
  if is_restricted(me, array['suspend', 'ban']) then raise exception 'account restricted'; end if;
  insert into matches (edition_code, kind, ranked, host_id, join_code, league_id, settings, question_count,
                       seconds_per_question)
  values (p_edition, p_kind, p_ranked, me, upper(substr(md5(gen_random_uuid()::text), 1, 6)), p_league,
          p_settings || jsonb_build_object('max_players',
            least(coalesce((p_settings->>'max_players')::int, case when p_kind = 'duel' then 2 else 20 end),
                  (cfg('match_max_players') #>> '{}')::int)),
          p_questions, p_seconds)
  returning * into m;
  insert into match_players (match_id, user_id) values (m.id, me);
  return query select m.id, m.join_code;
end $$;

create or replace function join_match(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); m matches;
begin
  select * into m from matches where join_code = upper(p_code);
  if m.id is null or m.status <> 'lobby' then raise exception 'no match waiting with that code'; end if;
  if m.edition_code not in (select my_editions()) then raise exception 'manual not available'; end if;
  if is_restricted(me, array['suspend', 'ban']) then raise exception 'account restricted'; end if;
  if (select count(*) from match_players where match_id = m.id) >= (m.settings->>'max_players')::int then
    raise exception 'match is full';
  end if;
  insert into match_players (match_id, user_id) values (m.id, me) on conflict do nothing;
  return m.id;
end $$;

-- choose the questions (deterministic for the daily challenge: everyone gets the same set)
create or replace function pick_match_questions(p_match uuid, p_seed text) returns integer
language plpgsql security definer set search_path = public as $$
declare m matches; lo int; hi int; fmts text[]; made int;
begin
  select * into m from matches where id = p_match;
  lo := coalesce((m.settings->'lessons'->>0)::int, 1);
  hi := coalesce((m.settings->'lessons'->>1)::int, 99);
  fmts := coalesce(nullif(array(select jsonb_array_elements_text(m.settings->'formats')), '{}'), array['mcq', 'typed']);
  insert into match_questions (match_id, position, item_id, format, options, correct_option)
  with cand as (
    select i.id, i.uid, i.answer, f.fmt
    from items i
    join lessons l on l.uid = i.lesson_uid
    cross join lateral (select case
             when 'mcq' = any(fmts) and 'mcq' = any(i.formats)
                  and (select count(*) from item_distractors d where d.item_uid = i.uid) >= 2 then 'mcq'
             when 'typed' = any(fmts) and 'typed' = any(i.formats) and (i.answer ? 'norm' and length(i.answer->>'norm') <= 80
                                           or i.answer ? 'refs' and jsonb_array_length(i.answer->'refs') = 1
                                           or i.answer ? 'accept') then 'typed'
             end as fmt) f
    where i.edition_code = m.edition_code and i.active and l.status = 'approved'
      and l.number between lo and hi and f.fmt is not null
    order by md5(i.uid || p_seed)
    limit m.question_count)
  select p_match, row_number() over (order by md5(c.uid || p_seed)), c.id, c.fmt,
         case when c.fmt = 'mcq' then o.opts end,
         case when c.fmt = 'mcq' then array_position(o.opts, c.answer->>'text') end
  from cand c
  cross join lateral (select array(select t from (select c.answer->>'text' as t
                                                  union all select d.text from item_distractors d where d.item_uid = c.uid) x
                                   order by md5(t || p_seed)) as opts) o;
  get diagnostics made = row_count;
  if made < 3 then raise exception 'not enough approved questions in that range'; end if;
  update matches set question_count = made where id = p_match;
  return made;
end $$;

create or replace function start_match(p_match uuid, p_delay_seconds int default 5) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match for update;
  if m.host_id is distinct from (select auth.uid()) then raise exception 'only the host can start'; end if;
  if m.status <> 'lobby' then raise exception 'already started'; end if;
  if m.ranked and (select count(*) from match_players where match_id = m.id) < 2 then
    raise exception 'ranked matches need at least 2 players';
  end if;
  perform pick_match_questions(m.id, m.id::text);
  update matches set status = 'live', starts_at = now() + make_interval(secs => p_delay_seconds)
  where id = m.id returning starts_at into m.starts_at;
  return m.starts_at;
end $$;

-- today's daily challenge for a manual: same 10 questions for everyone, played once, ranked
create or replace function daily_challenge(p_edition text) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); d text := local_today()::text; mid uuid;
begin
  if p_edition not in (select my_editions()) then raise exception 'manual not available'; end if;
  select id into mid from matches where kind = 'daily' and edition_code = p_edition and settings->>'day' = d;
  if mid is null then
    insert into matches (edition_code, kind, ranked, status, settings, question_count, seconds_per_question, reveal_seconds)
    values (p_edition, 'daily', true, 'live', jsonb_build_object('day', d, 'formats', jsonb_build_array('mcq', 'typed')), 10, 25, 5)
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

-- what the screen needs right now: the open question (never its answer), timings, scores
create or replace function match_state(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := (select auth.uid()); m matches; base timestamptz; slot numeric; k int; q match_questions; i items;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_match_player(m.id) then raise exception 'not in this match'; end if;
  base := match_base(m, me);
  slot := m.seconds_per_question + m.reveal_seconds;
  if base is null or now() < base then
    k := 0;
  else
    k := least(floor(extract(epoch from now() - base) / slot)::int + 1, m.question_count + 1);
  end if;
  if k between 1 and m.question_count then
    select * into q from match_questions where match_id = m.id and position = k;
    select * into i from items where id = q.item_id;
  end if;
  return jsonb_build_object(
    'status', m.status, 'kind', m.kind, 'server_time', now(), 'base', base,
    'seconds', m.seconds_per_question, 'reveal_seconds', m.reveal_seconds, 'question_count', m.question_count,
    'position', k,
    'opens_at', case when k between 1 and m.question_count then base + make_interval(secs => (k - 1) * slot) end,
    'closes_at', case when k between 1 and m.question_count
                      then base + make_interval(secs => (k - 1) * slot + m.seconds_per_question) end,
    'question', case when k between 1 and m.question_count then jsonb_build_object(
                  'position', k, 'format', q.format, 'prompt', i.prompt, 'options', to_jsonb(q.options),
                  'answer_kind', case when i.answer ? 'refs' then 'reference'
                                      when i.answer ? 'lessons' or i.answer ? 'accept' then 'lesson' else 'text' end) end,
    'players', (select jsonb_agg(jsonb_build_object('name', shown_name(p.user_id), 'score', p.score,
                                                    'me', p.user_id = me) order by p.score desc)
                from match_players p where p.match_id = m.id));
end $$;

create or replace function answer_match(p_match uuid, p_position int, p_answer text default null,
                                        p_option int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := (select auth.uid()); m matches; q match_questions; base timestamptz;
  opens timestamptz; closes timestamptz; ok boolean; pts int := 0; ms int;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_match_player(m.id) then raise exception 'not in this match'; end if;
  if m.status not in ('live') then raise exception 'match is not live'; end if;
  base := match_base(m, me);
  opens := base + make_interval(secs => (p_position - 1) * (m.seconds_per_question + m.reveal_seconds));
  closes := opens + make_interval(secs => m.seconds_per_question);
  if now() < opens or now() > closes then
    return jsonb_build_object('accepted', false, 'reason', 'question not open');
  end if;
  select * into q from match_questions where match_id = m.id and position = p_position;
  ms := (extract(epoch from now() - opens) * 1000)::int;
  ok := grade_item(q.item_id, p_answer,
                   case when q.format = 'mcq' and p_option is not null then q.options[p_option] end);
  if ok then                                          -- base points, plus up to the same again for speed
    pts := round((case when q.format = 'typed' then 750 else 500 end)
                 * (1 + greatest(0, extract(epoch from closes - now())) / m.seconds_per_question))::int;
  end if;
  insert into match_answers (match_id, position, user_id, answer_text, chosen_option, is_correct, points,
                             response_ms, flagged)
  values (m.id, p_position, me, p_answer, p_option, ok, pts, ms, q.format = 'typed' and ok and ms < 1200)
  on conflict do nothing;
  if not found then return jsonb_build_object('accepted', false, 'reason', 'already answered'); end if;
  update match_players set score = score + pts, correct = correct + ok::int where match_id = m.id and user_id = me;
  return jsonb_build_object('accepted', true, 'is_correct', ok, 'points', pts, 'response_ms', ms);
end $$;

-- after a question closes: the right answer, where it comes from, and how the room did
create or replace function match_reveal(p_match uuid, p_position int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := (select auth.uid()); m matches; q match_questions; i items; closes timestamptz;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not is_match_player(m.id) then raise exception 'not in this match'; end if;
  closes := match_base(m, me) + make_interval(secs => (p_position - 1) * (m.seconds_per_question + m.reveal_seconds)
                                                    + m.seconds_per_question);
  if closes is null or now() < closes then raise exception 'question still open'; end if;
  select * into q from match_questions where match_id = m.id and position = p_position;
  select * into i from items where id = q.item_id;
  return jsonb_build_object(
    'answer', i.answer->>'text', 'correct_option', q.correct_option, 'lesson_uid', i.lesson_uid,
    'context', i.prompt->>'context', 'item_id', i.id,
    'references', coalesce((select jsonb_agg(r->>'key') from jsonb_array_elements(i.answer->'refs') r),
                           case when i.prompt ? 'ref' then jsonb_build_array(i.prompt->>'ref') end),
    'mine', (select to_jsonb(a) - 'user_id' from match_answers a
             where a.match_id = m.id and a.position = p_position and a.user_id = me),
    'answered', (select count(*) from match_answers a where a.match_id = m.id and a.position = p_position),
    'correct', (select count(*) from match_answers a where a.match_id = m.id and a.position = p_position and a.is_correct),
    'option_counts', (select jsonb_object_agg(chosen_option, c) from
                       (select chosen_option, count(*) c from match_answers a
                        where a.match_id = m.id and a.position = p_position and chosen_option is not null
                        group by chosen_option) x));
end $$;

-- award points once everyone's last question has closed (safe to call many times)
create or replace function finish_match(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m matches; p record; slot numeric; done boolean; n_awarded int := 0;
begin
  select * into m from matches where id = p_match;
  if m.id is null or not (is_match_player(m.id) or (select auth.uid()) is null) then raise exception 'not in this match'; end if;
  slot := m.seconds_per_question + m.reveal_seconds;
  for p in select * from match_players where match_id = m.id and not awarded loop
    done := match_base(m, p.user_id) + make_interval(secs => m.question_count * slot) <= now();
    if done then
      if m.ranked and p.score > 0 then
        perform award_points(p.user_id, m.edition_code,
                             case when m.kind = 'daily' then 'daily_challenge' else 'match' end, m.id::text, p.score);
      end if;
      update match_players set awarded = true where match_id = m.id and user_id = p.user_id;
      update public_profiles set xp = xp + p.correct * 10 where user_id = p.user_id;
      n_awarded := n_awarded + 1;
    end if;
  end loop;
  if m.kind <> 'daily' and m.status = 'live'
     and m.starts_at + make_interval(secs => m.question_count * slot) <= now() then
    update match_players mp set final_rank = r.rk
    from (select user_id, rank() over (order by score desc) rk from match_players where match_id = m.id) r
    where mp.match_id = m.id and mp.user_id = r.user_id;
    update matches set status = 'finished', finished_at = now() where id = m.id;
  end if;
  return jsonb_build_object('awarded', n_awarded,
    'standings', (select jsonb_agg(jsonb_build_object('name', shown_name(user_id), 'score', score,
                                                      'correct', correct, 'rank', final_rank) order by score desc)
                  from match_players where match_id = m.id));
end $$;

-- ---------------------------------------------------------------------
-- 8. Messaging. Direct chats need permission (below); class, league and match chats belong to
--    their members. Messages are split by month like answers.
-- ---------------------------------------------------------------------
create table conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('direct', 'class', 'league', 'match')),
  direct_key      text unique,                          -- 'low-uuid:high-uuid' for direct chats
  group_id        uuid unique references groups(id) on delete cascade,
  league_id       uuid unique references leagues(id) on delete cascade,
  match_id        uuid unique references matches(id) on delete cascade,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create table conversation_members (                     -- direct chats; read markers for all chats
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  muted_until     timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on conversation_members (user_id);

create table messages (
  id              bigint generated always as identity,
  created_at      timestamptz not null default now(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null,
  kind            text not null default 'text' check (kind in ('text', 'system', 'match_invite', 'match_result',
                                                                'league_invite', 'sticker')),
  body            text check (length(body) <= 2000),
  payload         jsonb not null default '{}',
  edited_at       timestamptz,
  deleted_at      timestamptz,
  primary key (id, created_at)
) partition by range (created_at);
create index messages_conversation_idx on messages (conversation_id, created_at desc);
create index messages_sender_idx on messages (sender_id, created_at desc);
create table messages_default partition of messages default;

-- monthly partitions now also for messages
create or replace function ensure_log_partitions(months_back int default 1, months_ahead int default 3)
returns integer language plpgsql as $$
declare
  m date;
  made integer := 0;
  t text;
begin
  for m in select generate_series(date_trunc('month', now()) - make_interval(months => months_back),
                                  date_trunc('month', now()) + make_interval(months => months_ahead),
                                  interval '1 month')::date
  loop
    foreach t in array array['review_logs', 'error_events', 'messages'] loop
      if to_regclass(format('%I_%s', t, to_char(m, 'YYYYMM'))) is null then
        execute format('create table %I partition of %I for values from (%L) to (%L)',
                       t || '_' || to_char(m, 'YYYYMM'), t, m, (m + interval '1 month')::date);
        made := made + 1;
      end if;
    end loop;
  end loop;
  return made;
end $$;
select ensure_log_partitions(2, 12);

create or replace function is_chat_member(p_conv uuid, p_user uuid default null) returns boolean
language sql stable security definer set search_path = public as $$
  with me as (select coalesce(p_user, (select auth.uid())) as uid), c as (select * from conversations where id = p_conv)
  select case c.kind
    when 'direct' then exists (select 1 from conversation_members cm, me
                               where cm.conversation_id = c.id and cm.user_id = me.uid)
    when 'class'  then exists (select 1 from group_members gm, me where gm.group_id = c.group_id and gm.user_id = me.uid)
    when 'league' then exists (select 1 from league_entries e, me where e.league_id = c.league_id and
                               (e.user_id = me.uid or (e.org_id is not null and exists
                                 (select 1 from org_members om where om.org_id = e.org_id and om.user_id = me.uid
                                  and om.role in ('admin', 'coach')))))
    when 'match'  then exists (select 1 from match_players mp, me where mp.match_id = c.match_id and mp.user_id = me.uid)
  end
  from c
$$;

-- may a and b talk one-to-one?
create or replace function can_direct_message(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a <> b and not is_blocked(a, b)
     and not is_restricted(a, array['mute', 'suspend', 'ban'])
     and case
       when is_minor(a) or is_minor(b) then              -- under-18s: only with other under-18s in their class
         is_minor(a) and is_minor(b) and share_class(a, b) and has_guardian_consent(a) and has_guardian_consent(b)
       else
         case coalesce((select dm_policy from public_profiles where user_id = b), 'connections')
           when 'everyone' then true
           when 'connections' then is_connected(a, b) or share_class(a, b) or share_org(a, b)
           else false end
       end
$$;

alter table conversations enable row level security;
create policy members_read on conversations for select to authenticated using (is_chat_member(id));
alter table conversation_members enable row level security;
create policy members_read on conversation_members for select to authenticated using (is_chat_member(conversation_id));
create policy own_marker on conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table messages enable row level security;
create policy members_read on messages for select to authenticated using (is_chat_member(conversation_id));

-- the chats list: found through the user's own memberships (fast at any number of chats)
create or replace function my_chats(p_limit int default 50)
returns table (conversation_id uuid, kind text, title text, last_message_at timestamptz, unread boolean)
language sql stable security definer set search_path = public as $$
  with me as (select (select auth.uid()) as uid),
  mine as (
    select cm.conversation_id as cid from conversation_members cm, me where cm.user_id = me.uid
    union select c.id from conversations c join group_members gm on gm.group_id = c.group_id, me where gm.user_id = me.uid
    union select c.id from conversations c join league_entries le on le.league_id = c.league_id, me where le.user_id = me.uid
    union select c.id from conversations c join league_entries le on le.league_id = c.league_id
            join org_members om on om.org_id = le.org_id and om.role in ('admin', 'coach'), me where om.user_id = me.uid
    union select c.id from conversations c join match_players mp on mp.match_id = c.match_id, me where mp.user_id = me.uid
  )
  select c.id, c.kind,
         case c.kind
           when 'direct' then (select shown_name(cm.user_id) from conversation_members cm, me
                               where cm.conversation_id = c.id and cm.user_id <> me.uid limit 1)
           when 'class' then (select name from groups where id = c.group_id)
           when 'league' then (select name from leagues where id = c.league_id)
           else 'Match chat' end,
         c.last_message_at,
         c.last_message_at > coalesce((select cm.last_read_at from conversation_members cm, me
                                       where cm.conversation_id = c.id and cm.user_id = me.uid), '-infinity')
  from conversations c join mine on mine.cid = c.id
  order by c.last_message_at desc nulls last limit p_limit
$$;

-- reading a chat marks it read (also creates the read marker for class, league and match chats)
create or replace function mark_chat_read(p_conv uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_chat_member(p_conv) then raise exception 'members only'; end if;
  insert into conversation_members (conversation_id, user_id, last_read_at)
  values (p_conv, (select auth.uid()), now())
  on conflict (conversation_id, user_id) do update set last_read_at = now();
end $$;

create or replace function start_direct_chat(p_other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); k text; cid uuid;
begin
  if not can_direct_message(me, p_other) then raise exception 'you cannot message this person'; end if;
  k := least(me, p_other)::text || ':' || greatest(me, p_other)::text;
  select id into cid from conversations where direct_key = k;
  if cid is null then
    insert into conversations (kind, direct_key, created_by) values ('direct', k, me) returning id into cid;
    insert into conversation_members (conversation_id, user_id) values (cid, me), (cid, p_other);
  end if;
  return cid;
end $$;

-- the chat of a class, league or match (created the first time a member opens it)
create or replace function open_group_chat(p_kind text, p_target uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select id into cid from conversations
  where (p_kind = 'class' and group_id = p_target) or (p_kind = 'league' and league_id = p_target)
     or (p_kind = 'match' and match_id = p_target);
  if cid is null then
    if p_kind = 'league' and not coalesce((select (settings->>'chat')::boolean from leagues where id = p_target), false) then
      raise exception 'chat is off for this league';
    end if;
    insert into conversations (kind, group_id, league_id, match_id, created_by)
    values (p_kind, case when p_kind = 'class' then p_target end, case when p_kind = 'league' then p_target end,
            case when p_kind = 'match' then p_target end, (select auth.uid()))
    on conflict do nothing returning id into cid;
    if cid is null then
      select id into cid from conversations where group_id = p_target or league_id = p_target or match_id = p_target;
    end if;
  end if;
  if not is_chat_member(cid) then raise exception 'members only'; end if;
  return cid;
end $$;

create or replace function send_message(p_conv uuid, p_body text, p_kind text default 'text',
                                        p_payload jsonb default '{}') returns bigint
language plpgsql security definer set search_path = public as $$
declare me uuid := (select auth.uid()); c conversations; other uuid; mid bigint;
begin
  select * into c from conversations where id = p_conv;
  if c.id is null or not is_chat_member(c.id) then raise exception 'members only'; end if;
  if is_restricted(me, array['mute', 'suspend', 'ban']) then raise exception 'you cannot send messages right now'; end if;
  if not has_guardian_consent(me) then raise exception 'a parent or guardian needs to approve messaging first'; end if;
  if p_kind not in ('text', 'match_invite', 'league_invite', 'sticker') then raise exception 'not allowed'; end if;
  if c.kind = 'direct' then                            -- rules re-checked on every message (blocks, age)
    select user_id into other from conversation_members where conversation_id = c.id and user_id <> me limit 1;
    if not can_direct_message(me, other) then raise exception 'you cannot message this person'; end if;
  end if;
  if (select count(*) from messages where sender_id = me and created_at > now() - interval '1 minute')
     >= (cfg('message_rate_per_minute') #>> '{}')::int then
    raise exception 'slow down';
  end if;
  insert into messages (conversation_id, sender_id, kind, body, payload)
  values (c.id, me, p_kind, p_body, p_payload) returning id into mid;
  update conversations set last_message_at = now() where id = c.id;
  return mid;
end $$;

create or replace function delete_message(p_id bigint, p_created_at timestamptz) returns void
language sql security definer set search_path = public as $$
  update messages set body = null, payload = '{}', deleted_at = now()
  where id = p_id and created_at = p_created_at
    and (sender_id = (select auth.uid()) or is_staff(array['moderator']))
$$;

create or replace function block_user(p_other uuid) returns void
language sql security definer set search_path = public as $$
  insert into user_blocks (blocker, blocked) values ((select auth.uid()), p_other) on conflict do nothing;
  delete from connections where user_low = least((select auth.uid()), p_other)
                            and user_high = greatest((select auth.uid()), p_other);
$$;

create or replace function report(p_reason text, p_target_user uuid default null, p_message_id bigint default null,
                                  p_message_at timestamptz default null, p_match uuid default null,
                                  p_league uuid default null, p_detail text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  insert into reports (reporter, target_user, message_id, message_created_at, match_id, league_id, reason, detail)
  values ((select auth.uid()), coalesce(p_target_user,
            (select sender_id from messages where id = p_message_id and created_at = p_message_at)),
          p_message_id, p_message_at, p_match, p_league, p_reason, p_detail)
  returning id into rid;
  return rid;
end $$;

-- moderators: open reports with the reported message, then act
create or replace function moderation_queue(p_limit int default 50)
returns table (report_id uuid, created_at timestamptz, reason text, detail text, target_user uuid, target_name text,
               message_body text, reporter_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff(array['moderator']) then raise exception 'moderators only'; end if;
  return query
    select r.id, r.created_at, r.reason, r.detail, r.target_user, shown_name(r.target_user),
           (select m.body from messages m where m.id = r.message_id and m.created_at = r.message_created_at),
           shown_name(r.reporter)
    from reports r where r.status = 'open'
    order by (r.reason = 'child_safety') desc, r.created_at limit p_limit;
end $$;

create or replace function moderate(p_user uuid, p_action text, p_reason text, p_until timestamptz default null,
                                    p_report uuid default null, p_message_id bigint default null,
                                    p_message_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff(array['moderator']) then raise exception 'moderators only'; end if;
  insert into moderation_actions (user_id, action, until, reason, report_id, acted_by)
  values (p_user, p_action, p_until, p_reason, p_report, (select auth.uid()));
  if p_action = 'remove_message' then
    update messages set body = null, payload = '{}', deleted_at = now()
    where id = p_message_id and created_at = p_message_at;
  end if;
  if p_report is not null then
    update reports set status = 'actioned', handled_by = (select auth.uid()), handled_at = now() where id = p_report;
  end if;
  perform notify(p_user, 'moderation', jsonb_build_object('action', p_action, 'until', p_until, 'reason', p_reason));
end $$;

-- ---------------------------------------------------------------------
-- 9. Badges
-- ---------------------------------------------------------------------
create table badges (
  code         text primary key,
  name         text not null,
  description  text not null,
  icon         text not null default 'star',
  edition_code text references editions(code),           -- null = any manual
  rule         jsonb not null default '{}'               -- read by the nightly badge job
);
insert into badges (code, name, description, icon, rule) values
  ('first_match',   'First Ride',       'Finished your first live match',                 'bus',    '{"matches": 1}'),
  ('daily_7',       'Seven-Day Route',  'Played the daily challenge 7 days in a row',     'route',  '{"daily_streak": 7}'),
  ('perfect_daily', 'Clean Sweep',      'Every daily challenge question right',           'sparkle','{"daily_perfect": true}'),
  ('lesson_master', 'Lesson Master',    'Every question in a lesson mature',              'crown',  '{"lesson_mature": 1}'),
  ('league_winner', 'League Champion',  'Finished first in a league',                     'trophy', '{"league_rank": 1}');
alter table badges enable row level security;
create policy read_all on badges for select to authenticated using (true);

create table user_badges (
  user_id      uuid not null references auth.users(id) on delete cascade,
  badge_code   text not null references badges(code),
  edition_code text not null default '',
  earned_at    timestamptz not null default now(),
  primary key (user_id, badge_code, edition_code)
);
alter table user_badges enable row level security;
create policy read_all on user_badges for select to authenticated using (true);   -- shown on profiles

-- ---------------------------------------------------------------------
-- 10. Bible text for "read in context" at the answer reveal. Public-domain translations are
--     stored here (loaded once with: rhemlo.cli load-bible). Copyrighted translations are never
--     stored; the app fetches them from a licensed provider through a server function.
--     The manual's printed text is always what is marked.
-- ---------------------------------------------------------------------
create table bible_translations (
  code          text primary key,                        -- 'KJV'
  name          text not null,
  language      text not null default 'en',
  public_domain boolean not null,
  license       text not null,
  source        text not null,                           -- where the text came from
  verse_count   integer not null default 0,
  loaded_at     timestamptz
);
create table bible_verses (
  translation text not null references bible_translations(code) on delete cascade,
  book        text not null,                             -- OSIS code, as in bible_refs.osis ('Col')
  chapter     smallint not null,
  verse       smallint not null,
  text        text not null,
  primary key (translation, book, chapter, verse)
);
alter table bible_translations enable row level security;
create policy read_all on bible_translations for select to authenticated using (true);
alter table bible_verses enable row level security;
create policy read_all on bible_verses for select to authenticated using (true);

-- the verses of one reference (e.g. 'Colossians 1:15-20' or 'Psalm 23'), in a stored translation
create or replace function scripture(p_ref_key text, p_translation text default null)
returns table (translation text, book text, chapter smallint, verse smallint, text text)
language sql stable security definer set search_path = public as $$
  with r as (select osis, segments from bible_refs where key = p_ref_key),
  tr as (select coalesce(p_translation, cfg('default_bible_translation') #>> '{}') as code),
  raw as (select r.osis, (s->>'c1')::int c1, (s->>'v1')::int v1, (s->>'c2')::int c2, (s->>'v2')::int v2
          from r, jsonb_array_elements(r.segments) s),
  seg as (select osis,                                 -- one-chapter books: 'Jude 19' means chapter 1, verse 19
                 case when one then 1 else c1 end as c1,
                 case when one then c1 else v1 end as v1,
                 case when one then 1 else coalesce(c2, c1) end as c2,
                 case when one then coalesce(c2, c1) else coalesce(v2, case when c2 is null then v1 end) end as v2
          from (select raw.*, osis in ('Obad', 'Phlm', '2John', '3John', 'Jude') and v1 is null as one from raw) x)
  select v.translation, v.book, v.chapter, v.verse, v.text
  from seg join bible_verses v on v.translation = (select code from tr) and v.book = seg.osis
   and (v.chapter, v.verse) >= (seg.c1, coalesce(seg.v1, 0))
   and (v.chapter, v.verse) <= (seg.c2, coalesce(seg.v2, 999))
  order by v.chapter, v.verse
$$;

-- everything to show for one question at the reveal: its references and their verses
create or replace function item_scripture(p_item bigint, p_translation text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('ref', k.key,
           'verses', (select jsonb_agg(jsonb_build_object('c', s.chapter, 'v', s.verse, 't', s.text))
                      from scripture(k.key, p_translation) s))), '[]'::jsonb)
  from items i
  cross join lateral (select r->>'key' as key from jsonb_array_elements(coalesce(i.answer->'refs', '[]')) r
                      union select i.prompt->>'ref' where i.prompt ? 'ref') k
  where i.id = p_item and i.edition_code in (select my_editions())
$$;

-- ---------------------------------------------------------------------
-- 11. Retiring a manual. 'retired' = season over: hidden from new study and play, history kept
--     and readable. ('archived' remains: withdrawn completely.)
-- ---------------------------------------------------------------------
alter table editions drop constraint editions_status_check;
alter table editions add constraint editions_status_check
  check (status in ('draft', 'published', 'retired', 'archived'));
alter table editions
  add column retired_at     timestamptz,
  add column retire_note    text,
  add column successor_code text references editions(code);

-- retired manuals stay readable to the people who had access, so history keeps working
create or replace function my_editions()
returns setof text
language sql stable security definer set search_path = public as $$
  with recursive mine as (
    select o.id, o.parent_id from organisations o
    join org_members m on m.org_id = o.id and m.user_id = (select auth.uid())
    union
    select p.id, p.parent_id from organisations p join mine on mine.parent_id = p.id
  )
  select e.code from editions e where e.status in ('published', 'retired') and e.access = 'open'
  union
  select ue.edition_code from user_entitlements ue join editions e on e.code = ue.edition_code
  where ue.user_id = (select auth.uid()) and e.status in ('published', 'retired')
    and now() >= ue.starts_at and (ue.ends_at is null or now() < ue.ends_at or e.status = 'retired')
  union
  select oa.edition_code from org_edition_access oa join mine on mine.id = oa.org_id
  join editions e on e.code = oa.edition_code
  where e.status in ('published', 'retired') and now() >= oa.starts_at
    and (oa.ends_at is null or now() < oa.ends_at or e.status = 'retired');
$$;

create or replace function set_active_manual(p_code text)
returns text language plpgsql security invoker as $$
declare uid uuid := (select auth.uid());
begin
  if not exists (select 1 from my_editions() m where m = p_code) then
    raise exception 'manual % is not available to you', p_code;
  end if;
  if (select status from editions where code = p_code) <> 'published' then
    raise exception 'manual % has been retired', p_code;
  end if;
  update user_manuals set is_active = false where user_id = uid and is_active and edition_code <> p_code;
  insert into user_manuals (user_id, edition_code, is_active, last_opened_at)
  values (uid, p_code, true, now())
  on conflict (user_id, edition_code) do update set is_active = true, last_opened_at = now();
  return p_code;
end $$;

drop policy read_published on editions;
create policy read_listed on editions for select to authenticated using (status in ('published', 'retired'));

drop view v_manual_library;
create view v_manual_library with (security_invoker = true) as
  select e.code, e.title, e.short_title, e.language, e.lesson_count, e.approved_count, e.item_count,
         e.published_at, e.access, e.status, e.retired_at, e.successor_code,
         e.code in (select my_editions())              as unlocked,
         um.user_id is not null                        as enrolled,
         coalesce(um.is_active, false)                 as is_active,
         (select count(*) from cards c
          where c.user_id = (select auth.uid()) and c.edition_code = e.code and c.reps > 0) as items_started
  from editions e
  left join user_manuals um on um.edition_code = e.code and um.user_id = (select auth.uid())
  where e.status = 'published' or (e.status = 'retired' and um.user_id is not null);

-- One call. Content editors (or the service role / CLI) only.
create or replace function retire_manual(p_code text, p_successor text default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n_users int; n_leagues int; n_matches int; n_classes int;
begin
  if (select auth.uid()) is not null and not is_staff(array['content_editor']) then
    raise exception 'content editors only';
  end if;
  if not exists (select 1 from editions where code = p_code and status = 'published') then
    raise exception 'manual % is not published', p_code;
  end if;
  update editions set status = 'retired', retired_at = now(), retire_note = p_note, successor_code = p_successor
  where code = p_code;
  update seasons set status = 'final', ends_at = least(ends_at, now()) where edition_code = p_code and status <> 'final';
  update leagues set status = 'closed', ends_at = coalesce(ends_at, now()) where edition_code = p_code and status = 'open';
  get diagnostics n_leagues = row_count;
  update matches set status = 'cancelled', finished_at = now() where edition_code = p_code and status in ('lobby', 'live')
    and kind <> 'daily';
  get diagnostics n_matches = row_count;
  update groups set archived_at = now() where edition_code = p_code and archived_at is null;
  get diagnostics n_classes = row_count;
  update user_manuals set is_active = false where edition_code = p_code and is_active;
  insert into inbox (user_id, kind, payload)
  select um.user_id, 'manual_retired', jsonb_build_object('code', p_code, 'successor', p_successor, 'note', p_note)
  from user_manuals um where um.edition_code = p_code;
  get diagnostics n_users = row_count;
  return jsonb_build_object('manual', p_code, 'users_notified', n_users, 'leagues_closed', n_leagues,
                            'matches_cancelled', n_matches, 'classes_archived', n_classes);
end $$;

-- ---------------------------------------------------------------------
-- 12. Function permissions. Internal functions are not callable from the app.
-- ---------------------------------------------------------------------
do $$
declare f text; r text;
begin
  foreach f in array array['award_points(uuid,text,text,text,integer)', 'notify(uuid,text,jsonb)',
                           'pick_match_questions(uuid,text)', 'grade_item(bigint,text,text)',
                           'org_subtree_members(uuid)', 'is_minor(uuid)', 'is_blocked(uuid,uuid)',
                           'refresh_league_standings(uuid)', 'ensure_league_standings(uuid)']
  loop
    execute format('revoke execute on function %s from public', f);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke execute on function %s from %I', f, r);
      end if;
    end loop;
  end loop;
  -- retire_manual: never for signed-out callers
  revoke execute on function retire_manual(text, text, text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function retire_manual(text, text, text) from anon;
  end if;
  grant execute on function retire_manual(text, text, text) to authenticated;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function retire_manual(text, text, text) to service_role;
  end if;
end $$;

-- Live updates (Supabase Realtime): lobby, scores and chat. Partitioned messages are published
-- through their parent table.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime set (publish_via_partition_root = true);
    alter publication supabase_realtime add table matches, match_players, messages, inbox;
  end if;
end $$;
