-- Local testing only. Imitates the parts of Supabase that 0003_progress.sql relies on.
-- Never run this against a real Supabase project (it already has these).
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
-- as on Supabase: the user id from PostgREST's JWT claims (or the older single-claim setting the SQL tests use)
create or replace function auth.uid() returns uuid language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                     (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
grant usage on schema public, auth to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage on sequences to authenticated;
grant execute on function auth.uid() to authenticated;
