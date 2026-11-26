begin;

create table public.market_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  house text not null check (length(trim(house)) between 1 and 30),
  phase text not null check (length(trim(phase)) between 1 and 30),
  lane text not null check (length(trim(lane)) between 1 and 30)
);
alter table public.market_profiles enable row level security;
revoke all on public.market_profiles from anon, authenticated;
grant select, insert, update on public.market_profiles to authenticated;
create policy market_own_profile on public.market_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

alter table public.market_orders
  add column history jsonb not null default '[]',
  add column messages jsonb not null default '[]',
  add column score integer check (score between 1 and 5);

create function public.market_update_order(
  p_id uuid, p_action text, p_expected text, p_score integer, p_message text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  requester uuid := auth.uid();
  target public.market_orders%rowtype;
  owner boolean;
  buyer boolean;
  next_status text;
  now_ms bigint := floor(extract(epoch from now()) * 1000);
begin
  if requester is null then return false; end if;
  select * into target from public.market_orders where id = p_id for update;
  if not found then return false; end if;
  buyer := target.buyer_id = requester;
  owner := exists (select 1 from public.market_shops where id = target.shop_id and owner_id = requester);
  if not (buyer or owner) then return false; end if;
  if p_action = 'message' and length(trim(p_message)) between 1 and 300 then
    update public.market_orders set messages = messages || jsonb_build_object(
      'actor', case when buyer then 'buyer' else 'seller' end, 'text', trim(p_message), 'at', now_ms)
      where id = p_id;
    return true;
  end if;
  if p_action = 'review' and buyer and target.status = 'delivered' and target.score is null and p_score between 1 and 5 then
    update public.market_orders set score = p_score where id = p_id;
    return true;
  end if;
  if target.status is distinct from p_expected then return false; end if;
  if p_action = 'advance' and owner then
    next_status := case target.status when 'new' then 'preparing' when 'preparing' then 'shipping'
      when 'shipping' then 'delivered' end;
  elsif p_action = 'cancel' and buyer and target.status = 'new' then
    next_status := 'cancelled';
  elsif p_action = 'reject' and owner and target.status = 'new' then
    next_status := 'rejected';
  end if;
  if next_status is null then return false; end if;
  update public.market_orders set status = next_status, history = history ||
    jsonb_build_object('status', next_status, 'at', now_ms) where id = p_id;
  return true;
end;
$$;
revoke all on function public.market_update_order(uuid,text,text,integer,text) from public, anon;
grant execute on function public.market_update_order(uuid,text,text,integer,text) to authenticated;

create function public.market_ratings()
returns table(shop_id uuid, average_score numeric, review_count bigint)
language sql stable security definer set search_path = '' as $$
  select o.shop_id, round(avg(o.score),1), count(o.score) from public.market_orders o
  where o.score is not null and o.status = 'delivered' group by o.shop_id
$$;
revoke all on function public.market_ratings() from public;
grant execute on function public.market_ratings() to anon, authenticated;

commit;
