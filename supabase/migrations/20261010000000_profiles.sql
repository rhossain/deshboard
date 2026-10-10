-- Accounts: one profile per user, made when the user signs up (docs/subscriptions.md, "Data model").
-- The project doesn't expose new tables to the Data API on its own, so every grant here is deliberate.

create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  plan        text not null default 'free' check (plan in ('free', 'plus', 'monitor')),
  plan_until  timestamptz,                    -- paid until; null for free
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Signed-in users read their own row. Nobody writes it from the browser: the plan changes only through the
-- payment function, which uses the service key.
grant select on public.profiles to authenticated;
create policy "Users read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create function public.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger create_profile after insert on auth.users
  for each row execute function public.create_profile();

-- "Delete my account" on /account/: removes the user, and with them (on delete cascade) everything they own.
create function public.delete_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.create_profile() from public, anon, authenticated;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
