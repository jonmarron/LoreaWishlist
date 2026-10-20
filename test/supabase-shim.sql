-- Stands in for the parts of Supabase that schema.sql leans on, so the real
-- policies can be exercised against a plain Postgres container.
--
-- auth.uid() and auth.jwt() are defined the same way Supabase defines them:
-- they read the request's JWT claims out of a session setting.

create schema if not exists auth;

create or replace function auth.jwt() returns jsonb
  language sql stable
  as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

-- Supabase grants this by default; policies calling auth.uid() rely on it.
grant usage on schema auth to anon, authenticated;
