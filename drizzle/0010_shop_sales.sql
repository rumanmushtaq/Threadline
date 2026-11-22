CREATE SEQUENCE "public"."shop_sale_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "shop_sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_number" varchar(20) DEFAULT next_code('SAL-', 'shop_sale_number_seq') NOT NULL,
	"product_id" uuid NOT NULL,
	"product_size_id" uuid NOT NULL,
	"size" "size" NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"unit_cost_minor" integer NOT NULL,
	"sold_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" varchar(200),
	"recorded_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_sales_sale_number_unique" UNIQUE("sale_number"),
	CONSTRAINT "shop_sales_quantity_positive" CHECK ("shop_sales"."quantity" > 0),
	CONSTRAINT "shop_sales_amounts_nonneg" CHECK ("shop_sales"."unit_price_minor" >= 0 AND "shop_sales"."unit_cost_minor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_product_size_id_product_sizes_id_fk" FOREIGN KEY ("product_size_id") REFERENCES "public"."product_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_sales" ADD CONSTRAINT "shop_sales_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shop_sales_sold_at_idx" ON "shop_sales" USING btree ("sold_at");--> statement-breakpoint
CREATE INDEX "shop_sales_product_idx" ON "shop_sales" USING btree ("product_id");--> statement-breakpoint
-- Hidden from Supabase's Data API like every other table.
ALTER TABLE "shop_sales" ENABLE ROW LEVEL SECURITY;
