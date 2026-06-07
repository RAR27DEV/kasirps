-- =====================================================
-- KASIR PS — Database Update v2
-- Jalankan di Supabase SQL Editor (setelah schema pertama)
-- Tambah tabel untuk menyimpan pengaturan harga
-- =====================================================

create table if not exists public.user_settings (
  user_id     uuid        references auth.users(id) on delete cascade primary key,
  prices      jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);

alter table public.user_settings enable row level security;

create policy "user_settings_select" on public.user_settings
  for select using (auth.uid() = user_id);

create policy "user_settings_insert" on public.user_settings
  for insert with check (auth.uid() = user_id);

create policy "user_settings_update" on public.user_settings
  for update using (auth.uid() = user_id);

create policy "user_settings_delete" on public.user_settings
  for delete using (auth.uid() = user_id);

-- Selesai! Harga PS sekarang bisa diubah dari dalam app.
