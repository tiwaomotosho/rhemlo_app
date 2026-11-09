-- Rhemlo community and play test (migration 0006). Run on a test database after all migrations,
-- with EN2627 loaded and published (Lesson 1 approved), after behaviour_test.sql:
--   psql -v ON_ERROR_STOP=1 -d rhemlo_test -f db/test/community_test.sql
-- Every check prints PASS or raises an error. Never run on a real database.

\set a  '44444444-4444-4444-4444-444444444444'
\set b  '55555555-5555-5555-5555-555555555555'
\set c  '66666666-6666-6666-6666-666666666666'
\set d  '77777777-7777-7777-7777-777777777777'
\set m  '88888888-8888-8888-8888-888888888888'
\set e  '99999999-9999-9999-9999-999999999999'

create or replace function pg_temp.check(ok boolean, label text) returns text language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', label; end if;
  return 'PASS: ' || label;
end $$;
-- expect an error containing a phrase
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

-- ---------------------------------------------------------------- server marking
select pg_temp.check((select count(*) = 0 from sentences where rhemlo_norm(text) <> text_norm),
                     'server marking equals the Python rules on every sentence of the manual');
select pg_temp.check((select count(*) = 0 from items where answer ? 'norm' and rhemlo_norm(answer->>'text') <> answer->>'norm'),
                     'server marking equals the Python rules on every typed answer in the bank');
select pg_temp.check(rhemlo_norm('God’s voice') = 'gods voice' and rhemlo_norm('slip-bye') = 'slip-bye'
                     and rhemlo_norm('slip-bye') <> rhemlo_norm('slip bye')
                     and rhemlo_norm('God is accessible - We') = 'god is accessible we'
                     and rhemlo_norm('Hebrews 12:6-7') = 'hebrews 12:6-7' and rhemlo_norm('“…for in Him”') = 'for in him',
                     'marking rules: apostrophes, capitals, hyphens, spaced dashes, verse numbers, quotes');
create temp table t_items as
  select (select id from items where lesson_uid = 'EN2627:L01' and type = 'Q05' limit 1) as mv_ref,
         (select id from items where lesson_uid = 'EN2627:L01' and type = 'Q12'
            and jsonb_array_length(answer->'refs') = 2 limit 1) as two_refs;
grant select on t_items to authenticated;
select pg_temp.check(grade_item((select mv_ref from t_items), 'colossians 1:17', null)
                     and not grade_item((select mv_ref from t_items), 'Colossians 1:18', null),
                     'a reference is right only with the exact chapter and verse');
select pg_temp.check(grade_item((select two_refs from t_items), 'Isaiah 55:9; Jeremiah 23:23', null),
                     'several references may be given in any order');

-- ---------------------------------------------------------------- people
insert into auth.users values (:'a', 'ade@example.com'), (:'b', 'bisi@example.com'), (:'c', 'chi@example.com'),
                              (:'d', 'dayo@example.com'), (:'m', 'mod@example.com'), (:'e', 'emeka@example.com');
insert into profiles (user_id, display_name, birth_year) values
  (:'a', 'Ade', 1990), (:'b', 'Bisi', 1992), (:'c', 'Chi', 2011), (:'d', 'Dayo', 2012), (:'m', 'Mod', 1985), (:'e', 'Emeka', 1988);
insert into platform_staff (user_id, role) values (:'m', 'moderator');

set role authenticated;
set request.jwt.claim.sub = :'a';
insert into public_profiles (user_id, handle, display_name) values (:'a', 'ade', 'Ade Bello');
set request.jwt.claim.sub = :'b';
insert into public_profiles (user_id, handle, display_name) values (:'b', 'bisi', 'Bisi Ojo');
set request.jwt.claim.sub = :'d';
insert into public_profiles (user_id, handle) values (:'d', 'dayo_d');
set request.jwt.claim.sub = :'e';
insert into public_profiles (user_id, handle, display_name) values (:'e', 'emeka', 'Emeka');
set request.jwt.claim.sub = :'c';
insert into public_profiles (user_id, handle, display_name) values (:'c', 'chi_c', 'Chiamaka Real Name');
select pg_temp.check((select display_name is null from public_profiles where user_id = :'c'),
                     'an under-18 profile never shows a real name');
select pg_temp.fails($$update public_profiles set avatar = 'uploads/me.jpg' where user_id = '66666666-6666-6666-6666-666666666666'$$,
                     'preset avatar', 'an under-18 account can only use a preset avatar');
select pg_temp.fails($$update profiles set birth_year = 1990 where user_id = '66666666-6666-6666-6666-666666666666'$$,
                     'only be changed by support', 'a birth year cannot be changed by its owner');
select pg_temp.fails($$update public_profiles set xp = 99999 where user_id = '66666666-6666-6666-6666-666666666666'$$,
                     'set by the server', 'nobody can give themselves XP');
select pg_temp.fails($$select is_minor('44444444-4444-4444-4444-444444444444')$$,
                     'permission denied', 'nobody can look up another user''s age');

-- ---------------------------------------------------------------- connections and direct messages
set request.jwt.claim.sub = :'a';
select request_connection('BISI');
set request.jwt.claim.sub = :'b';
select pg_temp.check(respond_connection(:'a', true) = 'accepted', 'a friend request is accepted');
set request.jwt.claim.sub = :'c';
select pg_temp.fails($$select request_connection('ade')$$, 'not available',
                     'an under-18 account cannot befriend an adult');
set request.jwt.claim.sub = :'a';
select pg_temp.fails($$select start_direct_chat('66666666-6666-6666-6666-666666666666')$$, 'cannot message',
                     'an adult cannot message an under-18 account');
create temp table t_chat as select start_direct_chat(:'b') as conv;
grant select on t_chat to authenticated;
select send_message((select conv from t_chat), 'Ready for the Q1 mock?');
set request.jwt.claim.sub = :'b';
select pg_temp.check((select count(*) = 1 from messages where conversation_id = (select conv from t_chat)),
                     'friends message each other');
set request.jwt.claim.sub = :'e';
select pg_temp.check((select count(*) = 0 from messages where conversation_id = (select conv from t_chat)),
                     'nobody else can read a direct chat');
set request.jwt.claim.sub = :'b';
select block_user(:'a');
set request.jwt.claim.sub = :'a';
select pg_temp.fails($$select send_message((select conv from t_chat), 'hello?')$$, 'cannot message',
                     'after a block, messages stop');

set request.jwt.claim.sub = :'c';
select pg_temp.fails($$select start_direct_chat('77777777-7777-7777-7777-777777777777')$$, 'cannot message',
                     'under-18s outside a shared class cannot message each other');
reset role;
insert into groups (id, edition_code, name, join_code) values ('00000000-0000-0000-0000-0000000000d1', 'EN2627', 'Teens A', 'TEENS-A');
insert into group_members values ('00000000-0000-0000-0000-0000000000d1', :'c', 'student', now()),
                                 ('00000000-0000-0000-0000-0000000000d1', :'d', 'student', now()),
                                 ('00000000-0000-0000-0000-0000000000d1', :'e', 'coach', now());
set role authenticated;
set request.jwt.claim.sub = :'c';
select pg_temp.fails($$select start_direct_chat('77777777-7777-7777-7777-777777777777')$$, 'cannot message',
                     'under-18 classmates need a guardian''s consent first');
reset role;
insert into guardian_consents (user_id, guardian_name, guardian_contact, relationship, method)
  values (:'c', 'Mrs C', '+2348000000001', 'mother', 'church_record'),
         (:'d', 'Mr D', '+2348000000002', 'father', 'paper');
set role authenticated;
set request.jwt.claim.sub = :'c';
select pg_temp.check(start_direct_chat(:'d') is not null, 'with consent, under-18 classmates can message each other');
create temp table t_class as select open_group_chat('class', '00000000-0000-0000-0000-0000000000d1') as conv;
grant select on t_class to authenticated;
select send_message((select conv from t_class), 'Who has finished Lesson 1?');
set request.jwt.claim.sub = :'e';
select pg_temp.check((select count(*) = 1 from messages where conversation_id = (select conv from t_class)),
                     'the coach sees the class chat');
set request.jwt.claim.sub = :'a';
select pg_temp.check((select count(*) = 0 from messages where conversation_id = (select conv from t_class)),
                     'people outside the class do not');
set request.jwt.claim.sub = :'d';
do $$ begin
  for i in 1..20 loop
    perform send_message((select conv from t_class), 'spam ' || i);
  end loop;
end $$;
select pg_temp.fails($$select send_message((select conv from t_class), 'one more')$$, 'slow down',
                     'message flooding is stopped');

-- ---------------------------------------------------------------- reports and moderation
set request.jwt.claim.sub = :'d';
create temp table t_msg as select id, created_at from messages where body = 'Who has finished Lesson 1?';
grant select on t_msg to authenticated;
select report('child_safety', null, (select id from t_msg), (select created_at from t_msg));
select pg_temp.fails($$select * from moderation_queue()$$, 'moderators only', 'only moderators see reports');
set request.jwt.claim.sub = :'m';
select pg_temp.check((select reason = 'child_safety' and target_user = '66666666-6666-6666-6666-666666666666'
                      and message_body = 'Who has finished Lesson 1?' from moderation_queue() limit 1),
                     'the moderator sees the report and the message, child-safety reports first');
select moderate(:'c', 'mute', 'test mute', now() + interval '1 day', (select report_id from moderation_queue() limit 1));
set request.jwt.claim.sub = :'c';
select pg_temp.fails($$select send_message((select conv from t_class), 'hi')$$, 'cannot send',
                     'a muted user cannot send messages');
select pg_temp.check((select count(*) = 1 from inbox where kind = 'moderation'), 'and is told why');

-- ---------------------------------------------------------------- live match
set request.jwt.claim.sub = :'a';
create temp table t_match as select * from create_match('EN2627', 'room', '{"lessons":[1,1],"formats":["mcq"]}', 5, 20, true);
grant select on t_match to authenticated;
select pg_temp.fails($$select start_match((select match_id from t_match), 0)$$, 'at least 2 players',
                     'a ranked match needs two players');
set request.jwt.claim.sub = :'e';
select pg_temp.check(join_match(lower((select join_code from t_match))) = (select match_id from t_match),
                     'a second player joins with the code');
create temp table t_match2 as select * from create_match('EN2627');       -- host: e, default settings
grant select on t_match2 to authenticated;
set request.jwt.claim.sub = :'a';
select pg_temp.check(join_match((select join_code from t_match2)) is not null, 'a match with default settings can be joined');
set request.jwt.claim.sub = :'e';
select pg_temp.check(start_match((select match_id from t_match2), 0) is not null,
                     'and starts with mixed multiple-choice and typed questions');
set request.jwt.claim.sub = :'a';
select start_match((select match_id from t_match), 0);
select pg_temp.check((select (match_state((select match_id from t_match))->'question'->>'position')::int = 1
                             and not (match_state((select match_id from t_match))->'question' ? 'answer')),
                     'the open question is shown without its answer');
select pg_temp.check((select count(*) = 0 from match_questions), 'players cannot read the hidden answers');
reset role;
create temp table t_q as select options, correct_option from match_questions
  where match_id = (select match_id from t_match) and position = 1;
grant select on t_q to authenticated;
set role authenticated;
set request.jwt.claim.sub = :'a';
select pg_temp.check((answer_match((select match_id from t_match), 1, null, (select correct_option from t_q))->>'points')::int > 500,
                     'a fast right answer scores base points plus a speed bonus');
select pg_temp.check(answer_match((select match_id from t_match), 1, null, (select correct_option from t_q))->>'reason' = 'already answered',
                     'each question can be answered once');
set request.jwt.claim.sub = :'e';
select pg_temp.check((answer_match((select match_id from t_match), 1, null,
                       case when (select correct_option from t_q) = 1 then 2 else 1 end)->>'is_correct')::boolean = false,
                     'a wrong option scores nothing');
select pg_temp.fails($$select match_reveal((select match_id from t_match), 1)$$, 'still open',
                     'the answer is not revealed while the question is open');
select pg_temp.check(answer_match((select match_id from t_match), 3, null, 1)->>'reason' = 'question not open',
                     'a later question cannot be answered early');
reset role;
update matches set starts_at = now() - interval '1 hour' where id = (select match_id from t_match);
set role authenticated;
set request.jwt.claim.sub = :'a';
select pg_temp.check((select (r->>'correct_option')::int = (select correct_option from t_q) and (r->>'correct')::int = 1
                      from match_reveal((select match_id from t_match), 1) r),
                     'after it closes, the reveal shows the right option and how the room did');
select finish_match((select match_id from t_match));
select finish_match((select match_id from t_match));
select pg_temp.check((select count(*) = 1 from score_events) and
                     (select points > 0 from leaderboard where user_id = :'a' and scope = 'all'),
                     'points are awarded once, even if finishing is called twice');
select pg_temp.fails($$insert into score_events (user_id, edition_code, source, source_id, points)
                       values ('44444444-4444-4444-4444-444444444444', 'EN2627', 'match', 'fake', 100000)$$,
                     'row-level security', 'nobody can write points directly');
select pg_temp.fails($$select award_points('44444444-4444-4444-4444-444444444444', 'EN2627', 'match', 'fake2', 100000)$$,
                     'permission denied', 'nobody can call the points function');

-- ---------------------------------------------------------------- daily challenge and boards
create temp table t_daily as select daily_challenge('EN2627') as id;
grant select on t_daily to authenticated;
set request.jwt.claim.sub = :'e';
select pg_temp.check(daily_challenge('EN2627') = (select id from t_daily), 'everyone gets the same daily challenge');
select pg_temp.check((select name = 'Ade Bello' and rank = 1 from leaderboard_top('EN2627', 'all') limit 1),
                     'the global board ranks the manual''s players');
select pg_temp.check((select rank = 2 from my_rank('EN2627', 'all')), 'a player sees their own rank');
select pg_temp.check((select count(*) >= 1 from weekly_board('EN2627')), 'the weekly board works');
set request.jwt.claim.sub = :'a';
update public_profiles set visibility = 'hidden' where user_id = :'a';
set request.jwt.claim.sub = :'e';
select pg_temp.check((select name = 'Hidden learner' from leaderboard_top('EN2627', 'all') limit 1),
                     'a hidden profile appears anonymously');
set request.jwt.claim.sub = :'a';
update public_profiles set visibility = 'public' where user_id = :'a';

-- ---------------------------------------------------------------- leagues
create temp table t_league as select * from create_league('EN2627', 'Yaba Squad');
grant select on t_league to authenticated;
set request.jwt.claim.sub = :'e';
select pg_temp.check(join_league(lower((select invite_code from t_league))) = (select league_id from t_league),
                     'friends join a league with its invite code');
select pg_temp.check((select name = 'Ade Bello' and rank = 1 from league_standings((select league_id from t_league)) limit 1),
                     'league standings rank its members');
set request.jwt.claim.sub = :'d';
select pg_temp.check((select count(*) = 0 from leagues where id = (select league_id from t_league))
                     and (select name = 'Yaba Squad' from league_preview((select invite_code from t_league))),
                     'a private league is hidden, but its invite link shows a preview');

reset role;
insert into organisations (id, name, kind) values ('00000000-0000-0000-0000-0000000000e1', 'Grace Parish', 'parish'),
                                                  ('00000000-0000-0000-0000-0000000000e2', 'Hope Parish', 'parish');
insert into org_members values ('00000000-0000-0000-0000-0000000000e1', :'e', 'admin', now()),
                               ('00000000-0000-0000-0000-0000000000e1', :'a', 'member', now()),
                               ('00000000-0000-0000-0000-0000000000e2', :'b', 'admin', now());
set role authenticated;
set request.jwt.claim.sub = :'e';
create temp table t_orgleague as select * from create_league('EN2627', 'Zone Cup', 'org', 'public');
grant select on t_orgleague to authenticated;
select enter_org_in_league((select invite_code from t_orgleague), '00000000-0000-0000-0000-0000000000e1');
set request.jwt.claim.sub = :'a';
select pg_temp.fails($$select enter_org_in_league((select invite_code from t_orgleague), '00000000-0000-0000-0000-0000000000e2')$$,
                     'only an admin', 'only an organisation''s admin can enter it in a league');
set request.jwt.claim.sub = :'b';
select enter_org_in_league((select invite_code from t_orgleague), '00000000-0000-0000-0000-0000000000e2');
select pg_temp.check((select name = 'Grace Parish' and rank = 1 from league_standings((select league_id from t_orgleague)) limit 1)
                     and (select count(*) = 2 from league_standings((select league_id from t_orgleague))),
                     'organisations compete: each scored from its members'' points');

-- ---------------------------------------------------------------- Bible text at the reveal
reset role;
insert into bible_translations (code, name, public_domain, license, source)
  values ('TST', 'Test text', true, 'test', 'behaviour test');
insert into bible_verses values ('TST', 'Col', 1, 16, 'v16'), ('TST', 'Col', 1, 17, 'v17'), ('TST', 'Col', 1, 18, 'v18');
set role authenticated;
set request.jwt.claim.sub = :'a';
select pg_temp.check((select count(*) = 1 and min(text) = 'v17' from scripture('Colossians 1:17', 'TST')),
                     'a reference returns exactly its verse');
select pg_temp.check((select item_scripture((select mv_ref from t_items), 'TST')->0->>'ref' = 'Colossians 1:17'),
                     'the reveal gets the verses for a question''s references');

select pg_temp.check((select count(*) = 0 from bible_refs where not exists (select 1 from scripture(key, 'KJV'))),
                     'every reference in the loaded manuals has KJV text (run_all.sh loads it)');
select pg_temp.check((select text = 'And he is before all things, and by him all things consist.'
                      from scripture('Colossians 1:17', 'KJV')), 'the KJV text is exact');
select pg_temp.check((select string_agg(verse::text, ',') = '9,10' from scripture('3 John 9-10', 'KJV')),
                     'one-chapter books ("3 John 9-10") resolve to chapter 1');

-- ---------------------------------------------------------------- retiring a manual
set request.jwt.claim.sub = :'a';
select set_active_manual('EN2627');
select pg_temp.fails($$select retire_manual('EN2627')$$, 'content editors only', 'only content editors can retire a manual');
reset role;
reset request.jwt.claim.sub;                          -- the service role / CLI has no user
select retire_manual('EN2627', null, 'Season 2026-2027 is over');
set role authenticated;
set request.jwt.claim.sub = :'a';
select pg_temp.check((select status = 'retired' and not is_active from v_manual_library where code = 'EN2627'),
                     'a retired manual shows as retired and is closed');
select pg_temp.fails($$select set_active_manual('EN2627')$$, 'retired', 'it cannot be opened for study');
select pg_temp.fails($$select create_match('EN2627')$$, 'not open for play', 'or played');
select pg_temp.check((select count(*) > 0 from sentences where edition_code = 'EN2627')
                     and (select count(*) = 1 from leaderboard_top('EN2627', 'all') where name = 'Ade Bello'),
                     'its text and final standings stay readable');
select pg_temp.check((select status = 'closed' from leagues where id = (select league_id from t_league)),
                     'its leagues are closed');
select pg_temp.check((select count(*) = 1 from inbox where kind = 'manual_retired'), 'and players are told');
reset role;
update editions set status = 'published', retired_at = null where code = 'EN2627';   -- leave the test database usable
select 'ALL COMMUNITY CHECKS PASSED';
