-- Minimal stand-in for the parts of a Supabase database that our migrations
-- and functions rely on. Used ONLY by the local SQL tests (PGlite or a
-- throwaway Postgres); never run this against a real Supabase project.
-- Roles are server-wide, and test files set up their databases in parallel,
-- so two files can both see "role missing" and race to create it. Each create
-- treats "already exists" (42710, or 23505 when the race hits the catalog
-- index) as success.
do $$ begin
  begin create role anon nologin;
  exception when duplicate_object or unique_violation then null; end;
  begin create role authenticated nologin;
  exception when duplicate_object or unique_violation then null; end;
  begin create role service_role nologin bypassrls;
  exception when duplicate_object or unique_violation then null; end;
end $$;

create schema if not exists auth;
create schema if not exists extensions;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
