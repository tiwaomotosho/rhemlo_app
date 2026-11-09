-- =====================================================================
-- Rhemlo · 0003_progress.sql
-- Layer 4: each user's own study data, designed for thousands of users.
--
-- Scale design (PRD 12.24):
--   * cards: one row per (user, question). Compact keys (uuid + bigint), the manual's code kept
--     on the row, and one index that answers "what is due now in my open manual".
--   * review_logs and error_events: append-only, split into monthly partitions, so the biggest
--     tables stay fast and old months can be archived or dropped without touching the rest.
--   * user_daily_stats and user_lesson_progress: small running totals for dashboards, so no
--     screen ever adds up millions of raw answers.
--   * Every table has user_id and Row-Level Security written as (select auth.uid()), which
--     Postgres evaluates once per query instead of once per row.
-- Requires Supabase (auth.users, auth.uid()). For local testing run db/test/supabase_stub.sql first.
-- =====================================================================

create table profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone     text not null default 'Africa/Lagos',
  locale       text not null default 'en',
  created_at   timestamptz not null default now()
);

create table user_settings (
  user_id                    uuid primary key references auth.users(id) on delete cascade,
  study_windows              jsonb not null default '[{"from":"06:00","to":"22:00"}]',
  reminders                  jsonb not null default '{"push":true,"email":false}',
  desired_retention_override numeric(3,2) check (desired_retention_override between 0.70 and 0.99),
  daily_new_cap_override     integer check (daily_new_cap_override between 0 and 500),
  fsrs_parameters            jsonb,                 -- personal FSRS weights once optimised
  session_size               smallint not null default 20 check (session_size between 5 and 100),
                                                    -- questions per sitting; due work is split into sittings of this size
  daily_review_cap           integer check (daily_review_cap between 10 and 1000),
                                                    -- most reviews offered per day (null = all due)
  updated_at                 timestamptz not null default now()
);

create table phases (                                 -- the study calendar of one manual (PRD 6.2)
  id                   bigint generated always as identity primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  edition_code         text not null references editions(code),
  code                 text not null,                 -- 'P1' .. 'P6'
  name                 text not null,
  starts_on            date not null,
  ends_on              date not null,
  lesson_from          smallint,
  lesson_to            smallint,
  new_lessons_per_week numeric(3,1) not null default 0,
  desired_retention    numeric(3,2) not null check (desired_retention between 0.70 and 0.99),
  check (ends_on >= starts_on),
  unique (user_id, edition_code, code)
);

create table plan_entries (                           -- when each lesson is introduced
  user_id      uuid not null references auth.users(id) on delete cascade,
  lesson_uid   text not null references lessons(uid),
  edition_code text generated always as (split_part(lesson_uid, ':', 1)) stored,
  starts_on    date not null,
  status       text not null default 'planned'
               check (status in ('planned', 'learning', 'learned', 'mastered')),
  primary key (user_id, lesson_uid)
);

create table cards (                                  -- one per (user, question): the FSRS memory state
  user_id        uuid not null references auth.users(id) on delete cascade,
  item_id        bigint not null references items(id) on delete cascade,
  edition_code   text not null,                       -- copied from the question, for the due index
  state          smallint not null default 0 check (state between 0 and 3),  -- 0 new 1 learning 2 review 3 relearning
  due            timestamptz not null default now(),
  stability      real not null default 0,
  difficulty     real not null default 0,
  elapsed_days   integer not null default 0,
  scheduled_days integer not null default 0,
  learning_steps smallint not null default 0,
  reps           integer not null default 0,
  lapses         integer not null default 0,
  last_review    timestamptz,
  is_leech       boolean not null default false,    -- 6+ lapses (PRD FR-SC-06)
  suspended      boolean not null default false,
  buried_until   timestamptz,                       -- sibling burying (PRD FR-SC-05)
  updated_at     timestamptz not null default now(),
  primary key (user_id, item_id)
);
-- the app's busiest question: "what is due now in my open manual?" -> one index range scan
create index cards_due_idx     on cards (user_id, edition_code, due) where not suspended;
-- incremental sync: "which of my cards changed since my last sync?"
create index cards_updated_idx on cards (user_id, updated_at);

create table sessions (
  id           uuid primary key,                      -- created on the device (UUIDv7 recommended)
  user_id      uuid not null references auth.users(id) on delete cascade,
  edition_code text references editions(code),
  mode         text not null check (mode in (
                 'today', 'learn', 'target', 'mastery_check', 'quickfire', 'cbt_mock',
                 'repair', 'discrimination', 'trap_gauntlet', 'listen', 'custom')),
  settings     jsonb not null default '{}',           -- target practice: {"lessons":[1,3],"count":15,"kinds":[...],"formats":[...],"timed":false}
  started_at   timestamptz not null,
  ended_at     timestamptz,
  items_done   integer not null default 0,
  correct      integer not null default 0,
  device       text
);
create index sessions_user_idx on sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------
-- Answer log: append-only, one row per answer, monthly partitions.
-- Memory state before and after is stored as typed columns (the FSRS optimiser needs them).
-- ---------------------------------------------------------------------
create table review_logs (
  id                uuid not null,                    -- created on the device (UUIDv7), so resends never duplicate
  reviewed_at       timestamptz not null,
  user_id           uuid not null references auth.users(id) on delete cascade,
  item_id           bigint not null references items(id),
  edition_code      text not null,
  session_id        uuid,                             -- soft link to sessions (no lock on hot writes)
  format            text not null check (format in ('typed', 'mcq')),
  answer_text       text,                             -- exactly what was typed
  chosen_option     smallint,
  is_correct        boolean not null,
  score             real not null check (score between 0 and 1),
  rating            smallint not null check (rating between 1 and 4),   -- 1 again 2 hard 3 good 4 easy
  response_ms       integer not null check (response_ms >= 0),
  state_before      smallint not null,
  stability_before  real,
  difficulty_before real,
  elapsed_days      integer not null default 0,
  state_after       smallint not null,
  stability_after   real not null,
  difficulty_after  real not null,
  scheduled_days    integer not null default 0,
  due_after         timestamptz not null,
  device            text,
  received_at       timestamptz not null default now(),
  primary key (id, reviewed_at)
) partition by range (reviewed_at);
create index review_logs_user_idx on review_logs (user_id, reviewed_at desc);

create table error_events (                           -- one row per mistake inside an answer
  review_id      uuid not null,
  reviewed_at    timestamptz not null,
  position       smallint not null,                   -- 1st, 2nd... mistake in that answer
  user_id        uuid not null references auth.users(id) on delete cascade,
  item_id        bigint not null references items(id),
  edition_code   text not null,
  sentence_uid   text,
  token_position smallint,
  error_type     text not null check (error_type in (
                   'spelling', 'hyphenation', 'wrong_word', 'synonym', 'omission', 'insertion',
                   'order', 'name', 'reference_number', 'wrong_lesson', 'wrong_role')),
  expected       text,
  given          text,
  trap_pattern   text,
  primary key (review_id, position, reviewed_at),
  foreign key (review_id, reviewed_at) references review_logs (id, reviewed_at) on delete cascade
) partition by range (reviewed_at);
create index error_events_user_idx on error_events (user_id, error_type, reviewed_at desc);

-- Monthly partitions: created ahead of time by this function (run at deploy and nightly).
-- A default partition catches anything outside the created months, so no answer is ever lost.
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
    foreach t in array array['review_logs', 'error_events'] loop
      if to_regclass(format('%I_%s', t, to_char(m, 'YYYYMM'))) is null then
        execute format('create table %I partition of %I for values from (%L) to (%L)',
                       t || '_' || to_char(m, 'YYYYMM'), t, m, (m + interval '1 month')::date);
        made := made + 1;
      end if;
    end loop;
  end loop;
  return made;
end $$;

create table review_logs_default  partition of review_logs  default;
create table error_events_default partition of error_events default;
select ensure_log_partitions(2, 12);

-- ---------------------------------------------------------------------
-- Running totals for dashboards (small: one row per user per manual per day / per lesson)
-- ---------------------------------------------------------------------
create table user_daily_stats (
  user_id      uuid not null references auth.users(id) on delete cascade,
  edition_code text not null,
  day          date not null,                         -- in the user's time zone
  reviews      integer not null default 0,
  correct      integer not null default 0,
  new_items    integer not null default 0,
  study_ms     bigint not null default 0,
  primary key (user_id, edition_code, day)
);

create table user_lesson_progress (                   -- refreshed by refresh_lesson_progress()
  user_id         uuid not null references auth.users(id) on delete cascade,
  lesson_uid      text not null references lessons(uid),
  edition_code    text generated always as (split_part(lesson_uid, ':', 1)) stored,
  items_total     integer not null default 0,
  items_started   integer not null default 0,
  items_mature    integer not null default 0,         -- stability >= 21 days
  accuracy_30d    real,
  median_ms_30d   integer,
  last_reviewed_at timestamptz,
  mastery_level   smallint not null default 0 check (mastery_level between 0 and 5),  -- PRD 8.1
  updated_at      timestamptz not null default now(),
  primary key (user_id, lesson_uid)
);

create table mocks (
  id            uuid primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  edition_code  text not null references editions(code),
  scope         jsonb not null,                       -- {"lessons":[1,12],"formats":["typed","mcq"],"count":60}
  time_limit_s  integer not null,
  started_at    timestamptz not null,
  submitted_at  timestamptz,
  score         real
);
create index mocks_user_idx on mocks (user_id, started_at desc);

create table mock_answers (
  mock_id       uuid not null references mocks(id) on delete cascade,
  position      smallint not null,
  item_id       bigint not null references items(id),
  format        text not null check (format in ('typed', 'mcq')),
  answer_text   text,
  chosen_option smallint,
  is_correct    boolean,
  response_ms   integer,
  flagged       boolean not null default false,
  primary key (mock_id, position)
);

create table push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);
create index push_user_idx on push_subscriptions (user_id);

create table notification_log (                       -- kept 90 days (prune_old_rows)
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  channel     text not null check (channel in ('push', 'email', 'whatsapp')),
  kind        text not null,
  sent_at     timestamptz not null default now(),
  status      text not null check (status in ('sent', 'failed', 'skipped_quiet_hours'))
);
create index notification_user_idx on notification_log (user_id, sent_at desc);

-- ---------------------------------------------------------------------
-- Row-Level Security: each user sees and changes only their own rows.
-- (select auth.uid()) is evaluated once per query, not once per row.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','phases','plan_entries','cards','sessions',
                           'review_logs','error_events','user_daily_stats','user_lesson_progress',
                           'mocks','push_subscriptions','notification_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy own_rows on %I for all to authenticated
                    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

alter table mock_answers enable row level security;
create policy own_rows on mock_answers for all to authenticated
  using (exists (select 1 from mocks m where m.id = mock_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from mocks m where m.id = mock_id and m.user_id = (select auth.uid())));

-- content and question bank: read-only for signed-in users (narrowed per manual in 0005);
-- only the service role (loader, generator) writes
do $$
declare t text;
begin
  foreach t in array array['editions','lessons','elements','outline_points','blocks','list_items',
                           'table_cells','questions','sentences','tokens','bible_refs',
                           'ref_occurrences','anomalies','content_history','items','item_distractors']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy read_all on %I for select to authenticated using (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- submit_reviews: the one write the app makes after answering questions.
-- Takes a batch (up to ~200) of answers queued on the device, in one set-based statement:
--   * stores each answer once (safe to resend: same id + reviewed_at is ignored),
--   * stores its mistakes,
--   * moves each card to its newest state (an older answer never overwrites a newer one),
--   * adds to today's running totals.
-- Answer format (one element):
--   {"id": uuid, "item_uid": "I-…", "session_id": uuid|null, "reviewed_at": ts, "format": "typed"|"mcq",
--    "answer_text": str, "chosen_option": int|null, "is_correct": bool, "score": 0..1, "rating": 1..4,
--    "response_ms": int, "new_item": bool, "day": "YYYY-MM-DD" (user's local date),
--    "before": {"state", "stability", "difficulty", "elapsed_days"},
--    "after":  {"state", "stability", "difficulty", "scheduled_days", "due", "reps", "lapses", "learning_steps"},
--    "errors": [{"error_type", "expected", "given", "sentence_uid", "token_position", "trap_pattern"}]}
-- Returns the number of answers that were new.
-- ---------------------------------------------------------------------
create or replace function submit_reviews(batch jsonb)
returns integer
language plpgsql
security invoker
as $$
declare
  uid uuid := (select auth.uid());
  inserted integer;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  -- One statement, no temporary tables: safe and cheap behind a transaction-mode connection pooler.
  with src as (
    select (r->>'id')::uuid                       as id,
           (r->>'reviewed_at')::timestamptz        as reviewed_at,
           i.id                                    as item_id,
           i.edition_code,
           (r->>'session_id')::uuid                as session_id,
           r->>'format'                            as format,
           r->>'answer_text'                       as answer_text,
           (r->>'chosen_option')::smallint         as chosen_option,
           (r->>'is_correct')::boolean             as is_correct,
           (r->>'score')::real                     as score,
           (r->>'rating')::smallint                as rating,
           (r->>'response_ms')::integer            as response_ms,
           coalesce((r->>'new_item')::boolean, false) as new_item,
           coalesce((r->>'day')::date, ((r->>'reviewed_at')::timestamptz)::date) as day,
           r->'before' as b, r->'after' as a, coalesce(r->'errors', '[]'::jsonb) as errors,
           r->>'device' as device
    from jsonb_array_elements(batch) r
    join items i on i.uid = r->>'item_uid'
  ), ins as (
    insert into review_logs (id, reviewed_at, user_id, item_id, edition_code, session_id, format, answer_text,
                             chosen_option, is_correct, score, rating, response_ms, state_before, stability_before,
                             difficulty_before, elapsed_days, state_after, stability_after, difficulty_after,
                             scheduled_days, due_after, device)
    select id, reviewed_at, uid, item_id, edition_code, session_id, format, answer_text, chosen_option, is_correct,
           score, rating, response_ms, coalesce((b->>'state')::smallint, 0), (b->>'stability')::real,
           (b->>'difficulty')::real, coalesce((b->>'elapsed_days')::int, 0), (a->>'state')::smallint,
           (a->>'stability')::real, (a->>'difficulty')::real, coalesce((a->>'scheduled_days')::int, 0),
           (a->>'due')::timestamptz, device
    from src
    on conflict (id, reviewed_at) do nothing
    returning id, reviewed_at
  ), new as (                                         -- only answers not seen before
    select distinct on (src.id, src.reviewed_at) src.* from src join ins using (id, reviewed_at)
  ), errs as (
    insert into error_events (review_id, reviewed_at, position, user_id, item_id, edition_code, sentence_uid,
                              token_position, error_type, expected, given, trap_pattern)
    select n.id, n.reviewed_at, e.ord::smallint, uid, n.item_id, n.edition_code, e.v->>'sentence_uid',
           (e.v->>'token_position')::smallint, e.v->>'error_type', e.v->>'expected', e.v->>'given',
           e.v->>'trap_pattern'
    from new n, jsonb_array_elements(n.errors) with ordinality as e(v, ord)
  ), crd as (                                         -- newest answer per card wins
    insert into cards as c (user_id, item_id, edition_code, state, due, stability, difficulty, elapsed_days,
                            scheduled_days, learning_steps, reps, lapses, last_review, is_leech, updated_at)
    select distinct on (item_id) uid, item_id, edition_code, (a->>'state')::smallint, (a->>'due')::timestamptz,
           (a->>'stability')::real, (a->>'difficulty')::real, coalesce((b->>'elapsed_days')::int, 0),
           coalesce((a->>'scheduled_days')::int, 0), coalesce((a->>'learning_steps')::smallint, 0),
           coalesce((a->>'reps')::int, 0), coalesce((a->>'lapses')::int, 0), reviewed_at,
           coalesce((a->>'lapses')::int, 0) >= 6, now()
    from new
    order by item_id, reviewed_at desc
    on conflict (user_id, item_id) do update
      set state = excluded.state, due = excluded.due, stability = excluded.stability,
          difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
          scheduled_days = excluded.scheduled_days, learning_steps = excluded.learning_steps,
          reps = excluded.reps, lapses = excluded.lapses, last_review = excluded.last_review,
          is_leech = c.is_leech or excluded.is_leech, updated_at = now()
      where c.last_review is null or excluded.last_review > c.last_review
  ), stats as (                                       -- today's running totals
    insert into user_daily_stats as d (user_id, edition_code, day, reviews, correct, new_items, study_ms)
    select uid, edition_code, day, count(*), count(*) filter (where is_correct), count(*) filter (where new_item),
           sum(response_ms)
    from new group by edition_code, day
    on conflict (user_id, edition_code, day) do update
      set reviews = d.reviews + excluded.reviews, correct = d.correct + excluded.correct,
          new_items = d.new_items + excluded.new_items, study_ms = d.study_ms + excluded.study_ms
  )
  select count(*) into inserted from new;

  return inserted;
end $$;

-- ---------------------------------------------------------------------
-- refresh_lesson_progress: recompute one user's per-lesson totals (nightly job, or after a session).
-- ---------------------------------------------------------------------
create or replace function refresh_lesson_progress(p_user uuid, p_edition text)
returns integer language sql as $$
  with totals as (
    select i.lesson_uid, count(*) as items_total
    from items i where i.edition_code = p_edition and i.active group by i.lesson_uid
  ), mine as (
    select i.lesson_uid,
           count(*) filter (where c.reps > 0)          as items_started,
           count(*) filter (where c.stability >= 21)   as items_mature,
           max(c.last_review)                          as last_reviewed_at
    from cards c join items i on i.id = c.item_id
    where c.user_id = p_user and c.edition_code = p_edition group by i.lesson_uid
  ), recent as (
    select i.lesson_uid, avg(r.is_correct::int)::real as accuracy_30d,
           (percentile_cont(0.5) within group (order by r.response_ms))::int as median_ms_30d
    from review_logs r join items i on i.id = r.item_id
    where r.user_id = p_user and r.edition_code = p_edition and r.reviewed_at > now() - interval '30 days'
    group by i.lesson_uid
  ), up as (
    insert into user_lesson_progress as p (user_id, lesson_uid, items_total, items_started, items_mature,
                                           accuracy_30d, median_ms_30d, last_reviewed_at, updated_at)
    select p_user, t.lesson_uid, t.items_total, coalesce(m.items_started, 0), coalesce(m.items_mature, 0),
           r.accuracy_30d, r.median_ms_30d, m.last_reviewed_at, now()
    from totals t left join mine m using (lesson_uid) left join recent r using (lesson_uid)
    where m.lesson_uid is not null
    on conflict (user_id, lesson_uid) do update
      set items_total = excluded.items_total, items_started = excluded.items_started,
          items_mature = excluded.items_mature, accuracy_30d = excluded.accuracy_30d,
          median_ms_30d = excluded.median_ms_30d, last_reviewed_at = excluded.last_reviewed_at, updated_at = now()
    returning 1
  )
  select count(*)::int from up;
$$;

-- ---------------------------------------------------------------------
-- practice_set: the questions for a target-practice sitting or a lesson mastery check.
--   mode 'target'  : any lessons, any count (5-100), optional kinds and formats. Balanced across the chosen
--                    lessons and kinds; questions you got wrong recently and due ones first, then ones you
--                    have not seen, then the rest. One question per sentence (siblings are not repeated).
--   mode 'mastery' : one lesson, about 25 questions sampling every part: memory verse, Bible passage,
--                    outline, every section, lists, references, sentence order and spelling.
-- Returns item ids in the order to ask them. Answers are saved through submit_reviews as usual,
-- so target practice also moves the memory schedule forward.
-- ---------------------------------------------------------------------
create or replace function practice_set(p_edition text, p_lessons int[], p_count int default 20,
                                        p_mode text default 'target', p_kinds text[] default null,
                                        p_formats text[] default null)
returns table (item_id bigint, item_uid text, type text, lesson_uid text, seq int)
language sql stable security invoker as $$
  with me as (select (select auth.uid()) as uid),
  pool as (
    select i.id, i.uid, i.type, i.lesson_uid, i.sibling_key, i.target_uid,
           case when i.target_uid ~ '\.R[0-9]+$' then 'REF'
                when i.target_uid ~ '\.(MV|BP|OUT)' then substring(i.target_uid from '\.(MV|BP|OUT)')
                else coalesce(substring(i.target_uid from ':L[0-9]+\.([A-Z]+[0-9]*)'), 'LESSON') end as part,
           c.due, c.lapses, c.reps,
           exists (select 1 from review_logs r, me where r.user_id = me.uid and r.item_id = i.id
                   and r.reviewed_at > now() - interval '14 days' and not r.is_correct) as missed
    from items i
    join lessons l on l.uid = i.lesson_uid
    left join cards c on c.item_id = i.id and c.user_id = (select uid from me)
    where i.edition_code = p_edition and i.active and l.status = 'approved'
      and l.number = any(p_lessons)
      and (p_kinds is null or i.type = any(p_kinds))
      and (p_formats is null or i.formats && p_formats)
  ),
  one_per_sibling as (                                -- never two questions on the same sentence
    select distinct on (sibling_key) * from pool
    order by sibling_key, missed desc, (due is not null and due <= now()) desc, (reps is null) desc,
             md5(uid || current_date::text)
  ),
  ranked as (
    select o.*,
           row_number() over (partition by case when p_mode = 'mastery' then o.part else o.lesson_uid end,
                                           case when p_mode = 'mastery' then '' else o.type end
                              order by o.missed desc, (o.due is not null and o.due <= now()) desc,
                                       (o.reps is null) desc, md5(o.uid || current_date::text)) as rk
    from one_per_sibling o
  ),
  picked as (
    select * from ranked
    order by rk, md5(uid || 'mix' || current_date::text)
    limit least(greatest(case when p_mode = 'mastery' then coalesce(p_count, 25) else p_count end, 5), 100)
  )
  select id, uid, type, lesson_uid, (row_number() over (order by md5(uid || 'order' || current_date::text)))::int
  from picked order by 5
$$;

-- housekeeping for the nightly job: partitions ahead, short-lived logs pruned
create or replace function prune_old_rows()
returns void language sql as $$
  delete from notification_log where sent_at < now() - interval '90 days';
$$;

-- ---------------------------------------------------------------------
-- Views used by the app
-- ---------------------------------------------------------------------
create view v_due_now with (security_invoker = true) as
  select c.user_id, c.item_id, i.uid as item_uid, i.lesson_uid, c.edition_code, i.type, c.due, c.state
  from cards c join items i on i.id = c.item_id
  where not c.suspended and c.due <= now()
    and (c.buried_until is null or c.buried_until <= now()) and i.active;

create view v_lesson_retention with (security_invoker = true) as
  select user_id, lesson_uid, edition_code, items_started, items_mature, accuracy_30d, median_ms_30d,
         last_reviewed_at, mastery_level
  from user_lesson_progress;
