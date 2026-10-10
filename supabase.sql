-- Jalankan di Supabase Dashboard > SQL Editor.
-- Bucket dibuat PUBLIC agar pengunjung tanpa login dapat mengunduh file.
-- Upload/update/delete tetap dibatasi ke user dengan app_metadata.role = 'admin'.

create extension if not exists pgcrypto;

create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 90),
  description text not null check (char_length(description) between 1 and 1200),
  category text not null default 'Lainnya',
  language text not null default 'File',
  file_name text not null,
  file_path text not null unique,
  file_size bigint not null default 0 check (file_size >= 0),
  downloads bigint not null default 0 check (downloads >= 0),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.scripts enable row level security;
revoke all on public.scripts from anon, authenticated;
grant select on public.scripts to anon, authenticated;
grant insert, update, delete on public.scripts to authenticated;

drop policy if exists "Anyone can read published scripts" on public.scripts;
create policy "Anyone can read published scripts" on public.scripts
  for select to anon, authenticated using (published = true or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can insert scripts" on public.scripts;
create policy "Admins can insert scripts" on public.scripts
  for insert to authenticated with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can update scripts" on public.scripts;
create policy "Admins can update scripts" on public.scripts
  for update to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can delete scripts" on public.scripts;
create policy "Admins can delete scripts" on public.scripts
  for delete to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Public read bucket; no public uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('scripts', 'scripts', true, 20971520, null)
on conflict (id) do update set public = true, file_size_limit = 20971520;

drop policy if exists "Public can read script files" on storage.objects;
create policy "Public can read script files" on storage.objects
  for select to anon, authenticated using (bucket_id = 'scripts');

drop policy if exists "Admins can upload script files" on storage.objects;
create policy "Admins can upload script files" on storage.objects
  for insert to authenticated with check (bucket_id = 'scripts' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can update script files" on storage.objects;
create policy "Admins can update script files" on storage.objects
  for update to authenticated using (bucket_id = 'scripts' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check (bucket_id = 'scripts' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can delete script files" on storage.objects;
create policy "Admins can delete script files" on storage.objects
  for delete to authenticated using (bucket_id = 'scripts' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Increment download count atomically and return the committed total.
-- Re-run this section in Supabase SQL Editor when applying this update.
create or replace function public.increment_script_downloads(script_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_total bigint;
begin
  update public.scripts
  set downloads = downloads + 1
  where id = script_id and published = true
  returning downloads into new_total;

  if new_total is null then
    raise exception 'Script tidak ditemukan atau tidak dipublikasikan';
  end if;

  return new_total;
end;
$$;

revoke all on function public.increment_script_downloads(uuid) from public;
grant execute on function public.increment_script_downloads(uuid) to anon, authenticated;
