-- Supabase exposes the public schema through its Data API. Turn on row level security
-- with no policies so the anon/authenticated API roles can read or write nothing.
-- The app connects as the table owner, which bypasses RLS.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'sessions', 'login_attempts', 'rate_limit_events', 'categories', 'products',
    'product_sizes', 'ai_generation_jobs', 'product_images', 'public_product_links',
    'customers', 'orders', 'order_items', 'stock_reservations', 'inventory_transactions',
    'activity_logs', 'notifications', 'settings'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated';
  END IF;
END
$$;
