-- Paying for Plus by hand with bKash (docs/subscriptions.md, "Payment options"): the reader sends money to the
-- Personal Retail Account, then enters the bKash number they paid from and the transaction ID on /account/. An admin
-- checks it against the bKash app and approves it there, which extends the reader's plan.

-- Admins review payments. Set by hand in the SQL editor; nobody can change it from the browser.
alter table public.profiles add column is_admin boolean not null default false;

-- What each length of plan costs, in taka. /account/ reads it, and every payment's amount comes from it, so a price
-- changes here without a new build.
create table public.plan_prices (
  plan    text not null check (plan in ('plus', 'monitor')),
  months  int not null check (months > 0),
  taka    int not null check (taka > 0),
  primary key (plan, months)
);

alter table public.plan_prices enable row level security;
grant select on public.plan_prices to anon, authenticated;
create policy "Anyone reads the prices" on public.plan_prices for select to anon, authenticated using (true);

insert into public.plan_prices (plan, months, taka) values ('plus', 1, 99), ('plus', 6, 499), ('plus', 12, 799);

create table public.payments (
  id           bigint generated always as identity primary key,
  user_id      uuid not null default auth.uid() references public.profiles on delete cascade,
  plan         text not null,
  months       int not null,
  taka         int not null,                     -- the price when it was submitted, from plan_prices
  sender       text not null check (sender ~ '^01[3-9][0-9]{8}$'),  -- the bKash number paid from
  trx_id       text not null unique check (trx_id ~ '^[A-Z0-9]{8,12}$'),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note         text,                             -- why it was rejected; shown to the reader
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz,
  foreign key (plan, months) references public.plan_prices on update cascade
);

create index payments_user on public.payments (user_id, created_at desc);
create index payments_pending on public.payments (created_at) where status = 'pending';

alter table public.payments enable row level security;

-- Readers see their own payments and can submit new ones: only these four columns, always as pending.
grant select on public.payments to authenticated;
grant insert (plan, months, sender, trx_id) on public.payments to authenticated;
create policy "Users read their own payments" on public.payments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users submit their own payments" on public.payments
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Fills in the price, tidies the transaction ID, and stops one account from piling up unchecked payments.
create function public.prepare_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.trx_id := upper(regexp_replace(new.trx_id, '\s', '', 'g'));
  select taka into new.taka from public.plan_prices where plan = new.plan and months = new.months;
  if new.taka is null then
    raise exception 'That plan length is not on sale';
  end if;
  if (select count(*) from public.payments where user_id = new.user_id and status = 'pending') >= 3 then
    raise exception 'You already have 3 payments waiting to be checked. Please wait for those first.';
  end if;
  new.status := 'pending';
  new.note := null;
  new.reviewed_at := null;
  return new;
end;
$$;

create trigger prepare_payment before insert on public.payments
  for each row execute function public.prepare_payment();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- The admin's list on /account/: payments waiting to be checked, with the reader's email.
create function public.pending_payments()
returns table (id bigint, email text, plan text, months int, taka int, sender text, trx_id text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see payments';
  end if;
  return query
    select p.id, u.email::text, p.plan, p.months, p.taka, p.sender, p.trx_id, p.created_at
    from public.payments p join auth.users u on u.id = p.user_id
    where p.status = 'pending'
    order by p.created_at;
end;
$$;

-- Approving adds the months to the plan, counting from today or from when the current plan runs out, whichever is
-- later. Rejecting keeps the plan as it is and shows the note to the reader.
create function public.review_payment(payment_id bigint, approve boolean, reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  p public.payments;
begin
  if not public.is_admin() then
    raise exception 'Only admins can review payments';
  end if;
  update public.payments
    set status = case when approve then 'approved' else 'rejected' end,
        note = case when approve then null else nullif(trim(reason), '') end,
        reviewed_at = now()
    where id = payment_id and status = 'pending'
    returning * into p;
  if p.id is null then
    raise exception 'That payment was already reviewed';
  end if;
  if approve then
    update public.profiles
      set plan = p.plan,
          plan_until = greatest(coalesce(plan_until, now()), now()) + make_interval(months => p.months)
      where id = p.user_id;
  end if;
end;
$$;

revoke execute on function public.prepare_payment() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.pending_payments() from public, anon;
revoke execute on function public.review_payment(bigint, boolean, text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.pending_payments() to authenticated;
grant execute on function public.review_payment(bigint, boolean, text) to authenticated;
