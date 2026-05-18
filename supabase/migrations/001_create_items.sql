create extension if not exists "pgcrypto";

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  raw_input text not null,
  name text not null default '',
  space text not null default 'inbox',
  tags jsonb not null default '[]'::jsonb,
  priority text not null default 'srednje',
  when_to_tackle text not null default 'kasnije',
  due_date date,
  status text not null default 'novo',
  dependencies jsonb not null default '[]'::jsonb,
  details jsonb not null default '[]'::jsonb,
  notes text not null default '',
  parse_status text not null default 'pending',
  parse_error text,
  constraint items_space_present_check check (length(btrim(space)) > 0),
  constraint items_priority_check check (
    priority in ('nisko', 'srednje', 'visoko', 'hitno')
  ),
  constraint items_status_check check (
    status in ('novo', 'u_tijeku', 'gotovo')
  ),
  constraint items_parse_status_check check (
    parse_status in ('pending', 'parsed', 'failed')
  ),
  constraint items_tags_array_check check (jsonb_typeof(tags) = 'array'),
  constraint items_dependencies_array_check check (jsonb_typeof(dependencies) = 'array'),
  constraint items_details_array_check check (jsonb_typeof(details) = 'array')
);

create index items_user_created_at_idx on public.items (user_id, created_at desc);
create index items_user_space_idx on public.items (user_id, space);
create index items_tags_gin_idx on public.items using gin (tags);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at
before update on public.items
for each row
execute function public.set_updated_at();

alter table public.items enable row level security;

create policy "Users can read own items"
on public.items
for select
using (auth.uid() = user_id);

create policy "Users can insert own items"
on public.items
for insert
with check (auth.uid() = user_id);

create policy "Users can update own items"
on public.items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own items"
on public.items
for delete
using (auth.uid() = user_id);
