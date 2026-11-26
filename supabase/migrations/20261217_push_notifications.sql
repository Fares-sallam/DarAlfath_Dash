-- =====================================================================================================================
-- Push notifications for customers (the app half is already in the repo: services/pushNotificationService.ts, components/PushSync.tsx).
--
--   1. an order moves to confirmed / shipped / delivered / cancelled / returned      → «order» notification
--   2. a delivered book, two days after the delivery, once per book, never if rated  → «review» notification
--   3. every day at 16:00 UTC (18:00 / 19:00 Cairo): see what is new                 → «daily» (only for those who said yes)
--   4. a favourite book that was out of stock is available again                      → «restock» (only for those who said yes)
--
-- Design:
--   * Everything is decided in the database (triggers / pg_cron), so it works whoever changes the order (dashboard, app, SQL).
--   * A trigger only writes a row into push_outbox (never calls the network, never raises): an order update can not fail because of this.
--   * push_outbox.dedupe_key is UNIQUE, which is what makes «once only» true.
--   * pg_cron (every minute) and the triggers «kick» the push-dispatch Edge Function through pg_net; it claims the pending rows with
--     push_claim_batch(), sends them through Expo, and reports back with push_finish() / push_drop_token().
--   * The function is deployed with JWT verification off (the database has no user JWT); it accepts only the shared secret kept in vault
--     (push_dispatch_secret), checked through push_secret_ok(). Same idea as reconcile-paymob-stock-holds; no manual secret to set.
--   * Marketing (daily / restock) goes only to devices with discover_enabled = true, which the app sets only after the customer says yes.
--
-- Additive only. Nothing existing is altered except two new AFTER UPDATE triggers (orders.status, product_inventory).
-- Apply after review; test first inside a transaction that is rolled back.
-- =====================================================================================================================

-- ── 1) Favourites: the app already reads and writes this table; it did not exist, so favourites were never saved ─────────
CREATE TABLE IF NOT EXISTS public.wishlist (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  book_id    uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, book_id)
);
CREATE INDEX IF NOT EXISTS wishlist_book_idx ON public.wishlist (book_id);
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wishlist FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.wishlist TO authenticated;
DROP POLICY IF EXISTS wishlist_select_own ON public.wishlist;
CREATE POLICY wishlist_select_own ON public.wishlist FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS wishlist_insert_own ON public.wishlist;
CREATE POLICY wishlist_insert_own ON public.wishlist FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS wishlist_delete_own ON public.wishlist;
CREATE POLICY wishlist_delete_own ON public.wishlist FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ── 2) Devices ──────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_devices (
  token            text        PRIMARY KEY CHECK (token ~ '^(Expo|Exponent)PushToken\[[^\]\s]+\]$'),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform         text        NOT NULL CHECK (platform IN ('ios', 'android')),
  language         text        NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
  orders_enabled   boolean     NOT NULL DEFAULT true,    -- order status + «rate your book»
  discover_enabled boolean     NOT NULL DEFAULT false,   -- the daily reminder + «a favourite is back»: only after the customer said yes
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_devices_user_idx ON public.push_devices (user_id);
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;   -- no policy: only the functions below touch it
REVOKE ALL ON public.push_devices FROM PUBLIC, anon, authenticated;

-- A token identifies a physical install, so it moves to whoever signs in on it.
CREATE OR REPLACE FUNCTION public.register_push_device(
  p_token text, p_platform text, p_language text DEFAULT 'ar', p_orders boolean DEFAULT NULL, p_discover boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501'; END IF;
  IF p_token IS NULL OR p_token !~ '^(Expo|Exponent)PushToken\[[^\]\s]+\]$' THEN
    RAISE EXCEPTION 'not an Expo push token' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.push_devices (token, user_id, platform, language, orders_enabled, discover_enabled)
  VALUES (p_token, v_uid, CASE WHEN p_platform = 'ios' THEN 'ios' ELSE 'android' END,
          CASE WHEN p_language = 'en' THEN 'en' ELSE 'ar' END, COALESCE(p_orders, true), COALESCE(p_discover, false))
  ON CONFLICT (token) DO UPDATE SET
    user_id          = v_uid,
    platform         = EXCLUDED.platform,
    language         = EXCLUDED.language,
    orders_enabled   = CASE WHEN public.push_devices.user_id = v_uid THEN COALESCE(p_orders, public.push_devices.orders_enabled) ELSE COALESCE(p_orders, true) END,
    discover_enabled = CASE WHEN public.push_devices.user_id = v_uid THEN COALESCE(p_discover, public.push_devices.discover_enabled) ELSE COALESCE(p_discover, false) END,
    updated_at       = now();
END $$;

CREATE OR REPLACE FUNCTION public.set_push_prefs(p_token text, p_orders boolean DEFAULT NULL, p_discover boolean DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.push_devices
     SET orders_enabled   = COALESCE(p_orders, orders_enabled),
         discover_enabled = COALESCE(p_discover, discover_enabled),
         updated_at       = now()
   WHERE token = p_token AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.unregister_push_device(p_token text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.push_devices WHERE token = p_token AND user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.register_push_device(text, text, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_push_prefs(text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unregister_push_device(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_device(text, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_push_prefs(text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_push_device(text) TO authenticated;

-- ── 3) The customer's in-app list (the app reads this table already: services/notificationService.ts) ────────────────────
CREATE TABLE IF NOT EXISTS public.push_notifications_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL = for everybody
  type       text        NOT NULL DEFAULT 'system',                     -- order | restock | ...
  title      text        NOT NULL,
  body       text        NOT NULL,
  data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text        UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_notifications_log_user_idx ON public.push_notifications_log (user_id, created_at DESC);
ALTER TABLE public.push_notifications_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_notifications_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.push_notifications_log TO authenticated;
DROP POLICY IF EXISTS push_log_read_own ON public.push_notifications_log;
CREATE POLICY push_log_read_own ON public.push_notifications_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

-- ── 4) The queue, and the books a customer was already asked to rate ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_outbox (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       text        NOT NULL CHECK (kind IN ('order', 'review', 'restock', 'daily')),
  channel    text        NOT NULL CHECK (channel IN ('orders', 'discover')),
  dedupe_key text        NOT NULL UNIQUE,
  title_ar   text        NOT NULL,
  body_ar    text        NOT NULL,
  title_en   text,
  body_en    text,
  data       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  send_after timestamptz NOT NULL DEFAULT now(),
  status     text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts   integer     NOT NULL DEFAULT 0,
  last_error text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);
CREATE INDEX IF NOT EXISTS push_outbox_ready_idx ON public.push_outbox (status, send_after);
ALTER TABLE public.push_outbox ENABLE ROW LEVEL SECURITY;   -- no policy: service functions only
REVOKE ALL ON public.push_outbox FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.push_review_prompts (
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);
ALTER TABLE public.push_review_prompts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_review_prompts FROM PUBLIC, anon, authenticated;

-- ── 5) Internals ───────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_enqueue(
  p_user uuid, p_kind text, p_channel text, p_key text,
  p_title_ar text, p_body_ar text, p_title_en text, p_body_en text,
  p_data jsonb DEFAULT '{}'::jsonb, p_send_after timestamptz DEFAULT now()
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.push_outbox (user_id, kind, channel, dedupe_key, title_ar, body_ar, title_en, body_en, data, send_after)
  VALUES (p_user, p_kind, p_channel, p_key, p_title_ar, p_body_ar, p_title_en, p_body_en, COALESCE(p_data, '{}'::jsonb), COALESCE(p_send_after, now()))
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;

-- Wakes the Edge Function when something is ready (the same pg_net + vault pattern as reconcile-paymob-stock-holds).
CREATE OR REPLACE FUNCTION public.push_kick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.push_outbox
     WHERE (status = 'pending' AND send_after <= now())
        OR (status = 'sending' AND claimed_at < now() - interval '10 minutes' AND attempts < 3)
  ) THEN RETURN; END IF;
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'paymob_reconcile_project_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(
    url     := v_url || '/functions/v1/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body    := '{}'::jsonb
  );
END $$;

-- Is the book on sale for this country right now? (a digital edition is always on sale; a paper one needs stock beyond what is reserved)
CREATE OR REPLACE FUNCTION public.push_product_available(p_product uuid, p_country uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p_product AND v.variant_type = 'رقمي')
      OR EXISTS (SELECT 1 FROM public.product_inventory pi
                  WHERE pi.product_id = p_product
                    AND (p_country IS NULL OR pi.country_id = p_country)
                    AND COALESCE(pi.stock, 0) - COALESCE(pi.reserved_stock, 0) > 0);
$$;

-- ── 6) Order status → notification, and «rate your book» two days after the delivery ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_push_order_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_provider text;
  t_ar text; b_ar text; t_en text; b_en text;
BEGIN
  BEGIN
    IF NEW.user_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status NOT IN ('تم التأكيد', 'جاري الشحن', 'تم التوصيل', 'ملغي', 'مرتجع') THEN RETURN NEW; END IF;
    IF NEW.payment_status = 'فاشل' THEN RETURN NEW; END IF;            -- an unpaid card order that expired: nothing to tell
    SELECT pm.provider INTO v_provider FROM public.payment_methods pm WHERE pm.id = NEW.payment_method_id;
    IF v_provider IN ('apple_iap', 'google_iap') THEN RETURN NEW; END IF;   -- store purchases settle at once

    IF NEW.status = 'تم التأكيد' THEN
      t_ar := 'تم تأكيد طلبك ✅';      b_ar := 'تم تأكيد طلبك وهو الآن قيد التجهيز';
      t_en := 'Order confirmed ✅';    b_en := 'Your order is confirmed and is being prepared';
    ELSIF NEW.status = 'جاري الشحن' THEN
      t_ar := 'طلبك في الطريق 🚚';     b_ar := 'تم شحن طلبك وهو في طريقه إليك';
      t_en := 'Your order is on its way 🚚'; b_en := 'Your order has shipped';
    ELSIF NEW.status = 'تم التوصيل' THEN
      t_ar := 'تم تسليم طلبك 🎉';      b_ar := 'تم توصيل طلبك بنجاح. نتمنى لك قراءة ممتعة!';
      t_en := 'Order delivered 🎉';    b_en := 'Your order was delivered. Happy reading!';
    ELSIF NEW.status = 'ملغي' THEN
      t_ar := 'تم إلغاء طلبك';          b_ar := 'تم إلغاء الطلب. لو عندك أي استفسار تواصل معنا';
      t_en := 'Order cancelled';       b_en := 'Your order was cancelled. Contact us if you have any question';
    ELSE
      t_ar := 'تم تسجيل مرتجع لطلبك';  b_ar := 'تم تسجيل المرتجع. تواصل معنا لأي استفسار';
      t_en := 'Return recorded';       b_en := 'Your return was recorded. Contact us if you have any question';
    END IF;

    PERFORM public.push_enqueue(NEW.user_id, 'order', 'orders', 'order:' || NEW.id || ':' || NEW.status,
                                t_ar, b_ar || ' (' || NEW.id || ')', t_en, b_en || ' (' || NEW.id || ')',
                                jsonb_build_object('orderId', NEW.id, 'status', NEW.status));

    IF NEW.status = 'تم التوصيل' THEN
      -- the books are chosen when it is sent (so a book rated meanwhile, or asked about before, is left out)
      PERFORM public.push_enqueue(NEW.user_id, 'review', 'orders', 'review:' || NEW.id,
                                  'قيّم كتابك ⭐', 'شاركنا رأيك فيما قرأت', 'Rate your book ⭐', 'Tell us what you think',
                                  jsonb_build_object('fromOrder', NEW.id), now() + interval '2 days');
    END IF;
    PERFORM public.push_kick();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push order trigger skipped: %', SQLERRM;   -- never let a notification stop an order update
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_push_order_status ON public.orders;
CREATE TRIGGER trg_push_order_status AFTER UPDATE OF status ON public.orders
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_push_order_status();

-- ── 7) A favourite book that was out of stock is available again ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_push_restock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_title text; v_day text := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD');
BEGIN
  BEGIN
    IF COALESCE(OLD.stock, 0) - COALESCE(OLD.reserved_stock, 0) > 0 THEN RETURN NEW; END IF;   -- was on sale already
    IF COALESCE(NEW.stock, 0) - COALESCE(NEW.reserved_stock, 0) <= 0 THEN RETURN NEW; END IF;  -- still not
    -- on sale through another edition (or a digital copy) all along: nothing to announce
    IF EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = NEW.product_id AND v.variant_type = 'رقمي')
       OR EXISTS (SELECT 1 FROM public.product_inventory pi
                   WHERE pi.product_id = NEW.product_id AND pi.country_id IS NOT DISTINCT FROM NEW.country_id
                     AND pi.id <> NEW.id AND COALESCE(pi.stock, 0) - COALESCE(pi.reserved_stock, 0) > 0)
    THEN RETURN NEW; END IF;
    SELECT p.title INTO v_title FROM public.products p WHERE p.id = NEW.product_id AND p.is_active;
    IF v_title IS NULL THEN RETURN NEW; END IF;

    FOR r IN
      SELECT w.user_id FROM public.wishlist w
        JOIN public.profiles pr ON pr.id = w.user_id
       WHERE w.book_id = NEW.product_id
         AND (pr.country_id IS NULL OR NEW.country_id IS NULL OR pr.country_id = NEW.country_id)
    LOOP
      PERFORM public.push_enqueue(r.user_id, 'restock', 'discover',
        'restock:' || NEW.product_id || ':' || v_day || ':' || r.user_id,
        'عاد للتوفّر 📚', '«' || v_title || '» المحفوظ في مفضّلتك متوفر الآن',
        'Back in stock 📚', '"' || v_title || '" from your favourites is available again',
        jsonb_build_object('bookId', NEW.product_id));
    END LOOP;
    PERFORM public.push_kick();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push restock trigger skipped: %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_push_restock ON public.product_inventory;
CREATE TRIGGER trg_push_restock AFTER UPDATE OF stock, reserved_stock ON public.product_inventory
  FOR EACH ROW EXECUTE FUNCTION public.trg_push_restock();

-- ── 8) The daily «what is new» (one per customer who said yes, one per day) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_enqueue_daily() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_count integer; v_latest text; r record; n integer := 0;
  v_day text := to_char(now() AT TIME ZONE 'Africa/Cairo', 'YYYY-MM-DD');
  t_ar text; b_ar text; t_en text; b_en text;
BEGIN
  SELECT count(*), (array_agg(title ORDER BY created_at DESC))[1] INTO v_count, v_latest
    FROM public.products WHERE is_active AND created_at > now() - interval '7 days';
  IF v_count > 0 THEN
    t_ar := 'وصل حديثًا 📚';  b_ar := 'كتب جديدة في دار الفتح، منها «' || v_latest || '». تصفّح الجديد الآن';
    t_en := 'New arrivals 📚'; b_en := 'New books at Dar Al-Fath, including "' || v_latest || '". Browse what is new';
  ELSE
    t_ar := 'اكتشف كتبنا 📚';  b_ar := 'تصفّح إصدارات دار الفتح وابحث عن قراءتك القادمة';
    t_en := 'Discover our books 📚'; b_en := 'Browse Dar Al-Fath books and find your next read';
  END IF;
  FOR r IN SELECT DISTINCT user_id FROM public.push_devices WHERE discover_enabled LOOP
    IF public.push_enqueue(r.user_id, 'daily', 'discover', 'daily:' || v_day || ':' || r.user_id, t_ar, b_ar, t_en, b_en,
                           jsonb_build_object('openNew', true)) THEN n := n + 1; END IF;
  END LOOP;
  PERFORM public.push_kick();
  RETURN n;
END $$;

-- ── 9) For the Edge Function (service role only) ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.push_secret_ok(p_secret text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_secret IS NOT NULL AND length(p_secret) > 20
     AND EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret' AND decrypted_secret = p_secret);
$$;

-- Takes the next rows to send; decides what each says (the books to rate are chosen here); writes the in-app list entry for
-- orders and restocks (the «rate your book» item of that list is made on the phone from the orders); returns what to send where.
CREATE OR REPLACE FUNCTION public.push_claim_batch(p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  o public.push_outbox%ROWTYPE;
  v_items jsonb := '[]'::jsonb; v_devices jsonb; v_books uuid[]; v_title text; v_inbox text; v_country uuid;
  t_ar text; b_ar text; t_en text; b_en text; v_data jsonb;
BEGIN
  FOR o IN
    WITH picked AS (
      SELECT id FROM public.push_outbox
       WHERE (status = 'pending' AND send_after <= now())
          OR (status = 'sending' AND claimed_at < now() - interval '10 minutes' AND attempts < 3)
       ORDER BY id LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200)) FOR UPDATE SKIP LOCKED
    ), upd AS (
      UPDATE public.push_outbox x SET status = 'sending', attempts = x.attempts + 1, claimed_at = now()
        FROM picked WHERE x.id = picked.id RETURNING x.*
    ) SELECT * FROM upd ORDER BY id
  LOOP
    t_ar := o.title_ar; b_ar := o.body_ar; t_en := o.title_en; b_en := o.body_en; v_data := o.data; v_inbox := NULL;

    IF o.kind = 'order' THEN
      v_inbox := 'order';

    ELSIF o.kind = 'review' THEN
      -- still delivered, and only books never asked about and not rated by this customer
      IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = o.data->>'fromOrder' AND status = 'تم التوصيل') THEN
        UPDATE public.push_outbox SET status = 'skipped', last_error = 'order no longer delivered' WHERE id = o.id; CONTINUE;
      END IF;
      SELECT array_agg(DISTINCT oi.product_id) INTO v_books
        FROM public.order_items oi
       WHERE oi.order_id = o.data->>'fromOrder'
         AND NOT EXISTS (SELECT 1 FROM public.product_reviews r WHERE r.user_id = o.user_id AND r.product_id = oi.product_id)
         AND NOT EXISTS (SELECT 1 FROM public.push_review_prompts p WHERE p.user_id = o.user_id AND p.product_id = oi.product_id);
      IF v_books IS NULL THEN
        UPDATE public.push_outbox SET status = 'skipped', last_error = 'nothing left to rate' WHERE id = o.id; CONTINUE;
      END IF;
      INSERT INTO public.push_review_prompts (user_id, product_id) SELECT o.user_id, unnest(v_books) ON CONFLICT DO NOTHING;
      IF array_length(v_books, 1) = 1 THEN
        SELECT title INTO v_title FROM public.products WHERE id = v_books[1];
        t_ar := 'قيّم كتابك ⭐';  b_ar := 'شاركنا رأيك في «' || COALESCE(v_title, 'كتابك') || '»';
        t_en := 'Rate your book ⭐'; b_en := 'Tell us what you think of "' || COALESCE(v_title, 'your book') || '"';
        v_data := jsonb_build_object('reviewBookId', v_books[1]);
      ELSE
        t_ar := 'قيّم مشترياتك ⭐'; b_ar := 'لديك ' || array_length(v_books, 1) || ' كتب بانتظار تقييمك';
        t_en := 'Rate your purchases ⭐'; b_en := 'You have ' || array_length(v_books, 1) || ' books waiting for your rating';
        v_data := jsonb_build_object('openOrders', true);
      END IF;

    ELSIF o.kind = 'restock' THEN
      SELECT country_id INTO v_country FROM public.profiles WHERE id = o.user_id;
      IF NOT public.push_product_available((o.data->>'bookId')::uuid, v_country) THEN
        UPDATE public.push_outbox SET status = 'skipped', last_error = 'sold out again' WHERE id = o.id; CONTINUE;
      END IF;
      v_inbox := 'restock';
    END IF;

    IF v_inbox IS NOT NULL THEN
      INSERT INTO public.push_notifications_log (user_id, type, title, body, data, dedupe_key)
      VALUES (o.user_id, v_inbox, t_ar, b_ar, v_data, o.dedupe_key) ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('token', d.token, 'language', d.language)), '[]'::jsonb) INTO v_devices
      FROM public.push_devices d
     WHERE d.user_id = o.user_id AND CASE WHEN o.channel = 'orders' THEN d.orders_enabled ELSE d.discover_enabled END;
    IF jsonb_array_length(v_devices) = 0 THEN
      UPDATE public.push_outbox SET status = 'skipped', last_error = 'no device wants it' WHERE id = o.id; CONTINUE;
    END IF;

    v_items := v_items || jsonb_build_object('id', o.id, 'kind', o.kind, 'channel', o.channel,
      'title_ar', t_ar, 'body_ar', b_ar, 'title_en', COALESCE(t_en, t_ar), 'body_en', COALESCE(b_en, b_ar),
      'data', v_data, 'devices', v_devices);
  END LOOP;
  RETURN v_items;
END $$;

CREATE OR REPLACE FUNCTION public.push_finish(p_id bigint, p_ok boolean, p_error text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.push_outbox
     SET status     = CASE WHEN p_ok THEN 'sent' WHEN attempts < 3 THEN 'pending' ELSE 'failed' END,
         sent_at    = CASE WHEN p_ok THEN now() ELSE sent_at END,
         last_error = left(p_error, 300),
         send_after = CASE WHEN NOT p_ok AND attempts < 3 THEN now() + interval '5 minutes' ELSE send_after END
   WHERE id = p_id AND status = 'sending';
$$;

CREATE OR REPLACE FUNCTION public.push_drop_token(p_token text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.push_devices WHERE token = p_token;
$$;

REVOKE ALL ON FUNCTION public.push_enqueue(uuid, text, text, text, text, text, text, text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_kick() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_product_available(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_push_order_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_push_restock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_enqueue_daily() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_secret_ok(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_claim_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_finish(bigint, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_drop_token(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_secret_ok(text), public.push_claim_batch(integer),
  public.push_finish(bigint, boolean, text), public.push_drop_token(text) TO service_role;

-- ── 10) The shared secret and the schedule ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret') THEN
    PERFORM vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'push_dispatch_secret',
                                'shared secret between the database and the push-dispatch Edge Function');
  END IF;
END $$;

-- every minute: sends what is ready (the triggers kick it at once; this is the retry and the «two days later» driver)
SELECT cron.schedule('push-drain', '* * * * *', $$ SELECT public.push_kick(); $$);
-- every day 16:00 UTC (18:00 / 19:00 Cairo): the «what is new» reminder, and a clean-up of old queue rows
SELECT cron.schedule('push-daily', '0 16 * * *', $$
  SELECT public.push_enqueue_daily();
  DELETE FROM public.push_outbox WHERE created_at < now() - interval '60 days' AND status IN ('sent', 'skipped', 'failed');
$$);
