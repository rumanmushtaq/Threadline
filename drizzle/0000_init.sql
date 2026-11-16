CREATE TYPE "public"."audience" AS ENUM('kids', 'youth', 'adult');--> statement-breakpoint
CREATE TYPE "public"."image_kind" AS ENUM('original', 'ai_model', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."inventory_txn_type" AS ENUM('initial', 'stock_in', 'adjustment', 'stock_out', 'reserve', 'release', 'sale');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'processing', 'dispatched', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."reservation_policy" AS ENUM('on_order', 'on_confirm');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'released', 'consumed');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."size" AS ENUM('XS', 'S', 'M', 'L', 'XL');--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."product_sku_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
-- Formats sequence numbers as PREFIX-000001; grows past 6 digits instead of truncating.
CREATE FUNCTION next_code(prefix text, seq regclass) RETURNS text
  LANGUAGE sql VOLATILE AS $$
  SELECT prefix || lpad(v::text, greatest(6, length(v::text)), '0') FROM nextval(seq) AS v
$$;--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "activity_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid,
	"action" varchar(60) NOT NULL,
	"entity_type" varchar(40),
	"entity_id" varchar(60),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"provider" varchar(30),
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(60) NOT NULL,
	"slug" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"name" varchar(80) NOT NULL,
	"whatsapp" varchar(20),
	"address" varchar(300) NOT NULL,
	"city" varchar(60) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inventory_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"product_id" uuid NOT NULL,
	"product_size_id" uuid NOT NULL,
	"type" "inventory_txn_type" NOT NULL,
	"on_hand_delta" integer DEFAULT 0 NOT NULL,
	"reserved_delta" integer DEFAULT 0 NOT NULL,
	"sold_delta" integer DEFAULT 0 NOT NULL,
	"on_hand_after" integer NOT NULL,
	"reserved_after" integer NOT NULL,
	"reason" varchar(300),
	"order_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "login_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" varchar(254) NOT NULL,
	"ip" varchar(64) NOT NULL,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(120) NOT NULL,
	"body" varchar(300),
	"href" varchar(200),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_size_id" uuid NOT NULL,
	"product_name" varchar(120) NOT NULL,
	"sku" varchar(20) NOT NULL,
	"size" "size" NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"unit_cost_minor" integer NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(20) DEFAULT next_code('ORD-', 'order_number_seq') NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"customer_name" varchar(80) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"whatsapp" varchar(20),
	"address" varchar(300) NOT NULL,
	"city" varchar(60) NOT NULL,
	"notes" varchar(500),
	"total_minor" integer NOT NULL,
	"stock_reserved" boolean DEFAULT false NOT NULL,
	"cancel_reason" varchar(200),
	"confirmed_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" "image_kind" NOT NULL,
	"storage_key" varchar(300) NOT NULL,
	"thumb_key" varchar(300),
	"content_type" varchar(40) NOT NULL,
	"width" integer,
	"height" integer,
	"job_id" uuid,
	"variant" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_sizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"size" "size" NOT NULL,
	"on_hand" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_sizes_product_size_unique" UNIQUE("product_id","size"),
	CONSTRAINT "product_sizes_on_hand_nonneg" CHECK ("product_sizes"."on_hand" >= 0),
	CONSTRAINT "product_sizes_reserved_nonneg" CHECK ("product_sizes"."reserved" >= 0),
	CONSTRAINT "product_sizes_reserved_le_on_hand" CHECK ("product_sizes"."reserved" <= "product_sizes"."on_hand"),
	CONSTRAINT "product_sizes_sold_nonneg" CHECK ("product_sizes"."sold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(20) DEFAULT next_code('CLO-', 'product_sku_seq') NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"audience" "audience" NOT NULL,
	"category_id" uuid,
	"purchase_price_minor" integer NOT NULL,
	"selling_price_minor" integer NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_prices_positive" CHECK ("products"."purchase_price_minor" >= 0 AND "products"."selling_price_minor" > 0),
	CONSTRAINT "products_description_len" CHECK (char_length("products"."description") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "public_product_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"slug" varchar(40) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_product_links_product_id_unique" UNIQUE("product_id"),
	CONSTRAINT "public_product_links_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_limit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"key" varchar(200) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"brand_name" varchar(60) DEFAULT 'Threadline' NOT NULL,
	"brand_tagline" varchar(120),
	"currency_code" varchar(3) DEFAULT 'PKR' NOT NULL,
	"currency_symbol" varchar(6) DEFAULT 'Rs.' NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"reservation_policy" "reservation_policy" DEFAULT 'on_order' NOT NULL,
	"pending_order_expiry_hours" integer DEFAULT 72 NOT NULL,
	"auto_publish_products" boolean DEFAULT true NOT NULL,
	"max_order_quantity" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"product_size_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_reservations_quantity_positive" CHECK ("stock_reservations"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slot" smallint NOT NULL,
	"role" "role" NOT NULL,
	"name" varchar(80) NOT NULL,
	"email" varchar(254) NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_slot_unique" UNIQUE("slot"),
	CONSTRAINT "users_slot_range" CHECK ("users"."slot" BETWEEN 1 AND 4),
	CONSTRAINT "users_admin_slot" CHECK (("users"."role" = 'admin') = ("users"."slot" = 1))
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_generation_jobs" ADD CONSTRAINT "ai_generation_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_size_id_product_sizes_id_fk" FOREIGN KEY ("product_size_id") REFERENCES "public"."product_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_size_id_product_sizes_id_fk" FOREIGN KEY ("product_size_id") REFERENCES "public"."product_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_job_id_ai_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_generation_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sizes" ADD CONSTRAINT "product_sizes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_product_links" ADD CONSTRAINT "public_product_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_product_size_id_product_sizes_id_fk" FOREIGN KEY ("product_size_id") REFERENCES "public"."product_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_created_idx" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_user_idx" ON "activity_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_entity_idx" ON "activity_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_jobs_one_active_per_product" ON "ai_generation_jobs" USING btree ("product_id") WHERE "ai_generation_jobs"."status" IN ('pending', 'processing');--> statement-breakpoint
CREATE INDEX "ai_jobs_claim_idx" ON "ai_generation_jobs" USING btree ("status","run_after");--> statement-breakpoint
CREATE INDEX "ai_jobs_product_idx" ON "ai_generation_jobs" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_txn_product_idx" ON "inventory_transactions" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "inventory_txn_created_idx" ON "inventory_transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_lookup_idx" ON "login_attempts" USING btree ("email","ip","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "products_status_created_idx" ON "products" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "products_audience_idx" ON "products" USING btree ("audience");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "rate_limit_events_key_idx" ON "rate_limit_events" USING btree ("key","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_reservations_item_idx" ON "stock_reservations" USING btree ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));