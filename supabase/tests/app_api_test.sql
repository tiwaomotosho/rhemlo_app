-- Rhemlo app API test (migration 0007). Run on a TEST database after all migrations, with both
-- manuals loaded and published, after behaviour_test.sql and community_test.sql:
--   psql -v ON_ERROR_STOP=1 -d rhemlo_test -f supabase/tests/app_api_test.sql
-- Every check prints PASS or raises an error. Never run on a real database.

\set tola 'a1000000-0000-4000-8000-000000000001'
\set kemi 'a1000000-0000-4000-8000-000000000002'
\set tobi 'a1000000-0000-4000-8000-000000000003'
\set ola  'a1000000-0000-4000-8000-000000000004'
\set ada  'a1000000-0000-4000-8000-000000000005'

create or replace function pg_temp.check(ok boolean, label text) returns text language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end $$;
create or replace function pg_temp.fails(stmt text, phrase text, label text) returns text language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAIL: % (no error)', label;
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  if position(phrase in sqlerrm) = 0 then raise exception 'FAIL: % (got: %)', label, sqlerrm; end if;
  return 'PASS: ' || label;
end $$;
grant execute on function pg_temp.check(boolean, text), pg_temp.fails(text, text, text) to authenticated;

-- ---------------------------------------------------------------- sign-up
update editions set access = 'open', status = 'published' where code in ('AD2627', 'EN2627');   -- earlier tests lock AD2627
alter table auth.users add column if not exists raw_user_meta_data jsonb;   -- as on Supabase
insert into auth.users (id, email, raw_user_meta_data) values
  (:'tola', 'tola@example.com', '{"handle": "Tola.Reads", "display_name": "Tola"}'),
  (:'kemi', 'kemi@example.com', '{"handle": "kemi_o", "display_name": "Kemi"}'),
  (:'tobi', 'tobi@example.com', '{"handle": "tobi", "display_name": "Tobi"}'),
  (:'ola',  'ola@example.com',  '{"handle": "ola_admin"}'),
  (:'ada',  'ada@example.com',  '{"handle": "kemi_o"}');
select pg_temp.check((select handle = 'tolareads' from public_profiles where user_id = :'tola'),
                     'sign-up creates a public handle, cleaned to the allowed letters');
select pg_temp.check((select handle <> 'kemi_o' and handle like 'kemi_o%' from public_profiles where user_id = :'ada'),
                     'a taken handle gets a unique variant');
select pg_temp.check((select count(*) = 5 from profiles where user_id in (:'tola', :'kemi', :'tobi', :'ola', :'ada')),
                     'every new account gets a private profile');
update profiles set birth_year = 1992 where user_id = :'kemi';
update profiles set birth_year = 2012 where user_id = :'tobi';
insert into platform_staff (user_id, role) values (:'ola', 'super_admin'), (:'ada', 'content_editor');
select pg_temp.check(not has_function_privilege('authenticated', 'rh_close_tier_week()', 'execute')
                     and has_function_privilege('authenticated', 'app_me()', 'execute'),
                     'the app can call app_* functions but not the weekly job');

-- ---------------------------------------------------------------- me, safety, sync
set role authenticated;
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select app_me()->>'role' = 'learner' and (app_me()->>'minor')::boolean), 'a new account is a learner and counts as under 18 until it gives a birth year');
select app_set_safety('{"birthYear": 1990, "dmFrom": "connections", "visibility": "public"}');
select pg_temp.check(not (app_me()->>'minor')::boolean, 'giving a birth year sets the age band');
select app_set_safety('{"birthYear": 2015}');
select pg_temp.check((select birth_year = 1990 from profiles where user_id = :'tola'), 'a birth year cannot be changed by the learner afterwards');

select pg_temp.check(app_push_snapshot(jsonb_build_object(
  'points', 300, 'profile', '{"glim": "meadow"}'::jsonb,
  'history', jsonb_build_array(
     jsonb_build_object('id', 'h1', 'at', rh_ms(now() - interval '1 hour'), 'total', 20, 'right', 15),
     jsonb_build_object('id', 'h2', 'at', rh_ms(now()), 'total', 10, 'right', 9)),
  'done', jsonb_build_object('AD2627|L01', rh_ms(now() - interval '2 hours')),
  'cards', jsonb_build_object('a', '{"box": 5}'::jsonb, 'b', '{"box": 4}'::jsonb, 'c', '{"box": 1}'::jsonb))) > 0,
  'a progress snapshot is stored');
select pg_temp.check((select (app_pull_snapshot()->'data'->>'points')::int = 300), 'and comes back on another device');
select pg_temp.check((select sittings = 2 and answers = 30 and correct = 24 from user_activity_daily where user_id = :'tola' and day = local_today()),
                     'study activity per day is derived from the snapshot');
select pg_temp.check((select secure = 2 from user_stats where user_id = :'tola'), 'and the Secure count');
select pg_temp.check((select count(*) = 1 from user_lesson_done where user_id = :'tola'), 'and lessons cleared');
select pg_temp.check((select xp = 300 from public_profiles where user_id = :'tola'), 'personal XP follows the snapshot');
select pg_temp.check((select app_me()->>'cw' = 'meadow'), 'and the chosen Glim style becomes the public avatar');

-- ---------------------------------------------------------------- friends, feed, co-op
select app_request_connection(:'kemi');
set request.jwt.claim.sub = :'kemi';
select pg_temp.check((select bool_or(x->'action'->>'type' = 'connection') from jsonb_array_elements(app_inbox()) x),
                     'a connection request arrives in the inbox with an accept action');
select app_respond_connection(:'tola', true);
select pg_temp.check((select bool_or(x->>'handle' = 'tolareads') from jsonb_array_elements(app_friends()) x), 'accepted friends are listed');
select pg_temp.check((select x->>'text' = 'completed Chapter 1' from jsonb_array_elements(app_friends_feed()) x limit 1),
                     'friends see milestones only');
select app_cheer((select x->>'id' from jsonb_array_elements(app_friends_feed()) x limit 1), 'clap');
select pg_temp.check((select (x->>'cheers')::int = 1 and x->>'mine' = 'clap' from jsonb_array_elements(app_friends_feed()) x limit 1), 'cheers count once per friend');
select pg_temp.check((select (app_coop()->>'them')::int = 1 and (app_coop()->>'you')::int = 0 and app_coop()->'partner'->>'handle' = 'tolareads'),
                     'co-op counts each partner''s study days this week');
select pg_temp.check((select jsonb_array_length(app_search_users('tol')) = 1), 'people can be found by handle');

-- ---------------------------------------------------------------- direct messages and safeguards
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select (app_can_message(:'kemi')->>'ok')::boolean), 'adults who are connected may message');
select app_send_dm(:'kemi', 'Shall we review Lesson 2 tonight?');
select app_send_dm(:'kemi', '', '🙏');
set request.jwt.claim.sub = :'kemi';
select pg_temp.check((select (x->>'unread')::int = 2 from jsonb_array_elements(app_threads()) x), 'the other person sees unread messages');
select pg_temp.check((select jsonb_array_length(app_dm(:'tola')) = 2 and app_dm(:'tola')->1->>'sticker' = '🙏'), 'messages and stickers are delivered');
select pg_temp.check((select count(*) = 1 from inbox where user_id = :'kemi' and kind = 'message'), 'one message notice, not one per message');
set request.jwt.claim.sub = :'tola';
select app_delete_dm((app_dm(:'kemi')->0)->>'id');
select pg_temp.check((select (app_dm(:'kemi')->0->>'deleted')::boolean), 'people can delete their own messages');
select pg_temp.fails($$select app_send_dm('a1000000-0000-4000-8000-000000000002', repeat('x', 2001))$$, '2,000 characters', 'messages are limited to 2,000 characters');
set request.jwt.claim.sub = :'tobi';
select pg_temp.check((select not (app_can_message(:'tola')->>'ok')::boolean and app_can_message(:'tola')->>'why' like '%guardian%'),
                     'an under-18 without consent is told why messaging is off');

-- ---------------------------------------------------------------- daily challenge
reset role;
select pg_temp.check(rh_lesson_date('6TH SEPTEMBER, 2026') = '2026-09-06' and rh_lesson_date('22ND AUGUST, 2027') = '2027-08-22'
                     and rh_lesson_date('no date') is null, 'printed lesson dates are read');
select max(number) as reached from lessons where edition_code = 'AD2627' and rh_lesson_date(date_printed) <= local_today() \gset
set role authenticated;
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select bool_and(substr(x #>> '{}', 2)::int <= :reached) and jsonb_array_length(app_daily_challenge('AD2627')->'lessons') > 0
                      from jsonb_array_elements(app_daily_challenge('AD2627')->'lessons') x),
                     'the daily challenge only uses lessons the calendar has reached, and says which');
select pg_temp.check((select jsonb_array_length(app_daily_challenge('AD2627')->'items') = 10 and app_daily_challenge('AD2627')->>'state' = 'open'),
                     'the daily challenge has 10 questions and starts open');
reset role;
create temp table t_daily as
  select i.uid, i.answer->>'text' as ans, q.position from match_questions q join items i on i.id = q.item_id
  where q.match_id = (select id from matches where kind = 'daily' and edition_code = 'AD2627' and settings->>'day' = local_today()::text);
grant select on t_daily to authenticated;
set role authenticated;
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select app_submit_challenge((app_daily_challenge('AD2627')->>'id')::uuid,
  (select jsonb_agg(jsonb_build_object('u', uid, 'value', case when position <= 6 then ans else 'wrong answer' end, 'ms', 4000)) from t_daily))
  ->>'state' = 'final'), 'a submitted challenge is marked on the server');
select pg_temp.check((select (app_challenge_state((app_daily_challenge('AD2627')->>'id')::uuid)->>'correct')::int = 6), 'with the right count');
select pg_temp.check((select (app_submit_challenge((app_daily_challenge('AD2627')->>'id')::uuid,
  (select jsonb_agg(jsonb_build_object('u', uid, 'value', ans, 'ms', 4000)) from t_daily))->>'correct')::int = 6),
  'refreshing never gives a second attempt');
reset role;
select pg_temp.check((select sum(points) = 60 from score_events where user_id = :'tola' and source = 'daily_challenge'), 'verified points are awarded once');
set role authenticated;

-- ---------------------------------------------------------------- tier leagues and leaderboards
set request.jwt.claim.sub = :'tola';
select app_join_tier_league('AD2627');
select pg_temp.check((select app_tier_standings()->>'tier' = 'bronze' and (app_tier_standings()->'rows'->0->>'points')::int = 60),
                     'a new league member starts in Bronze with this week''s verified points');
select pg_temp.check((select (x->>'points')::int = 60 from jsonb_array_elements(app_leaderboard('week', 'AD2627')) x where (x->>'you')::boolean),
                     'the weekly board shows verified points');
select pg_temp.check((select bool_or((x->>'you')::boolean) from jsonb_array_elements(app_leaderboard('friends', 'AD2627')) x), 'the friends board includes you');
reset role;
update tier_members set since = now() - interval '20 days' where user_id = :'tola';
insert into user_points_daily values (:'tola', 'AD2627', rh_week_start() - 3, 120);
select pg_temp.check(rh_close_tier_week() >= 1, 'the weekly job records last week''s results');
select pg_temp.check(rh_close_tier_week() = 0, 'and never twice');
set role authenticated;
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select app_last_week_result()->>'moved' = 'up' and app_last_week_result()->>'newTier' = 'silver'), 'a top-ten finish with points moves up a tier');

-- ---------------------------------------------------------------- private leagues
select pg_temp.check((select app_create_league('Province Cup', 'All season')->>'note' = 'All season'), 'anyone can start a private league');
reset role;
select invite_code as cup from leagues where name = 'Province Cup' \gset
set role authenticated;
set request.jwt.claim.sub = :'kemi';
select pg_temp.check((select app_league_preview(:'cup')->'ownerUser'->>'handle' = 'tolareads'),
                     'an invite link shows who started the league');
select app_join_league_code(:'cup');
select pg_temp.check((select jsonb_array_length(app_league_table((select id from leagues where name = 'Province Cup'))) = 2), 'the league table lists both members');

-- ---------------------------------------------------------------- circles, assignments, coach mocks
reset role;
insert into groups (id, edition_code, name, join_code) values ('b1000000-0000-4000-8000-000000000001', 'AD2627', 'Grace Youth', 'GRACE-T');
insert into group_members (group_id, user_id, role) values ('b1000000-0000-4000-8000-000000000001', :'kemi', 'coach');
set role authenticated;
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select jsonb_array_length(app_join_group('GRACE-T')->'members') = 1), 'a learner joins a circle with its code');
select pg_temp.check((select (app_my_groups()->0->'goal'->>'done')::int = 2), 'the circle goal counts members'' sittings this week');
select app_send_group_message('b1000000-0000-4000-8000-000000000001', 'Hello circle');
select pg_temp.check((select jsonb_array_length(app_group_messages('b1000000-0000-4000-8000-000000000001')) = 1), 'class chat works');
select app_mute_group('b1000000-0000-4000-8000-000000000001', true);
select pg_temp.check((select (app_my_groups()->0->>'muted')::boolean), 'a circle can be muted');
select pg_temp.fails($$select app_group_progress('b1000000-0000-4000-8000-000000000001')$$, 'only coaches', 'learners cannot see class progress');
set request.jwt.claim.sub = :'kemi';
select pg_temp.check((select (app_group_progress('b1000000-0000-4000-8000-000000000001')->0->>'sittings')::int = 2), 'the coach sees learners'' sittings');
select app_create_assignment('b1000000-0000-4000-8000-000000000001', '{"title": "Lesson 1 verse", "lessons": ["L01"], "count": 10}');
select app_set_mock('b1000000-0000-4000-8000-000000000001', jsonb_build_object('title', 'Quarter 1 mock', 'lessons', '["L01","L02"]'::jsonb, 'count', 50, 'minutes', 45, 'due', rh_ms(now() + interval '5 days')));
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select count(*) = 2 from jsonb_array_elements(app_inbox()) x where x->>'kind' = 'assignment'), 'learners are told about new work');
select pg_temp.check((select jsonb_array_length(app_my_groups()->0->'assignments') = 1 and jsonb_array_length(app_mocks_for('b1000000-0000-4000-8000-000000000001')) = 1),
                     'assignments and mocks show on the circle');
select app_submit_mock((app_mocks_for('b1000000-0000-4000-8000-000000000001')->0->>'id')::uuid, 0.97, 300);
set request.jwt.claim.sub = :'kemi';
select pg_temp.check((select (s->>'score')::real > 0.96 and s->>'flagged' is not null
                      from jsonb_array_elements(app_submissions((select id from group_assignments where kind = 'mock' and title = 'Quarter 1 mock'))) s),
                     'the coach sees the score, with very fast near-perfect work flagged');

-- ---------------------------------------------------------------- rooms and duels
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select app_create_room('AD2627', '{"lessons": ["L01", "L02"], "formats": ["mcq"], "count": 5, "seconds": 10, "cap": 30}')->>'code' is not null),
                     'anyone can host a room');
reset role;
select join_code as room, id as room_id from matches where kind = 'room' order by created_at desc limit 1 \gset
set role authenticated;
set request.jwt.claim.sub = :'kemi';
select pg_temp.check((select (app_join_room(:'room')->>'players')::int = 2), 'others join with the code');
set request.jwt.claim.sub = :'tola';
select pg_temp.check((select app_start_room(:'room_id')->>'status' = 'live'), 'the host starts the room');
reset role;
update matches set starts_at = now() - interval '12 seconds' where id = :'room_id';
set role authenticated;
set request.jwt.claim.sub = :'kemi';
select pg_temp.check((select app_room_reveal(:'room_id', 1) ? 'scripture'),
                     'the answer reveal includes the lesson and KJV text');
set request.jwt.claim.sub = :'tola';
select app_create_duel('AD2627', :'kemi', '["L01"]');
set request.jwt.claim.sub = :'kemi';
select pg_temp.check((select bool_or(x->>'link' like '/arena/room/%') from jsonb_array_elements(app_inbox()) x), 'a friendly match invite arrives with a link');
reset role;
update matches set ranked = false;   -- keep later checks independent of play

-- ---------------------------------------------------------------- reports and moderation
set role authenticated;
set request.jwt.claim.sub = :'tola';
select app_report('message', (app_group_messages('b1000000-0000-4000-8000-000000000001')->0)->>'id', 'Spam', 'testing');
select app_report('content', 'I-329088973e713664', 'A typo', 'Second word');
set request.jwt.claim.sub = :'ola';
select pg_temp.check((select count(*) >= 2 from jsonb_array_elements(app_moderation_queue()) x where x->>'state' = 'open'), 'staff see user and content reports');
select app_resolve_report(((select x->>'id' from jsonb_array_elements(app_moderation_queue()) x where x->>'kind' = 'content' limit 1))::uuid);
select pg_temp.check((select bool_or(x->>'state' = 'resolved') from jsonb_array_elements(app_moderation_queue()) x), 'reports can be resolved');
select app_sanction(:'tobi', 'mute', 'Testing', 3);
select pg_temp.check((select jsonb_array_length(app_people('tob')->0->'sanctions') = 1), 'actions show on the person');
set request.jwt.claim.sub = :'tobi';
select pg_temp.check((select x->>'title' = 'Messaging is paused on your account' from jsonb_array_elements(app_inbox()) x where x->>'kind' = 'moderation' limit 1),
                     'the person is told, with the reason');
select pg_temp.check((select jsonb_array_length(app_my_sanctions()) = 1), 'and sees what is active');
set request.jwt.claim.sub = :'tola';
select pg_temp.fails($$select app_people('x')$$, 'staff only', 'learners cannot use the admin tools');

-- ---------------------------------------------------------------- guardian consent
set request.jwt.claim.sub = :'tobi';
select app_request_consent('mum@example.com');
reset role;
select pg_temp.check((select count(*) = 1 from email_outbox where to_address = 'mum@example.com'), 'the guardian is emailed');
set role authenticated;
set request.jwt.claim.sub = :'ola';
select app_decide_consent((app_consents()->0->>'id')::uuid, true);
reset role;
select pg_temp.check(has_guardian_consent(:'tobi'), 'recorded consent turns on the under-18 messaging rules');
set role authenticated;

-- ---------------------------------------------------------------- administration
set request.jwt.claim.sub = :'ola';
select pg_temp.check((select count(*) = 2 from jsonb_array_elements(app_catalogue()) x where x->>'status' = 'published'), 'the manual catalogue lists both manuals');
select app_save_season('{"name": "Season 2027-28", "from": "2027-09-05", "to": "2028-08-27", "active": false}');
select pg_temp.check((select bool_or(x->>'name' = 'Season 2027-28') from jsonb_array_elements(app_seasons()) x), 'seasons can be added');
select app_save_org('{"name": "Lagos Province 12", "code": "LP12", "manuals": ["AD2627"]}');
select pg_temp.check((select bool_or(x->>'code' = 'LP12' and x->'manuals' ? 'AD2627') from jsonb_array_elements(app_orgs()) x), 'organisations and their manuals can be set');
select app_set_manual('EN2627', '{"status": "licensed"}');
select pg_temp.check((select x->>'status' = 'licensed' from jsonb_array_elements(app_catalogue()) x where x->>'code' = 'EN2627'), 'a manual can be restricted to licensed organisations');
select app_set_manual('EN2627', '{"status": "published"}');

-- ---------------------------------------------------------------- content verification
set request.jwt.claim.sub = :'ada';
select app_verify('AD2627', '{"u": "I-329088973e713664", "state": "corrected", "correction": "And he is before all things", "note": "test"}');
select pg_temp.check((select app_verifications('AD2627')->'I-329088973e713664'->>'state' = 'corrected'), 'stewards record verification decisions');
select pg_temp.check((select jsonb_typeof(app_anomalies('AD2627')) = 'array'), 'and read the anomalies register');
set request.jwt.claim.sub = :'tola';
select pg_temp.fails($$select app_verify('AD2627', '{"u": "x", "state": "approved"}')$$, 'content editors only', 'learners cannot verify content');

reset role;
select 'ALL APP API CHECKS PASSED';
