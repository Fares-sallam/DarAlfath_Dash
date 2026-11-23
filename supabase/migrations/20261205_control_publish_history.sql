-- Apply after 20261204 and before deploying the dashboard. Existing readers are unchanged.
CREATE TABLE IF NOT EXISTS public.control_publish_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('appearance', 'app_control')),
  snapshot jsonb NOT NULL,
  actor uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  transaction_id bigint NOT NULL DEFAULT txid_current(),
  UNIQUE (scope, transaction_id)
);

CREATE INDEX IF NOT EXISTS control_publish_history_scope_time
  ON public.control_publish_history (scope, created_at DESC);
ALTER TABLE public.control_publish_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS control_publish_history_read ON public.control_publish_history;
CREATE POLICY control_publish_history_read ON public.control_publish_history FOR SELECT TO authenticated
  USING ((scope = 'app_control' AND public.has_app_control_permission())
    OR (scope = 'appearance' AND public.is_admin()));
REVOKE ALL ON public.control_publish_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.control_publish_history TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_control_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF to_jsonb(OLD) - 'updated_at' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' THEN
    INSERT INTO public.control_publish_history (scope, snapshot, actor)
      VALUES (TG_ARGV[0], to_jsonb(OLD), auth.uid())
      ON CONFLICT (scope, transaction_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_control_history() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_storefront_appearance_history ON public.storefront_appearance;
CREATE TRIGGER trg_storefront_appearance_history BEFORE UPDATE ON public.storefront_appearance
  FOR EACH ROW EXECUTE FUNCTION public.capture_control_history('appearance');
DROP TRIGGER IF EXISTS trg_app_control_history ON public.app_control;
CREATE TRIGGER trg_app_control_history BEFORE UPDATE ON public.app_control
  FOR EACH ROW EXECUTE FUNCTION public.capture_control_history('app_control');

-- The expected revision is checked while the singleton row is locked: stale admin tabs cannot overwrite newer edits.
CREATE OR REPLACE FUNCTION public.control_save(
  p_scope text, p_expected timestamptz, p_payload jsonb
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_current timestamptz;
BEGIN
  IF p_expected IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Invalid control save' USING ERRCODE = '22023';
  END IF;
  IF p_scope IN ('appearance_look', 'appearance_display') THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT updated_at INTO v_current FROM public.storefront_appearance WHERE id = 1 FOR UPDATE;
    IF v_current IS DISTINCT FROM p_expected THEN
      RAISE EXCEPTION 'Settings were changed in another tab. Reload before saving.' USING ERRCODE = '40001';
    END IF;
    IF p_scope = 'appearance_look' THEN
      UPDATE public.storefront_appearance SET
        pattern_strength = (p_payload->>'pattern_strength')::smallint,
        strip_arrangement = p_payload->>'strip_arrangement',
        home_sections = p_payload->'home_sections',
        button_styles = p_payload->'button_styles'
      WHERE id = 1;
    ELSE
      UPDATE public.storefront_appearance SET display = p_payload->'display' WHERE id = 1;
    END IF;
  ELSIF p_scope = 'app_control' THEN
    IF NOT public.has_app_control_permission() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT updated_at INTO v_current FROM public.app_control WHERE id = 1 FOR UPDATE;
    IF v_current IS DISTINCT FROM p_expected THEN
      RAISE EXCEPTION 'Settings were changed in another tab. Reload before saving.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.app_control SET
      maintenance = p_payload->'maintenance',
      update_policy = p_payload->'update_policy',
      popup = p_payload->'popup'
    WHERE id = 1;
  ELSE
    RAISE EXCEPTION 'Unsupported control scope' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.control_save(text, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_save(text, timestamptz, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.control_restore(p_history_id bigint, p_expected timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_history public.control_publish_history%ROWTYPE;
  v_current timestamptz;
  v_appearance public.storefront_appearance%ROWTYPE;
  v_app public.app_control%ROWTYPE;
BEGIN
  SELECT * INTO v_history FROM public.control_publish_history WHERE id = p_history_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'History entry is unavailable' USING ERRCODE = '42501'; END IF;
  IF p_expected IS NULL THEN RAISE EXCEPTION 'Expected revision is required' USING ERRCODE = '22023'; END IF;
  IF v_history.scope = 'appearance' THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT updated_at INTO v_current FROM public.storefront_appearance WHERE id = 1 FOR UPDATE;
    IF v_current IS DISTINCT FROM p_expected THEN
      RAISE EXCEPTION 'Settings were changed in another tab. Reload before restoring.' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_appearance FROM jsonb_populate_record(NULL::public.storefront_appearance, v_history.snapshot);
    UPDATE public.storefront_appearance SET
      pattern_strength = v_appearance.pattern_strength,
      strip_arrangement = v_appearance.strip_arrangement,
      home_sections = v_appearance.home_sections,
      button_styles = v_appearance.button_styles,
      display = v_appearance.display
    WHERE id = 1;
  ELSIF v_history.scope = 'app_control' THEN
    IF NOT public.has_app_control_permission() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT updated_at INTO v_current FROM public.app_control WHERE id = 1 FOR UPDATE;
    IF v_current IS DISTINCT FROM p_expected THEN
      RAISE EXCEPTION 'Settings were changed in another tab. Reload before restoring.' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_app FROM jsonb_populate_record(NULL::public.app_control, v_history.snapshot);
    UPDATE public.app_control SET
      maintenance = v_app.maintenance,
      update_policy = v_app.update_policy,
      popup = v_app.popup
    WHERE id = 1;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.control_restore(bigint, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.control_restore(bigint, timestamptz) TO authenticated;
