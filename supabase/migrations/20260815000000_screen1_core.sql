-- 画面 1（アイデアボード + チャット）開発用の最小スキーマ。
-- docs/screen1-requirements.md「3. データモデル」と docs/backend-supabase-plan.md
-- 「6.1 共通・画面 1」「7. Auth・招待・RLS」の契約に従う。
-- feat(db) / feat(auth) の本実装 PR で拡張・置換されることを前提とした先行実装。

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- テーブル
-- ---------------------------------------------------------------------------

create table trips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null default 'Asia/Tokyo',
  origin text,
  budget numeric,
  currency text not null default 'JPY',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table trip_members (
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null,
  nickname text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table trip_invites (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  token_hash text unique not null, -- 生の招待トークンは保存しない
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  author_id uuid not null,
  author_name text not null,
  text text not null check (char_length(text) <= 500),
  processed boolean not null default false, -- AI が読んだか
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null check (char_length(title) <= 60),
  memo text,
  attrs jsonb not null default '{}',
  origin text not null check (origin in ('ai', 'user')),
  user_touched boolean not null default false,
  status text not null default 'active' check (status in ('active', 'held')),
  hold_reason text,
  source_message_id uuid references messages(id),
  author_id uuid,
  x float8 not null default 0,
  y float8 not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table note_operations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  note_id uuid references notes(id),
  op text not null check (op in ('add', 'update', 'hold')),
  before_state jsonb,
  after_state jsonb,
  source_message_id uuid references messages(id),
  reverted_at timestamptz,
  reverted_by uuid,
  created_at timestamptz not null default now()
);

create index messages_trip_created_idx on messages (trip_id, created_at);
create index notes_trip_idx on notes (trip_id);
create index note_operations_trip_idx on note_operations (trip_id, created_at);

-- updated_at の自動更新
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trips_set_updated_at before update on trips
  for each row execute function public.set_updated_at();
create trigger notes_set_updated_at before update on notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 権限（GRANT）: RLS の前提となるテーブルレベル権限。
-- 書き込みを RPC に限定するテーブルは、GRANT レベルでも direct DML を与えない
-- ---------------------------------------------------------------------------

grant select, update on trips to authenticated;               -- 作成は RPC のみ
grant select on trip_members to authenticated;                -- 登録は RPC のみ
grant select on trip_invites to authenticated;                -- 発行・失効は RPC / owner
grant select, insert, update on messages to authenticated;    -- 削除は論理削除（update）
grant select, insert, update, delete on notes to authenticated;
grant select on note_operations to authenticated;             -- 書き込みは RPC のみ

-- ---------------------------------------------------------------------------
-- RLS（backend-supabase-plan.md 7.3 のマトリクスに従う）
-- 所属判定は SECURITY DEFINER helper に集約し、RLS の再帰を避ける
-- ---------------------------------------------------------------------------

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_trip_member(p_trip_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_trip_member(uuid) from public;
grant execute on function private.is_trip_member(uuid) to authenticated;

alter table trips enable row level security;
alter table trip_members enable row level security;
alter table trip_invites enable row level security;
alter table messages enable row level security;
alter table notes enable row level security;
alter table note_operations enable row level security;

-- trips: member が読める。作成は RPC 限定（insert policy なし）。設定変更は owner
create policy trips_select on trips
  for select to authenticated
  using (private.is_trip_member(id));

create policy trips_update_owner on trips
  for update to authenticated
  using (exists (
    select 1 from trip_members
    where trip_id = trips.id and user_id = (select auth.uid()) and role = 'owner'
  ));

-- trip_members: 同じ旅行の member が読める。登録は RPC 限定
create policy trip_members_select on trip_members
  for select to authenticated
  using (private.is_trip_member(trip_id));

-- trip_invites: member が読める。発行・失効は RPC / owner（MVP では RPC のみ）
create policy trip_invites_select on trip_invites
  for select to authenticated
  using (private.is_trip_member(trip_id));

-- messages: member が読み書き。論理削除（update）は author のみ
create policy messages_select on messages
  for select to authenticated
  using (private.is_trip_member(trip_id));

create policy messages_insert on messages
  for insert to authenticated
  with check (
    private.is_trip_member(trip_id)
    and author_id = (select auth.uid())
  );

create policy messages_update_author on messages
  for update to authenticated
  using (author_id = (select auth.uid()));

-- notes: member が CRUD（AI 適用・undo は RPC。feat(ai) で追加）
create policy notes_select on notes
  for select to authenticated
  using (private.is_trip_member(trip_id));

create policy notes_insert on notes
  for insert to authenticated
  with check (private.is_trip_member(trip_id));

create policy notes_update on notes
  for update to authenticated
  using (private.is_trip_member(trip_id));

create policy notes_delete on notes
  for delete to authenticated
  using (private.is_trip_member(trip_id));

-- note_operations: member が読める。書き込みは RPC 限定（policy なし）
create policy note_operations_select on note_operations
  for select to authenticated
  using (private.is_trip_member(trip_id));

-- ---------------------------------------------------------------------------
-- RPC（SECURITY DEFINER・search_path 固定・authenticated のみ実行可）
-- ---------------------------------------------------------------------------

-- 旅行・作成者 membership・招待を 1 transaction で作成し、生トークンを一度だけ返す
create or replace function public.create_trip(
  p_title text,
  p_nickname text,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_timezone text default 'Asia/Tokyo',
  p_origin text default null,
  p_budget numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip_id uuid;
  v_token text;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_title is null or length(trim(p_title)) = 0 or length(p_title) > 100 then
    raise exception 'INVALID_INPUT';
  end if;
  if p_nickname is null or length(trim(p_nickname)) = 0 or length(p_nickname) > 30 then
    raise exception 'INVALID_INPUT';
  end if;

  insert into public.trips (title, starts_at, ends_at, timezone, origin, budget, created_by)
  values (p_title, p_starts_at, p_ends_at, coalesce(p_timezone, 'Asia/Tokyo'), p_origin, p_budget, v_uid)
  returning id into v_trip_id;

  insert into public.trip_members (trip_id, user_id, nickname, role)
  values (v_trip_id, v_uid, p_nickname, 'owner');

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.trip_invites (trip_id, token_hash)
  values (v_trip_id, encode(extensions.digest(v_token, 'sha256'), 'hex'));

  return jsonb_build_object('trip_id', v_trip_id, 'invite_token', v_token);
end;
$$;

-- 招待トークンを検証して membership を upsert する
create or replace function public.join_trip(p_token text, p_nickname text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_trip_id uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_nickname is null or length(trim(p_nickname)) = 0 or length(p_nickname) > 30 then
    raise exception 'INVALID_INPUT';
  end if;

  select trip_id into v_trip_id
  from public.trip_invites
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if v_trip_id is null then
    raise exception 'NOT_FOUND';
  end if;

  insert into public.trip_members (trip_id, user_id, nickname)
  values (v_trip_id, v_uid, p_nickname)
  on conflict (trip_id, user_id) do nothing;

  return v_trip_id;
end;
$$;

revoke all on function public.create_trip(text, text, timestamptz, timestamptz, text, text, numeric) from public;
grant execute on function public.create_trip(text, text, timestamptz, timestamptz, text, text, numeric) to authenticated;
revoke all on function public.join_trip(text, text) from public;
grant execute on function public.join_trip(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: 必要テーブルだけ publication へ追加（messages / notes のみ）
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table notes;
