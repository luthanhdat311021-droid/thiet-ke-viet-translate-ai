-- Bật RLS và không tạo policy nào cho mọi bảng: các bảng không thể đọc/ghi qua API
-- công khai của Supabase (anon key). Chỉ server của app (kết nối bằng DATABASE_URL) truy cập được.

-- Tài khoản người dùng. Mật khẩu chỉ lưu dạng băm scrypt.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.users enable row level security;

-- Phiên đăng nhập. Chỉ lưu SHA-256 của token, token gốc nằm trong cookie httpOnly.
create table if not exists public.sessions (
  token_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on public.sessions (user_id);
alter table public.sessions enable row level security;

-- Lịch sử bản dịch.
-- user_id: id tài khoản (users.id) nếu đã đăng nhập, hoặc mã khách ẩn danh trong cookie "vt_uid".
create table if not exists public.translations (
  id uuid primary key,
  user_id text not null,
  kind text not null,
  title text not null,
  source_language text not null,
  target_language text not null default 'Vietnamese',
  segments jsonb not null default '[]'::jsonb,
  model text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists translations_user_created_idx
  on public.translations (user_id, created_at desc);
alter table public.translations enable row level security;
