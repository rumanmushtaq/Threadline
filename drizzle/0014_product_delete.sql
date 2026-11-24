-- One narrow exception to "stock history is immutable": deleting a product that never sold
-- (no orders, no shop sales) removes its own stock entries. The app sets
-- threadline.purge_product to that product's id with SET LOCAL, so it lasts only for that
-- transaction and covers only that product. Everything else still cannot be changed.
CREATE OR REPLACE FUNCTION forbid_history_change() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME = 'inventory_transactions'
     AND OLD.product_id::text = current_setting('threadline.purge_product', true) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% rows are immutable history and cannot be % ', TG_TABLE_NAME, lower(TG_OP)
    USING ERRCODE = 'restrict_violation';
END
$$;
