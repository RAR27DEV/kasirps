-- ============================================================
-- KASIR PS — Supabase Database Schema
-- 
-- CARA SETUP:
-- 1. Buka https://supabase.com/dashboard
-- 2. Pilih project kamu
-- 3. Klik "SQL Editor" di sidebar kiri
-- 4. Klik "New Query"
-- 5. Copy-paste seluruh isi file ini
-- 6. Klik "Run" (atau Ctrl+Enter)
-- ============================================================

-- ===== TABEL SESSIONS =====
-- Menyimpan semua sesi (aktif + riwayat)
-- status: WAITING = menunggu game mulai, ACTIVE = sedang bermain, DONE = selesai

create table if not exists public.sessions (
  id               uuid        default gen_random_uuid() primary key,
  user_id          uuid        references auth.users(id) on delete cascade not null,
  ps_id            integer     not null,
  ps_type          text        not null,
  players          integer     not null default 1,
  status           text        not null default 'WAITING',
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
-- Menu jajanan yang bisa dikonfigurasi

create table if not exists public.snack_menu (
  id          uuid        default gen_random_uuid() primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  name        text        not null,
  price       integer     not null default 0,
  created_at  timestamptz default now()
);

-- ===== INDEXES =====
create index if not exists idx_sessions_user_id   on public.sessions(user_id);
create index if not exists idx_sessions_status     on public.sessions(status);
create index if not exists idx_sessions_closed_at  on public.sessions(closed_at);
create index if not exists idx_sessions_ps_id      on public.sessions(ps_id);
create index if not exists idx_snack_menu_user_id  on public.snack_menu(user_id);

-- ===== ROW LEVEL SECURITY =====
alter table public.sessions   enable row level security;
alter table public.snack_menu enable row level security;

-- Policies untuk sessions
create policy "sessions_select" on public.sessions
  for select using (auth.uid() = user_id);

create policy "sessions_insert" on public.sessions
  for insert with check (auth.uid() = user_id);

create policy "sessions_update" on public.sessions
  for update using (auth.uid() = user_id);

create policy "sessions_delete" on public.sessions
  for delete using (auth.uid() = user_id);

-- Policies untuk snack_menu
create policy "menu_select" on public.snack_menu
  for select using (auth.uid() = user_id);

create policy "menu_insert" on public.snack_menu
  for insert with check (auth.uid() = user_id);

create policy "menu_update" on public.snack_menu
  for update using (auth.uid() = user_id);

create policy "menu_delete" on public.snack_menu
  for delete using (auth.uid() = user_id);

-- ===== REPLICA IDENTITY (untuk real-time DELETE events) =====
alter table public.sessions   replica identity full;
alter table public.snack_menu replica identity full;

-- ===== ENABLE REALTIME =====
-- Aktifkan real-time sync antar perangkat
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'snack_menu'
  ) then
    alter publication supabase_realtime add table public.snack_menu;
  end if;
end $$;

-- ===== SELESAI =====
-- Setelah menjalankan SQL ini, buka aplikasi dan buat akun baru.
