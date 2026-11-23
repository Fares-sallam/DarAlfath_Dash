-- Apply before deploying the dashboard that calls these RPCs. Existing storefront readers are unchanged.

ALTER TABLE public.admin_settings
  ADD COLUMN IF NOT EXISTS can_manage_app_control boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.has_app_control_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_system_owner() OR EXISTS (
    SELECT 1 FROM public.admin_settings
    WHERE user_id = auth.uid() AND can_manage_app_control = true
  );
$$;
REVOKE ALL ON FUNCTION public.has_app_control_permission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_app_control_permission() TO authenticated;

DROP POLICY IF EXISTS "isadmin_full_app_control" ON public.app_control;
DROP POLICY IF EXISTS "app_control_manager_write" ON public.app_control;
CREATE POLICY "app_control_manager_write" ON public.app_control
  FOR ALL TO authenticated
  USING (public.has_app_control_permission())
  WITH CHECK (public.has_app_control_permission());

-- A move followed by a reorder must either both succeed or both roll back.
CREATE OR REPLACE FUNCTION public.menu_move_and_reorder(p_id uuid, p_parent uuid, p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected integer;
  v_actual integer;
  v_channel text;
BEGIN
  IF p_ids IS NULL OR NOT p_id = ANY (p_ids) THEN
    RAISE EXCEPTION 'the moved item must be in the new order' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_expected FROM unnest(p_ids) AS id;
  SELECT count(DISTINCT id) INTO v_actual FROM unnest(p_ids) AS id;
  IF v_expected <> v_actual THEN
    RAISE EXCEPTION 'the new order contains duplicate items' USING ERRCODE = '22023';
  END IF;
  SELECT channel INTO v_channel FROM public.menu_items WHERE id = p_id FOR UPDATE;
  IF v_channel IS NULL THEN
    RAISE EXCEPTION 'the moved item is missing' USING ERRCODE = '22023';
  END IF;
  PERFORM public.menu_move_item(p_id, p_parent);
  SELECT count(*) INTO v_actual FROM public.menu_items
    WHERE parent_id IS NOT DISTINCT FROM p_parent AND channel = v_channel AND id = ANY (p_ids);
  IF v_actual <> v_expected THEN
    RAISE EXCEPTION 'the new order contains items from another group' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_actual FROM public.menu_items
    WHERE parent_id IS NOT DISTINCT FROM p_parent AND channel = v_channel;
  IF v_actual <> v_expected THEN
    RAISE EXCEPTION 'the new order omits items from the group' USING ERRCODE = '22023';
  END IF;
  PERFORM public.menu_reorder(p_ids);
END;
$$;
REVOKE ALL ON FUNCTION public.menu_move_and_reorder(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.menu_move_and_reorder(uuid, uuid, uuid[]) TO authenticated;

-- Normalize the small list's order and swap two entries in a single transaction.
CREATE OR REPLACE FUNCTION public.content_swap_order(p_table text, p_first uuid, p_second uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
  v_first integer;
  v_second integer;
  v_count integer;
BEGIN
  IF p_table NOT IN ('site_announcements', 'home_feature_boxes') THEN
    RAISE EXCEPTION 'unsupported content list' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_first = p_second THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('content_swap_order:' || p_table));
  EXECUTE format('SELECT array_agg(id ORDER BY sort_order, created_at, id) FROM public.%I', p_table)
    INTO v_ids;
  v_first := array_position(v_ids, p_first);
  v_second := array_position(v_ids, p_second);
  IF v_first IS NULL OR v_second IS NULL THEN
    RAISE EXCEPTION 'content item is missing or inaccessible' USING ERRCODE = '22023';
  END IF;
  v_ids[v_first] := p_second;
  v_ids[v_second] := p_first;
  EXECUTE format(
    'UPDATE public.%I AS t SET sort_order = o.pos - 1 FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id, pos) WHERE t.id = o.id',
    p_table
  ) USING v_ids;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'content order could not be saved completely' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.content_swap_order(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.content_swap_order(text, uuid, uuid) TO authenticated;
