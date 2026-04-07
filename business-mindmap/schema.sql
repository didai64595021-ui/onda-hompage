-- ============================================================
-- 사업구상 마인드맵 스키마 (Supabase)
-- 적용: Supabase SQL Editor에서 실행
-- DB: https://byaipfmwicukyzruqtsj.supabase.co
-- ============================================================

create table if not exists mindmaps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists mindmap_bubbles (
  id uuid primary key default gen_random_uuid(),
  mindmap_id uuid not null references mindmaps(id) on delete cascade,
  parent_id uuid references mindmap_bubbles(id) on delete cascade,
  title text default '',
  body text default '',
  x real not null default 0,
  y real not null default 0,
  is_root boolean default false,
  color text default '#0D99FF',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_bubbles_mindmap on mindmap_bubbles(mindmap_id);
create index if not exists idx_bubbles_parent on mindmap_bubbles(parent_id);

-- RLS: 사용자 단독 사용 가정 (anon all)
alter table mindmaps enable row level security;
alter table mindmap_bubbles enable row level security;

drop policy if exists "anon all mindmaps" on mindmaps;
drop policy if exists "anon all bubbles" on mindmap_bubbles;

create policy "anon all mindmaps" on mindmaps for all using (true) with check (true);
create policy "anon all bubbles" on mindmap_bubbles for all using (true) with check (true);
