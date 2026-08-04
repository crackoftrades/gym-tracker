-- Scratch space for working out MyFatoorah's signature format.
--
-- Their docs say the signature is an HMAC over a hand-built
-- "key=value,key2=value2" string, but never state the exact field spelling or
-- order, so `payment-webhook` guesses several and accepts any match. When every
-- guess misses, the rejection is indistinguishable from a forgery and Supabase's
-- log API doesn't surface console output — so the attempt lands here instead,
-- where the real header can be compared against what we computed.
--
-- Drop this table once the format is confirmed.
create table if not exists public.webhook_signature_failures (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),
  header       text,
  candidates   jsonb,
  body         jsonb
);

alter table public.webhook_signature_failures enable row level security;

-- No policies and no grants: readable and writable by the service role only,
-- which is the edge functions and the dashboard. It holds raw gateway events.
revoke all on public.webhook_signature_failures from anon, authenticated;
