-- Migration: 007_marketplace_tables.sql
-- Creates tables for marketplace orders and messages, and sets up Row Level Security.

create table if not exists public.marketplace_orders (
    id uuid default gen_random_uuid() primary key,
    listing_id uuid not null references marketplace_listings(id),
    buyer_id uuid not null references profiles(id),
    seller_id uuid not null references profiles(id),
    price numeric not null,
    status text check (status in ('pending','paid','completed','refunded')) default 'pending',
    payment_reference text,
    paid_at timestamp with time zone,
    verification_code text,
    verified_at timestamp with time zone,
    created_at timestamp with time zone default now(),
    completed_at timestamp with time zone,
    notes text
);

create table if not exists public.marketplace_messages (
    id uuid default gen_random_uuid() primary key,
    order_id uuid not null references marketplace_orders(id) on delete cascade,
    sender_id uuid not null references profiles(id),
    message_type text check (message_type in ('text','verification_code')) not null,
    content text not null,
    code_value text,
    read_at timestamp with time zone,
    created_at timestamp with time zone default now()
);

-- Enable Row Level Security
alter table public.marketplace_orders enable row level security;
alter table public.marketplace_messages enable row level security;

-- Policies for marketplace_orders
create policy "buyers can select own orders"
    on public.marketplace_orders for select
    using (auth.uid() = buyer_id);

create policy "admins can select all orders"
    on public.marketplace_orders for select
    using (exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or role = 'operator')));

create policy "buyers can insert own pending order"
    on public.marketplace_orders for insert
    with check (auth.uid() = buyer_id);

-- No updates or deletes allowed on orders (except via RPCs)
-- (we rely on RPCs with security definer)

-- Policies for marketplace_messages
create policy "buyers can select messages of their orders"
    on public.marketplace_messages for select
    using (auth.uid() = sender_id or auth.uid() = (select buyer_id from marketplace_orders where id = order_id));

create policy "admins can select all messages"
    on public.marketplace_messages for select
    using (exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or role = 'operator')));

create policy "buyers can insert messages into their orders"
    on public.marketplace_messages for insert
    with check (auth.uid() = sender_id and auth.uid() = (select buyer_id from marketplace_orders where id = order_id));

create policy "admins can insert messages"
    on public.marketplace_messages for insert
    with check (exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or role = 'operator')));

-- No updates or deletes allowed on messages
