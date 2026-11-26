begin;

create table public.market_shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid() references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 60),
  description text not null check (length(trim(description)) between 1 and 120),
  cover_path text,
  qr_path text,
  is_open boolean not null default true,
  opens_at time,
  closes_at time,
  check ((opens_at is null and closes_at is null)
      or (opens_at is not null and closes_at is not null and opens_at <> closes_at))
);

create table public.market_menu (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.market_shops(id),
  name text not null check (length(trim(name)) between 1 and 80),
  description text not null check (length(trim(description)) between 1 and 200),
  category text not null check (category in ('meals', 'noodles', 'sides', 'snacks', 'desserts', 'drinks', 'other')),
  price_baht integer not null check (price_baht between 1 and 9999),
  image_path text,
  paused boolean not null default false
);
create index market_menu_shop_idx on public.market_menu(shop_id);

create table public.market_orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id),
  shop_id uuid not null references public.market_shops(id),
  checkout_id uuid not null,
  total_baht integer not null check (total_baht > 0),
  payment text not null check (payment in ('cash', 'transfer')),
  handoff text not null check (handoff in ('handover', 'doorstep')),
  recipient text check (length(recipient) <= 60),
  house text not null check (length(house) between 1 and 30),
  phase text not null check (length(phase) between 1 and 30),
  lane text not null check (length(lane) between 1 and 30),
  note text not null default '' check (length(note) <= 150),
  status text not null default 'new' check (status in ('new', 'preparing', 'shipping', 'delivered', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (buyer_id, checkout_id, shop_id)
);
create index market_orders_shop_idx on public.market_orders(shop_id, created_at desc);

create table public.market_order_items (
  order_id uuid not null references public.market_orders(id),
  menu_id uuid not null references public.market_menu(id),
  name text not null,
  quantity integer not null check (quantity between 1 and 20),
  price_baht integer not null check (price_baht > 0),
  primary key (order_id, menu_id)
);

alter table public.market_shops enable row level security;
alter table public.market_menu enable row level security;
alter table public.market_orders enable row level security;
alter table public.market_order_items enable row level security;

revoke all on public.market_shops, public.market_menu, public.market_orders, public.market_order_items from anon, authenticated;
grant select (id, name, description, cover_path, qr_path, is_open, opens_at, closes_at)
  on public.market_shops to anon, authenticated;
grant select (owner_id), insert (name, description, cover_path, qr_path, is_open, opens_at, closes_at),
  update (name, description, cover_path, qr_path, is_open, opens_at, closes_at)
  on public.market_shops to authenticated;
grant select on public.market_menu to anon, authenticated;
grant insert (shop_id, name, description, category, price_baht, image_path, paused),
  update (name, description, category, price_baht, image_path, paused) on public.market_menu to authenticated;
grant select on public.market_orders, public.market_order_items to authenticated;

create policy market_read_shops on public.market_shops for select to anon, authenticated using (true);
create policy market_create_shop on public.market_shops for insert to authenticated
  with check (owner_id = (select auth.uid()) and not coalesce((select auth.jwt()->>'is_anonymous')::boolean, false));
create policy market_edit_shop on public.market_shops for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy market_read_menu on public.market_menu for select to anon, authenticated using (not paused);
create policy market_read_own_menu on public.market_menu for select to authenticated
  using (exists (select 1 from public.market_shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
create policy market_create_menu on public.market_menu for insert to authenticated
  with check (exists (select 1 from public.market_shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
create policy market_edit_menu on public.market_menu for update to authenticated
  using (exists (select 1 from public.market_shops s where s.id = shop_id and s.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.market_shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
create policy market_read_orders on public.market_orders for select to authenticated
  using (buyer_id = (select auth.uid()) or
    exists (select 1 from public.market_shops s where s.id = shop_id and s.owner_id = (select auth.uid())));
create policy market_read_order_items on public.market_order_items for select to authenticated
  using (exists (select 1 from public.market_orders o where o.id = order_id));

-- All shops in one checkout succeed or fail together. Catalog prices are authoritative.
create function public.market_checkout(p_checkout_id uuid, p_shops jsonb, p_delivery jsonb, p_handoff text)
returns uuid[]
language plpgsql security definer set search_path = ''
as $$
declare
  requester uuid := auth.uid();
  shop_request jsonb;
  line_request jsonb;
  shop_row public.market_shops%rowtype;
  menu_row public.market_menu%rowtype;
  order_id uuid;
  order_ids uuid[] := '{}';
  local_time time := timezone('Asia/Bangkok', now())::time;
  subtotal integer;
  item_quantity integer;
  items jsonb;
  payment_method text;
begin
  if requester is null or p_checkout_id is null then
    raise exception 'Sign-in and checkout ID required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(requester::text || ':' || p_checkout_id::text, 0));
  select coalesce(array_agg(o.id order by o.shop_id), '{}') into order_ids
  from public.market_orders o where o.buyer_id = requester and o.checkout_id = p_checkout_id;
  if cardinality(order_ids) > 0 then return order_ids; end if;
  if jsonb_typeof(p_shops) is distinct from 'array' or jsonb_array_length(p_shops) not between 1 and 10 then
    raise exception 'Select between 1 and 10 shops';
  end if;
  for shop_request in select value from jsonb_array_elements(p_shops) order by value->>'shop_id' loop
    select * into shop_row from public.market_shops where id = (shop_request->>'shop_id')::uuid for share;
    if not found or not shop_row.is_open or (shop_row.opens_at is not null and not (
      case when shop_row.opens_at < shop_row.closes_at
        then local_time >= shop_row.opens_at and local_time < shop_row.closes_at
        else local_time >= shop_row.opens_at or local_time < shop_row.closes_at end)) then
      raise exception 'Shop is not accepting orders';
    end if;
    payment_method := shop_request->>'payment';
    if payment_method is null or payment_method not in ('cash', 'transfer')
        or (payment_method = 'transfer' and nullif(shop_row.qr_path, '') is null) then
      raise exception 'Payment method not available';
    end if;
    if jsonb_typeof(shop_request->'items') is distinct from 'array' or
        jsonb_array_length(shop_request->'items') not between 1 and 30 then
      raise exception 'Select between 1 and 30 items';
    end if;
    subtotal := 0;
    items := '[]';
    for line_request in select value from jsonb_array_elements(shop_request->'items') order by value->>'menu_id' loop
      select * into menu_row from public.market_menu where id = (line_request->>'menu_id')::uuid
        and shop_id = shop_row.id and not paused for share;
      item_quantity := (line_request->>'quantity')::integer;
      if not found or item_quantity is null or item_quantity not between 1 and 20
          or menu_row.price_baht is distinct from (line_request->>'price_baht')::integer then
        raise exception 'Menu availability or price changed';
      end if;
      subtotal := subtotal + menu_row.price_baht * item_quantity;
      items := items || jsonb_build_object('menu_id', menu_row.id, 'name', menu_row.name,
        'quantity', item_quantity, 'price_baht', menu_row.price_baht);
    end loop;
    insert into public.market_orders (buyer_id, shop_id, checkout_id, total_baht, payment, handoff, recipient, house, phase, lane, note)
      values (requester, shop_row.id, p_checkout_id, subtotal, payment_method, p_handoff,
        nullif(trim(p_delivery->>'name'), ''), trim(p_delivery->>'house'), trim(p_delivery->>'phase'),
        trim(p_delivery->>'lane'), coalesce(trim(p_delivery->>'note'), ''))
      returning id into order_id;
    insert into public.market_order_items (order_id, menu_id, name, quantity, price_baht)
      select order_id, i.menu_id, i.name, i.quantity, i.price_baht
      from jsonb_to_recordset(items) as i(menu_id uuid, name text, quantity integer, price_baht integer);
    order_ids := array_append(order_ids, order_id);
  end loop;
  return order_ids;
end;
$$;
revoke all on function public.market_checkout(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.market_checkout(uuid, jsonb, jsonb, text) to authenticated;

commit;
