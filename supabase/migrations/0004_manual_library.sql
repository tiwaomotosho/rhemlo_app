-- =====================================================================
-- Rhemlo · 0004_manual_library.sql
-- Several manuals side by side, and switching between them in the app.
-- A "manual" is a row in editions (code e.g. 'EN2627'). Everything else
-- already carries the code in its uid ('EN2627:L01.S1.P1.s2'), so manuals
-- never collide. Your progress in each manual is kept when you switch.
-- =====================================================================

alter table editions
  add column short_title      text,
  add column status           text not null default 'draft'
                              check (status in ('draft', 'published', 'archived')),
  add column profile          jsonb,                -- the manual.json it was built with
  add column lesson_count     integer not null default 0,
  add column approved_count   integer not null default 0,
  add column item_count       integer not null default 0,
  add column published_at     timestamptz;

-- manuals may have extra prose parts (e.g. "AIM", "PRAYER POINT"), stored as type 'note'
alter table elements drop constraint elements_type_check;
alter table elements add constraint elements_type_check check (type in (
  'memory_verse', 'bible_passage', 'introduction', 'outline', 'section', 'note',
  'conclusion', 'questions', 'further_readings', 'assignment'));

-- which manuals a user studies, and which one is open now
create table user_manuals (
  user_id        uuid not null references auth.users(id) on delete cascade,
  edition_code   text not null references editions(code),
  enrolled_at    timestamptz not null default now(),
  is_active      boolean not null default false,
  last_opened_at timestamptz,
  primary key (user_id, edition_code)
);
create unique index user_manuals_one_active on user_manuals (user_id) where is_active;

alter table user_manuals enable row level security;
create policy own_rows on user_manuals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- set_active_manual: the one call the app makes when you switch manuals.
-- Enrols you if needed, makes it the open manual, closes the previous one.
-- ---------------------------------------------------------------------
create or replace function set_active_manual(p_code text)
returns text
language plpgsql
security invoker
as $$
declare uid uuid := (select auth.uid());
begin
  if not exists (select 1 from editions where code = p_code and status = 'published') then
    raise exception 'manual % is not published', p_code;
  end if;
  update user_manuals set is_active = false where user_id = uid and is_active and edition_code <> p_code;
  insert into user_manuals (user_id, edition_code, is_active, last_opened_at)
  values (uid, p_code, true, now())
  on conflict (user_id, edition_code) do update set is_active = true, last_opened_at = now();
  return p_code;
end $$;

-- the manual a user has open
create view v_active_manual with (security_invoker = true) as
  select um.user_id, e.code, e.title, e.short_title, e.lesson_count, e.item_count, e.profile
  from user_manuals um join editions e on e.code = um.edition_code
  where um.is_active;

-- the library screen: every published manual, whether you are enrolled, and your progress
create view v_manual_library with (security_invoker = true) as
  select e.code, e.title, e.short_title, e.language, e.lesson_count, e.approved_count, e.item_count,
         e.published_at,
         um.user_id is not null                        as enrolled,
         coalesce(um.is_active, false)                 as is_active,
         (select count(*) from cards c
          where c.user_id = (select auth.uid()) and c.edition_code = e.code and c.reps > 0) as items_started
  from editions e
  left join user_manuals um on um.edition_code = e.code and um.user_id = (select auth.uid())
  where e.status = 'published';

-- due questions, limited to the open manual (replaces v_due_now in the app).
-- Served by cards_due_idx (user_id, edition_code, due): one index range scan per user.
create view v_due_now_active with (security_invoker = true) as
  select c.user_id, c.item_id, i.uid as item_uid, i.lesson_uid, c.edition_code, i.type, c.due, c.state
  from user_manuals um
  join cards c on c.user_id = um.user_id and c.edition_code = um.edition_code
  join items i on i.id = c.item_id
  join lessons l on l.uid = i.lesson_uid
  where um.is_active and not c.suspended and c.due <= now()
    and (c.buried_until is null or c.buried_until <= now()) and i.active and l.status = 'approved';
