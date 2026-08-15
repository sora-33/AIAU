-- AI 操作の適用・取り消し RPC。
-- docs/screen1-requirements.md「4. AI 入出力契約」/ backend-supabase-plan.md「11.1 付箋抽出」に従う。
-- - AI は add / update / hold のみ（delete なし）
-- - target の存在・trip 一致・user_touched=false をサーバー側で再検証する
-- - すべての操作を note_operations に記録し、人間が個別に取り消せる

-- AI 操作を検証して適用する。Edge Function（service role）専用
create or replace function public.apply_note_operations(p_trip_id uuid, p_operations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op jsonb;
  v_kind text;
  v_target uuid;
  v_source uuid;
  v_note public.notes%rowtype;
  v_applied int := 0;
  v_skipped int := 0;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'INVALID_INPUT';
  end if;

  for v_op in select * from jsonb_array_elements(p_operations) loop
    v_kind := v_op->>'op';
    v_source := nullif(v_op->>'source', '')::uuid;

    if v_kind = 'add' then
      if coalesce(length(trim(v_op->>'title')), 0) = 0 or length(v_op->>'title') > 60 then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      insert into public.notes (trip_id, title, memo, attrs, origin, source_message_id, x, y)
      values (
        p_trip_id,
        v_op->>'title',
        nullif(v_op->>'memo', ''),
        coalesce(v_op->'attrs', '{}'::jsonb),
        'ai',
        v_source,
        40 + floor(random() * 200),
        40 + floor(random() * 200)
      )
      returning * into v_note;

      insert into public.note_operations (trip_id, note_id, op, after_state, source_message_id)
      values (p_trip_id, v_note.id, 'add', to_jsonb(v_note), v_source);
      v_applied := v_applied + 1;

    elsif v_kind in ('update', 'hold') then
      v_target := nullif(v_op->>'target', '')::uuid;
      select * into v_note from public.notes
        where id = v_target and trip_id = p_trip_id;
      -- 存在しない / 別 trip / 人間が触った付箋には適用しない（S1-11 / S1-12）
      if not found or v_note.user_touched then
        v_skipped := v_skipped + 1;
        continue;
      end if;

      if v_kind = 'update' then
        update public.notes set
          title = coalesce(nullif(v_op->>'title', ''), title),
          memo = coalesce(nullif(v_op->>'memo', ''), memo),
          attrs = attrs || coalesce(v_op->'attrs', '{}'::jsonb),
          source_message_id = coalesce(v_source, source_message_id)
        where id = v_target;
      else
        -- hold には reason 必須（AI に削除権限はない）
        if coalesce(length(trim(v_op->>'reason')), 0) = 0 then
          v_skipped := v_skipped + 1;
          continue;
        end if;
        update public.notes set
          status = 'held',
          hold_reason = v_op->>'reason',
          source_message_id = coalesce(v_source, source_message_id)
        where id = v_target;
      end if;

      insert into public.note_operations (trip_id, note_id, op, before_state, after_state, source_message_id)
      select p_trip_id, v_target, v_kind, to_jsonb(v_note), to_jsonb(n), v_source
      from public.notes n where n.id = v_target;
      v_applied := v_applied + 1;

    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('applied', v_applied, 'skipped', v_skipped);
end;
$$;

revoke all on function public.apply_note_operations(uuid, jsonb) from public;
grant execute on function public.apply_note_operations(uuid, jsonb) to service_role;

-- 対象付箋への直近の AI 操作を before_state へ戻す（S1-15 / S1-17。旅行の member が実行可）
create or replace function public.undo_last_note_operation(p_note_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_op public.note_operations%rowtype;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select o.* into v_op
  from public.note_operations o
  where o.note_id = p_note_id and o.reverted_at is null
  order by o.created_at desc
  limit 1;

  if not found then
    return false;
  end if;

  if not exists (
    select 1 from public.trip_members
    where trip_id = v_op.trip_id and user_id = v_uid
  ) then
    raise exception 'NOT_A_MEMBER';
  end if;

  if v_op.op = 'add' then
    delete from public.notes where id = p_note_id;
  else
    update public.notes set
      title = v_op.before_state->>'title',
      memo = v_op.before_state->>'memo',
      attrs = coalesce(v_op.before_state->'attrs', '{}'::jsonb),
      status = coalesce(v_op.before_state->>'status', 'active'),
      hold_reason = v_op.before_state->>'hold_reason'
    where id = p_note_id;
  end if;

  update public.note_operations
  set reverted_at = now(), reverted_by = v_uid
  where id = v_op.id;

  return true;
end;
$$;

revoke all on function public.undo_last_note_operation(uuid) from public;
grant execute on function public.undo_last_note_operation(uuid) to authenticated;
