alter table public.items
add column if not exists due_date date,
add column if not exists details jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'items_details_array_check'
  ) then
    alter table public.items
    add constraint items_details_array_check check (jsonb_typeof(details) = 'array');
  end if;
end;
$$;
