-- =============================================================================
-- Wishlist: tables, row-level security, and the two functions visitors may call.
--
-- Paste the whole file into Supabase -> SQL Editor -> Run. Safe to re-run.
--
-- This file is the only thing protecting the data. The anon key in the browser
-- bundle is public by design; these policies are what decide who may do what.
--
--   anyone            read the list
--   any visitor       claim an item nobody has claimed
--   the claimer       release that one claim, and nothing else
--   an admin          add, edit, delete, clear any claim, rename the list
-- =============================================================================


-- ── who counts as an admin ───────────────────────────────────────────────────
--
-- One row per admin. To add someone: create their account under
-- Authentication -> Users, then insert their address here. It takes effect on
-- their next page load -- no redeploy, no code change.
--
--   insert into public.admins (email) values (lower('someone@example.com'));
--
-- To remove an admin, delete their row. Delete the last row and nobody can
-- reach the admin page until you insert one again.

create table if not exists public.admins (
  email      text primary key check (email = lower(email) and position('@' in email) > 1),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CHANGE THIS to your own address before running the file the first time.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.admins (email) values (lower('you@example.com'))
  on conflict (email) do nothing;

-- The table is unreachable through the API: RLS is on and there are no
-- policies, so nobody can read who the admins are, and nobody can add
-- themselves. Only the dashboard and the service-role key can touch it.
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- security definer, so it can consult the admins table on behalf of a caller
-- who has no access to it at all.
create or replace function public.is_admin() returns boolean
  language sql stable
  security definer
  set search_path = ''
  as $$
    select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
       and exists (
         select 1 from public.admins
          where email = lower(coalesce(auth.jwt() ->> 'email', ''))
       )
  $$;

-- The policies evaluate this as the calling role, and the browser calls it
-- directly to find out whether to offer the admin page.
grant execute on function public.is_admin() to anon, authenticated;

-- Superseded by the admins table.
drop function if exists public.admin_email();


-- ── tables ───────────────────────────────────────────────────────────────────

create table if not exists public.items (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 160),
  url            text not null default '' check (char_length(url) <= 2000),
  note           text not null default '' check (char_length(note) <= 200),
  created_at     timestamptz not null default now(),
  claimed_by     text check (char_length(claimed_by) between 1 and 60),
  claimed_by_uid uuid,
  claimed_at     timestamptz,
  -- a claim is all three columns together, or none of them
  constraint claim_is_whole check (
    (claimed_by is null and claimed_by_uid is null and claimed_at is null)
    or (claimed_by is not null and claimed_by_uid is not null and claimed_at is not null)
  )
);

-- Single-row table: the `id` column can only ever hold true.
create table if not exists public.meta (
  id    boolean primary key default true check (id),
  title text not null default 'Meine Wunschliste' check (char_length(title) between 1 and 80)
);

insert into public.meta (id) values (true) on conflict (id) do nothing;


-- ── row-level security ───────────────────────────────────────────────────────

alter table public.items enable row level security;
alter table public.meta  enable row level security;

drop policy if exists items_read         on public.items;
drop policy if exists items_admin_insert on public.items;
drop policy if exists items_admin_update on public.items;
drop policy if exists items_admin_delete on public.items;
drop policy if exists meta_read          on public.meta;
drop policy if exists meta_admin_update  on public.meta;

create policy items_read on public.items
  for select using (true);

create policy items_admin_insert on public.items
  for insert to authenticated with check (public.is_admin());

create policy items_admin_update on public.items
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy items_admin_delete on public.items
  for delete to authenticated using (public.is_admin());

create policy meta_read on public.meta
  for select using (true);

create policy meta_admin_update on public.meta
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.items, public.meta to anon, authenticated;
grant insert, update, delete on public.items to authenticated;
grant update on public.meta to authenticated;


-- ── the two things a visitor may do ──────────────────────────────────────────
--
-- Claiming and releasing go through these functions rather than a direct
-- UPDATE, because row-level security can say *which rows* a visitor may touch
-- but not *which columns*. Routing through a narrow, security-definer function
-- is what stops a visitor from editing an item's name or link while claiming
-- it: these functions are physically unable to write anything else.

create or replace function public.claim_item(item_id uuid, claimer_name text)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
  as $$
  declare
    trimmed text := btrim(claimer_name);
    holder  text;
  begin
    if auth.uid() is null then
      raise exception 'sign in required' using errcode = '42501';
    end if;

    if trimmed = '' or char_length(trimmed) > 60 then
      raise exception 'invalid name' using errcode = '22023';
    end if;

    -- The `claimed_by is null` guard is the race resolver: whoever gets there
    -- first updates the row, everyone else matches zero rows.
    update public.items
       set claimed_by     = trimmed,
           claimed_by_uid = auth.uid(),
           claimed_at     = now()
     where id = item_id
       and claimed_by is null;

    if found then
      return jsonb_build_object('ok', true);
    end if;

    select claimed_by into holder from public.items where id = item_id;
    if holder is null then
      raise exception 'no such item' using errcode = 'P0002';
    end if;

    return jsonb_build_object('ok', false, 'claimed_by', holder);
  end
  $$;

create or replace function public.release_item(item_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = ''
  as $$
  begin
    if auth.uid() is null then
      raise exception 'sign in required' using errcode = '42501';
    end if;

    update public.items
       set claimed_by     = null,
           claimed_by_uid = null,
           claimed_at     = null
     where id = item_id
       and claimed_by_uid = auth.uid();

    return jsonb_build_object('ok', found);
  end
  $$;

revoke all on function public.claim_item(uuid, text) from public;
revoke all on function public.release_item(uuid)     from public;
grant execute on function public.claim_item(uuid, text) to authenticated;
grant execute on function public.release_item(uuid)     to authenticated;


-- ── realtime ─────────────────────────────────────────────────────────────────
-- So a claim made on someone's phone crosses the item off on your screen.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'items'
    ) then
      execute 'alter publication supabase_realtime add table public.items';
    end if;

    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'meta'
    ) then
      execute 'alter publication supabase_realtime add table public.meta';
    end if;
  end if;
end
$$;
