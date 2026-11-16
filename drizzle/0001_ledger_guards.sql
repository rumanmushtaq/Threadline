-- History tables are append-only: no UPDATE or DELETE, ever.
CREATE FUNCTION forbid_history_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable history and cannot be % ', TG_TABLE_NAME, lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END
$$;--> statement-breakpoint
CREATE TRIGGER inventory_transactions_immutable
  BEFORE UPDATE OR DELETE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();--> statement-breakpoint
CREATE TRIGGER inventory_transactions_no_truncate
  BEFORE TRUNCATE ON inventory_transactions
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();--> statement-breakpoint
CREATE TRIGGER activity_logs_immutable
  BEFORE UPDATE OR DELETE ON activity_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_history_change();--> statement-breakpoint
CREATE TRIGGER activity_logs_no_truncate
  BEFORE TRUNCATE ON activity_logs
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_history_change();--> statement-breakpoint
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO categories (name, slug) VALUES
  ('T-Shirts', 't-shirts'), ('Shirts', 'shirts'), ('Polo Shirts', 'polo-shirts'),
  ('Hoodies & Sweatshirts', 'hoodies'), ('Jackets', 'jackets'), ('Jeans', 'jeans'),
  ('Trousers', 'trousers'), ('Shorts', 'shorts'), ('Dresses', 'dresses'),
  ('Shalwar Kameez', 'shalwar-kameez'), ('Kurtas', 'kurtas'), ('Tracksuits', 'tracksuits'),
  ('Other', 'other')
ON CONFLICT DO NOTHING;
