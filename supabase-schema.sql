-- =====================================================
-- KASIR PS — SQL LENGKAP (Jalankan sekali dari awal)
-- Salin semua ini, paste di Supabase SQL Editor → Run
-- =====================================================

-- ===== HAPUS TABEL LAMA (kalau ada) =====
-- Aman dijalankan berulang kali

drop table if exists public.user_settings cascade;
drop table if exists public.snack_menu cascade;
drop table if exists public.sessions cascade;


-- ===== TABEL SESSIONS =====
-- Menyimpan setiap sesi bermain PS

create table public.sessions (
  id               uuid        default gen_random_uuid() primary key,
  user_id          uuid        references auth.users(id) on delete cascade not null,
  ps_id            integer     not null check (ps_id between 1 and 11),
  ps_type          text        not null check (ps_type in ('PS3','PS4')),
  players          integer     not null default 1 check (players in (1,2)),
  status           text        not null default 'WAITING' check (status in ('WAITING','ACTIVE','DONE')),
  start_time       text,
  start_timestamp  bigint,
  package_minutes  integer,
  bonus_minutes    integer     default 0,
  total_minutes    integer,
  end_timestamp    bigint,
  price            integer     default 0,
  paid             boolean     default false,
  snacks           jsonb       default '[]'::jsonb,
  opened_at        timestamptz default now(),
  closed_at        timestamptz,
  note             text,
  created_at       timestamptz default now()
);


-- ===== TABEL SNACK_MENU =====
-- Daftar jajanan yang dijual

create table public.snack_menu (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  name        text        not null,
  price       integer     not null default 0,
  created_at  timestamptz default now()
);


-- ===== TABEL USER_SETTINGS =====
-- Pengaturan harga per akun

create table public.user_settings (
  user_id     uuid        references auth.users(id) on delete cascade primary key,
  prices      jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz default now()
);


-- ===== INDEXES =====
create index idx_sessions_user_id   on public.sessions(user_id);
create index idx_sessions_status    on public.sessions(status);
create index idx_sessions_closed_at on public.sessions(closed_at);
create index idx_sessions_ps_id     on public.sessions(ps_id);
create index idx_snack_menu_user_id on public.snack_menu(user_id);


-- ===== ROW LEVEL SECURITY (RLS) =====
-- Setiap user hanya bisa akses data miliknya sendiri

alter table public.sessions     enable row level security;
alter table public.snack_menu   enable row level security;
alter table public.user_settings enable row level security;


-- Policies: sessions
create policy "sessions_select" on public.sessions
  for select using (auth.uid() = user_id);

create policy "sessions_insert" on public.sessions
  for insert with check (auth.uid() = user_id);

create policy "sessions_update" on public.sessions
  for update using (auth.uid() = user_id);

create policy "sessions_delete" on public.sessions
  for delete using (auth.uid() = user_id);


-- Policies: snack_menu
create policy "snack_menu_select" on public.snack_menu
  for select using (auth.uid() = user_id);

create policy "snack_menu_insert" on public.snack_menu
  for insert with check (auth.uid() = user_id);

create policy "snack_menu_update" on public.snack_menu
  for update using (auth.uid() = user_id);

create policy "snack_menu_delete" on public.snack_menu
  for delete using (auth.uid() = user_id);


-- Policies: user_settings
create policy "user_settings_select" on public.user_settings
  for select using (auth.uid() = user_id);

create policy "user_settings_insert" on public.user_settings
  for insert with check (auth.uid() = user_id);

create policy "user_settings_update" on public.user_settings
  for update using (auth.uid() = user_id);

create policy "user_settings_delete" on public.user_settings
  for delete using (auth.uid() = user_id);


-- ===== REALTIME =====
-- Aktifkan realtime agar sinkron antar device

alter publication supabase_realtime add table public.sessions;
alter publication supabase_realtime add table public.snack_menu;


-- ===== SELESAI! =====
-- Database siap digunakan.
-- Login ke app → daftar akun baru → langsung bisa dipakai.
