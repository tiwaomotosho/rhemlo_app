-- =====================================================================
-- Rhemlo · 0005_organisations_access.sql
-- Built in now so growth does not need a new data model later:
--   * organisations in a hierarchy (e.g. region -> province -> zone -> parish, or a school),
--     with members and roles (member, coach, admin);
--   * classes (groups) with a join code, students and coaches, tied to one manual;
--   * manual access: a manual is 'open' (every signed-in user) or 'licensed' (only users with an
--     entitlement, given directly or through an organisation, including parent organisations);
--   * content rows readable only for manuals the user may access;
--   * coaches see their class's progress totals, never individual answers;
--   * coaches set work for a class (a mock, lessons to learn, a review target) with a due date;
--   * open-ended settings on organisations and classes, so new options need no table change.
-- =====================================================================

alter table editions add column access text not null default 'open' check (access in ('open', 'licensed'));

create table organisations (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references organisations(id) on delete set null,
  name       text not null,
  kind       text not null default 'other' check (kind in (
               'denomination', 'region', 'province', 'zone', 'area', 'parish', 'school', 'company', 'other')),
  settings   jsonb not null default '{}',              -- branding, defaults for its classes, etc.
  created_at timestamptz not null default now()
);
create index organisations_parent_idx on organisations (parent_id);

create table org_members (
  org_id    uuid not null references organisations(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('member', 'coach', 'admin')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on org_members (user_id);

create table groups (                                 -- a class / cohort studying one manual
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organisations(id) on delete cascade,
  edition_code text not null references editions(code),
  name         text not null,
  join_code    text unique,                           -- e.g. 'YAYA-7Q2K'; null = invite only
  settings     jsonb not null default '{}',             -- e.g. {"leaderboard": false, "pace": "Q1 by 13 Dec"}
  archived_at  timestamptz,                             -- class finished; kept for history
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index groups_org_idx on groups (org_id);

create table group_members (
  group_id  uuid not null references groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'student' check (role in ('student', 'coach')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on group_members (user_id);

create table group_assignments (                       -- work a coach sets for a class
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references groups(id) on delete cascade,
  kind         text not null check (kind in ('mock', 'learn_lessons', 'review_target', 'other')),
  title        text not null,
  scope        jsonb not null default '{}',             -- mock: same shape as mocks.scope; learn_lessons: {"lessons":[1,4]}
  opens_at     timestamptz not null default now(),
  due_at       timestamptz,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index group_assignments_group_idx on group_assignments (group_id, due_at);

-- a mock taken for an assignment points back to it, so coaches see who has done it
alter table mocks add column assignment_id uuid references group_assignments(id) on delete set null;
create index mocks_assignment_idx on mocks (assignment_id) where assignment_id is not null;

create table org_edition_access (                     -- an organisation (and everything under it) may use a manual
  org_id       uuid not null references organisations(id) on delete cascade,
  edition_code text not null references editions(code),
  seats        integer,                               -- null = unlimited
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  primary key (org_id, edition_code)
);

create table user_entitlements (                      -- a user may use a manual (purchase, gift, trial...)
  user_id      uuid not null references auth.users(id) on delete cascade,
  edition_code text not null references editions(code),
  source       text not null check (source in ('purchase', 'gift', 'trial', 'admin')),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz,
  reference    text,                                  -- payment or voucher reference
  primary key (user_id, edition_code, source)
);

-- ---------------------------------------------------------------------
-- my_editions(): the manuals the signed-in user may read. Postgres evaluates it once per query
-- (it is used as "edition_code in (select my_editions())"), so content reads stay index-fast.
-- ---------------------------------------------------------------------
create or replace function my_editions()
returns setof text
language sql stable security definer set search_path = public as $$
  with recursive mine as (                            -- my organisations and all their ancestors
    select o.id, o.parent_id from organisations o
    join org_members m on m.org_id = o.id and m.user_id = (select auth.uid())
    union
    select p.id, p.parent_id from organisations p join mine on mine.parent_id = p.id
  )
  select e.code from editions e where e.status = 'published' and e.access = 'open'
  union
  select ue.edition_code from user_entitlements ue join editions e on e.code = ue.edition_code
  where ue.user_id = (select auth.uid()) and e.status = 'published'
    and now() >= ue.starts_at and (ue.ends_at is null or now() < ue.ends_at)
  union
  select oa.edition_code from org_edition_access oa join mine on mine.id = oa.org_id
  join editions e on e.code = oa.edition_code
  where e.status = 'published' and now() >= oa.starts_at and (oa.ends_at is null or now() < oa.ends_at);
$$;

-- content: replace "read everything" with "read the manuals I may access"
do $$
declare t text;
begin
  foreach t in array array['lessons','elements','outline_points','blocks','list_items','table_cells','questions',
                           'sentences','tokens','ref_occurrences','items','item_distractors']
  loop
    execute format('drop policy read_all on %I', t);
    execute format('create policy read_entitled on %I for select to authenticated
                    using (edition_code in (select my_editions()))', t);
  end loop;
  -- review material stays with the content team (service role) only
  drop policy read_all on anomalies;
  drop policy read_all on content_history;
  -- the library shows every published manual, including ones the user has not unlocked yet
  drop policy read_all on editions;
  create policy read_published on editions for select to authenticated using (status = 'published');
end $$;

-- opening a manual now also requires access to it
create or replace function set_active_manual(p_code text)
returns text
language plpgsql
security invoker
as $$
declare uid uuid := (select auth.uid());
begin
  if not exists (select 1 from my_editions() m where m = p_code) then
    raise exception 'manual % is not available to you', p_code;
  end if;
  update user_manuals set is_active = false where user_id = uid and is_active and edition_code <> p_code;
  insert into user_manuals (user_id, edition_code, is_active, last_opened_at)
  values (uid, p_code, true, now())
  on conflict (user_id, edition_code) do update set is_active = true, last_opened_at = now();
  return p_code;
end $$;

-- the library with a "locked" flag for manuals the user cannot open yet
drop view v_manual_library;
create view v_manual_library with (security_invoker = true) as
  select e.code, e.title, e.short_title, e.language, e.lesson_count, e.approved_count, e.item_count,
         e.published_at, e.access,
         e.code in (select my_editions())              as unlocked,
         um.user_id is not null                        as enrolled,
         coalesce(um.is_active, false)                 as is_active,
         (select count(*) from cards c
          where c.user_id = (select auth.uid()) and c.edition_code = e.code and c.reps > 0) as items_started
  from editions e
  left join user_manuals um on um.edition_code = e.code and um.user_id = (select auth.uid())
  where e.status = 'published';

-- ---------------------------------------------------------------------
-- Organisations and classes: who can see what
-- ---------------------------------------------------------------------
create or replace function is_group_coach(p_group uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = (select auth.uid())
                 and role = 'coach')
      or exists (select 1 from groups g join org_members m on m.org_id = g.org_id
                 where g.id = p_group and m.user_id = (select auth.uid()) and m.role in ('coach', 'admin'));
$$;

alter table organisations enable row level security;
create policy members_read on organisations for select to authenticated
  using (exists (select 1 from org_members m where m.org_id = id and m.user_id = (select auth.uid())));

alter table org_members enable row level security;
create policy own_membership on org_members for select to authenticated
  using (user_id = (select auth.uid()));

alter table groups enable row level security;
create policy members_read on groups for select to authenticated
  using (exists (select 1 from group_members gm where gm.group_id = id and gm.user_id = (select auth.uid()))
         or is_group_coach(id));

alter table group_members enable row level security;
create policy self_or_coach on group_members for select to authenticated
  using (user_id = (select auth.uid()) or is_group_coach(group_id));
create policy leave_group on group_members for delete to authenticated
  using (user_id = (select auth.uid()));

alter table group_assignments enable row level security;
create policy members_read on group_assignments for select to authenticated
  using (exists (select 1 from group_members gm where gm.group_id = group_assignments.group_id
                 and gm.user_id = (select auth.uid())) or is_group_coach(group_id));
create policy coaches_write on group_assignments for all to authenticated
  using (is_group_coach(group_id)) with check (is_group_coach(group_id));

alter table org_edition_access enable row level security;
alter table user_entitlements enable row level security;
create policy own_entitlements on user_entitlements for select to authenticated
  using (user_id = (select auth.uid()));
-- writes to organisations, memberships, access and entitlements go through the service role
-- (admin tools, payment webhooks) or the functions below.

create or replace function join_group(p_join_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select id into g from groups where join_code = p_join_code;
  if g is null then
    raise exception 'no class with that code';
  end if;
  insert into group_members (group_id, user_id) values (g, (select auth.uid())) on conflict do nothing;
  return g;
end $$;

-- coach view: progress totals for a class, never individual answers
create or replace function group_progress(p_group uuid)
returns table (user_id uuid, display_name text, lesson_uid text, items_started integer, items_mature integer,
               accuracy_30d real, last_reviewed_at timestamptz, mastery_level smallint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_group_coach(p_group) then
    raise exception 'only coaches of this class can see its progress';
  end if;
  return query
    select gm.user_id, p.display_name, ulp.lesson_uid, ulp.items_started, ulp.items_mature,
           ulp.accuracy_30d, ulp.last_reviewed_at, ulp.mastery_level
    from group_members gm
    join groups g on g.id = gm.group_id
    left join profiles p on p.user_id = gm.user_id
    left join user_lesson_progress ulp on ulp.user_id = gm.user_id and ulp.edition_code = g.edition_code
    where gm.group_id = p_group and gm.role = 'student';
end $$;

create or replace function group_daily(p_group uuid, p_days integer default 30)
returns table (day date, active_students bigint, reviews bigint, correct bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_group_coach(p_group) then
    raise exception 'only coaches of this class can see its progress';
  end if;
  return query
    select d.day, count(distinct d.user_id), sum(d.reviews)::bigint, sum(d.correct)::bigint
    from group_members gm join groups g on g.id = gm.group_id
    join user_daily_stats d on d.user_id = gm.user_id and d.edition_code = g.edition_code
    where gm.group_id = p_group and gm.role = 'student' and d.day >= current_date - p_days
    group by d.day order by d.day;
end $$;

-- coach view: who in the class has submitted the mock set by an assignment, and their score
create or replace function assignment_results(p_assignment uuid)
returns table (user_id uuid, display_name text, submitted_at timestamptz, score real)
language plpgsql stable security definer set search_path = public as $$
declare g uuid;
begin
  select group_id into g from group_assignments where id = p_assignment;
  if g is null or not is_group_coach(g) then
    raise exception 'only coaches of this class can see its results';
  end if;
  return query
    select gm.user_id, p.display_name, m.submitted_at, m.score
    from group_members gm
    left join profiles p on p.user_id = gm.user_id
    left join lateral (select mk.submitted_at, mk.score from mocks mk
                       where mk.assignment_id = p_assignment and mk.user_id = gm.user_id and mk.submitted_at is not null
                       order by mk.score desc nulls last limit 1) m on true
    where gm.group_id = g and gm.role = 'student';
end $$;
