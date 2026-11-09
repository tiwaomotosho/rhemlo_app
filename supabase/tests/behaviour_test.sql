-- Rhemlo database behaviour test. Run on a test database after all migrations and after loading
-- and publishing EN2627 and AD2627 (every lesson of both manuals approved):
--   psql -v ON_ERROR_STOP=1 -d rhemlo_test -f db/test/behaviour_test.sql
-- Every check prints PASS or raises an error. Never run on a real database.

\set u1 '11111111-1111-1111-1111-111111111111'
\set u2 '22222222-2222-2222-2222-222222222222'
\set u3 '33333333-3333-3333-3333-333333333333'

insert into auth.users values (:'u1', 'student@example.com'), (:'u2', 'other@example.com'), (:'u3', 'coach@example.com');

create temp table t_items as
  select (select uid from items where lesson_uid = 'EN2627:L01' order by uid limit 1) as yaya,
         (select uid from items where lesson_uid = 'AD2627:L01'   order by uid limit 1) as ab27;
grant select on t_items to authenticated;

create or replace function pg_temp.check(ok boolean, label text) returns text language plpgsql as $$
begin
  if not ok then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end $$;

-- ---------------------------------------------------------------- answers
set role authenticated;
set request.jwt.claim.sub = :'u1';
select set_active_manual('EN2627');

select pg_temp.check(submit_reviews(jsonb_build_array(
  jsonb_build_object('id','aaaaaaaa-0000-7000-8000-000000000001','item_uid',(select yaya from t_items),
    'reviewed_at','2026-10-15T07:00:00Z','format','typed','answer_text','dust','is_correct',true,'score',1,
    'rating',3,'response_ms',4200,'new_item',true,'day','2026-10-15',
    'before',jsonb_build_object('state',0),
    'after',jsonb_build_object('state',1,'stability',0.4,'difficulty',5.1,'scheduled_days',0,
                               'due','2026-01-01T07:10:00Z','reps',1,'lapses',0)),
  jsonb_build_object('id','aaaaaaaa-0000-7000-8000-000000000002','item_uid',(select yaya from t_items),
    'reviewed_at','2026-10-15T06:00:00Z','format','typed','answer_text','dusts','is_correct',false,'score',0,
    'rating',1,'response_ms',9000,'day','2026-10-15',
    'before',jsonb_build_object('state',0),
    'after',jsonb_build_object('state',1,'stability',0.1,'difficulty',6,'scheduled_days',0,
                               'due','2026-10-15T06:01:00Z','reps',1,'lapses',0),
    'errors',jsonb_build_array(jsonb_build_object('error_type','spelling','expected','dust','given','dusts',
                                                  'token_position',8))))) = 2, 'a batch of 2 answers is stored');

select pg_temp.check(submit_reviews(jsonb_build_array(
  jsonb_build_object('id','aaaaaaaa-0000-7000-8000-000000000001','item_uid',(select yaya from t_items),
    'reviewed_at','2026-10-15T07:00:00Z','format','typed','answer_text','x','is_correct',true,'score',1,
    'rating',3,'response_ms',1,'before',jsonb_build_object('state',0),
    'after',jsonb_build_object('state',2,'stability',99,'difficulty',1,'due','2030-01-01T00:00:00Z','reps',9,'lapses',0)))) = 0,
  'a resent answer is ignored');

select pg_temp.check((select abs(stability - 0.4) < 0.001 and reps = 1 from cards), 'the newest answer decides the card; older and resent ones do not');
select pg_temp.check((select count(*) = 1 from error_events where error_type = 'spelling' and given = 'dusts'), 'mistakes are stored');
select pg_temp.check((select reviews = 2 and correct = 1 and new_items = 1 from user_daily_stats), 'daily totals are kept');
select pg_temp.check((select count(*) = 1 from v_due_now_active), 'the due list shows the open manual''s question');

-- ---------------------------------------------------------------- target practice and mastery check
select pg_temp.check((select count(*) = 10 and count(distinct lesson_uid) = 1 from practice_set('EN2627', array[1], 10)),
                     'target practice gives exactly the number of questions asked for, from the chosen lesson');
select pg_temp.check((select count(*) = count(distinct i.sibling_key) from practice_set('EN2627', array[1], 30) p
                      join items i on i.id = p.item_id), 'never two questions on the same sentence in one sitting');
select pg_temp.check((select bool_and(type = 'Q26') from practice_set('EN2627', array[1], 8, 'target', array['Q26'])),
                     'practice can be limited to chosen kinds (e.g. spot the error)');
select pg_temp.check((select count(distinct case when i.target_uid ~ '\.R[0-9]+$' then 'REF'
                                               when i.target_uid ~ '\.(MV|BP|OUT)' then substring(i.target_uid from '\.(MV|BP|OUT)')
                                               else substring(i.target_uid from ':L[0-9]+\.([A-Z]+[0-9]*)') end) >= 6
                      from practice_set('EN2627', array[1], 25, 'mastery') p join items i on i.id = p.item_id),
                     'the lesson mastery check samples every part of the lesson');
reset role;
update lessons set status = 'draft' where uid = 'EN2627:L02';          -- one lesson goes back to review
set role authenticated;
set request.jwt.claim.sub = :'u1';
select pg_temp.check((select count(*) = 0 from practice_set('EN2627', array[2], 10)),
                     'lessons not yet approved are never practised');
reset role;
update lessons set status = 'approved' where uid = 'EN2627:L02';
set role authenticated;
set request.jwt.claim.sub = :'u1';

-- ---------------------------------------------------------------- privacy
set request.jwt.claim.sub = :'u2';
select pg_temp.check((select count(*) = 0 from cards) and (select count(*) = 0 from review_logs)
                     and (select count(*) = 0 from user_daily_stats), 'another user sees none of it');
select pg_temp.check((select count(*) > 1000 from sentences), 'content of open manuals is readable');

-- ---------------------------------------------------------------- switching
set request.jwt.claim.sub = :'u1';
select set_active_manual('AD2627');
select pg_temp.check((select count(*) = 0 from v_due_now_active), 'after switching, the other manual''s questions are not listed');
select pg_temp.check((select count(*) = 1 from cards), 'progress in the first manual is kept');

-- ---------------------------------------------------------------- licensed manuals
reset role;
update editions set access = 'licensed' where code = 'AD2627';
set role authenticated;
set request.jwt.claim.sub = :'u2';
select pg_temp.check((select count(*) = 0 from sentences where edition_code = 'AD2627')
                     and (select count(*) = 0 from items where edition_code = 'AD2627'), 'a licensed manual is hidden without access');
select pg_temp.check((select not unlocked from v_manual_library where code = 'AD2627'), 'the library shows it as locked');
do $$ begin
  perform set_active_manual('AD2627');
  raise exception 'FAIL: opened a locked manual';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select 'PASS: a locked manual cannot be opened';

reset role;
insert into organisations (id, name, kind) values ('00000000-0000-0000-0000-0000000000a1', 'Zone 7', 'zone');
insert into organisations (id, parent_id, name, kind) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', 'Grace Parish', 'parish');
insert into org_members values ('00000000-0000-0000-0000-0000000000a2', :'u2', 'member', now());
insert into org_edition_access (org_id, edition_code) values ('00000000-0000-0000-0000-0000000000a1', 'AD2627');
set role authenticated;
set request.jwt.claim.sub = :'u2';
select pg_temp.check((select count(*) > 0 from sentences where edition_code = 'AD2627'), 'access granted to a zone reaches its parish members');
select pg_temp.check(set_active_manual('AD2627') = 'AD2627', 'and they can open it');

-- ---------------------------------------------------------------- classes and coaches
reset role;
insert into groups (id, org_id, edition_code, name, join_code)
  values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'EN2627', 'YAYA Class A', 'YAYA-7Q2K');
insert into group_members values ('00000000-0000-0000-0000-0000000000b1', :'u3', 'coach', now());
set role authenticated;
set request.jwt.claim.sub = :'u1';
select pg_temp.check(join_group('YAYA-7Q2K') = '00000000-0000-0000-0000-0000000000b1', 'a student joins a class with its code');
select pg_temp.check(refresh_lesson_progress(:'u1', 'EN2627') = 1, 'lesson progress totals are computed');
do $$ begin
  perform group_progress('00000000-0000-0000-0000-0000000000b1');
  raise exception 'FAIL: a student read the class progress';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select 'PASS: a student cannot see the class progress';
set request.jwt.claim.sub = :'u3';
select pg_temp.check((select count(*) = 1 from group_progress('00000000-0000-0000-0000-0000000000b1')
                      where lesson_uid = 'EN2627:L01' and items_started = 1), 'the coach sees the student''s lesson totals');
select pg_temp.check((select count(*) = 0 from review_logs), 'the coach cannot read the student''s answers');
select pg_temp.check((select reviews = 2 from group_daily('00000000-0000-0000-0000-0000000000b1') where day = '2026-10-15'),
                     'the coach sees class activity by day');

-- ---------------------------------------------------------------- class assignments
insert into group_assignments (id, group_id, kind, title, scope, due_at)
  values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'mock',
          'Q1 mock 1', '{"lessons":[1,12],"count":60}', '2026-12-01');
select 'PASS: a coach sets a mock for the class';
set request.jwt.claim.sub = :'u1';
select pg_temp.check((select count(*) = 1 from group_assignments), 'the student sees the class assignment');
do $$ begin
  insert into group_assignments (group_id, kind, title) values ('00000000-0000-0000-0000-0000000000b1', 'mock', 'x');
  raise exception 'FAIL: a student set an assignment';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
end $$;
select 'PASS: a student cannot set assignments';
insert into mocks (id, user_id, edition_code, scope, time_limit_s, started_at, submitted_at, score, assignment_id)
  values (gen_random_uuid(), :'u1', 'EN2627', '{}', 3600, now(), now(), 0.85, '00000000-0000-0000-0000-0000000000c1');
set request.jwt.claim.sub = :'u3';
select pg_temp.check((select abs(score - 0.85) < 0.001 from assignment_results('00000000-0000-0000-0000-0000000000c1')),
                     'the coach sees the student''s mock result');
reset role;
select 'ALL BEHAVIOUR CHECKS PASSED';
