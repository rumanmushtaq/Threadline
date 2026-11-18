CREATE TABLE "customer_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"email" varchar(254) NOT NULL,
	"phone" varchar(20),
	"whatsapp" varchar(20),
	"address" varchar(300),
	"city" varchar(60),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_account_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_account_id_customer_accounts_id_fk" FOREIGN KEY ("customer_account_id") REFERENCES "public"."customer_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_customer_account_idx" ON "orders" USING btree ("customer_account_id","created_at");--> statement-breakpoint
-- Hidden from Supabase's Data API like every other table.
ALTER TABLE "customer_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- A shopper's account row lives and dies with their Supabase user (their orders stay, unlinked).
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    ALTER TABLE customer_accounts ADD CONSTRAINT customer_accounts_auth_user_fk FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;
  END IF;
END
$$;
