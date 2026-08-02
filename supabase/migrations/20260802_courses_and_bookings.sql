-- Pre-planned training courses that members can buy, and the bookings that
-- record a purchase. Payment is handled by MyFatoorah: the `create-payment`
-- edge function opens the invoice, and only the `payment-webhook` edge function
-- (service role) is ever allowed to move `payment_status` forward.

-- ---------------------------------------------------------------- courses --
create table if not exists public.courses (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  title              text not null,
  subtitle           text not null,
  description        text not null,
  level              text not null,
  focus              text not null,
  weeks              integer not null,
  sessions_per_week  integer not null,
  price              numeric(10, 3) not null check (price > 0),
  currency           text not null default 'KWD',
  highlights         text[] not null default '{}',
  is_active          boolean not null default true,
  sort_index         integer not null default 0,
  created_at         timestamptz not null default now()
);

alter table public.courses enable row level security;

-- The catalogue is the same for everyone; it is read-only from the client.
drop policy if exists "Courses are readable by everyone" on public.courses;
create policy "Courses are readable by everyone"
  on public.courses for select
  to anon, authenticated
  using (is_active);

-- Supabase grants ALL on new tables by default. SELECT is the only privilege
-- either client role has any business holding — TRUNCATE in particular would
-- bypass RLS entirely.
revoke all on public.courses from anon, authenticated;
grant select on public.courses to anon, authenticated;

-- --------------------------------------------------------------- bookings --
create table if not exists public.bookings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  course_id       uuid not null references public.courses (id),
  -- The handle the payment gateway echoes back to us. Sent to MyFatoorah as
  -- CustomerReference, and what `payment-webhook` looks the booking up by.
  reference       text not null unique,
  payment_status  text not null default 'pending'
                    check (payment_status in ('pending', 'awaiting_payment', 'paid', 'failed', 'expired')),
  amount          numeric(10, 3) not null,
  currency        text not null default 'KWD',
  gateway         text not null default 'myfatoorah',
  invoice_id      text,
  payment_id      text,
  payment_url     text,
  failure_reason  text,
  -- Last raw gateway event, kept for support / debugging.
  last_event      jsonb,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists bookings_invoice_id_idx on public.bookings (invoice_id);

alter table public.bookings enable row level security;

-- Members may read their own bookings and nothing else. There is deliberately
-- no insert / update / delete policy: rows are created by `create-payment` and
-- only ever advanced by `payment-webhook`, both of which use the service role
-- and so bypass RLS entirely.
drop policy if exists "Members read their own bookings" on public.bookings;
create policy "Members read their own bookings"
  on public.bookings for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.bookings from anon, authenticated;
grant select on public.bookings to authenticated;

-- Second lock on the same door. Table grants and RLS both have to be right for
-- the client to be shut out; this trigger fails closed even if a later
-- migration hands out a broad UPDATE policy by mistake. PostgREST runs requests
-- as `anon` / `authenticated` / `service_role`, so `current_user` is the honest
-- signal for who is asking.
create or replace function public.bookings_guard_payment_status()
  returns trigger
  language plpgsql
as $$
begin
  if new.payment_status is distinct from old.payment_status
     and current_user not in ('service_role', 'postgres', 'supabase_admin')
  then
    raise exception
      'payment_status is set by the payment webhook only (attempted by %)', current_user
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_guard_payment_status on public.bookings;
create trigger bookings_guard_payment_status
  before update on public.bookings
  for each row execute function public.bookings_guard_payment_status();

create or replace function public.bookings_touch_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.bookings_touch_updated_at();
