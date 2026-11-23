CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank', 'jazzcash', 'easypaisa', 'card', 'other');--> statement-breakpoint
CREATE SEQUENCE "public"."expense_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(40) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_number" varchar(20) DEFAULT next_code('EXP-', 'expense_number_seq') NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"spent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_to" varchar(80),
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"note" varchar(200),
	"recorded_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_expense_number_unique" UNIQUE("expense_number"),
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_spent_at_idx" ON "expenses" USING btree ("spent_at");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category_id");--> statement-breakpoint
-- Hidden from Supabase's Data API like every other table.
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "expense_categories" ("name") VALUES
  ('Fuel'), ('Delivery & courier'), ('Packaging'), ('Rent'), ('Electricity & gas'), ('Mobile & internet'),
  ('Marketing & ads'), ('Salaries & wages'), ('Repairs & maintenance'), ('Bank & payment fees'), ('Food & tea'), ('Other')
ON CONFLICT ("name") DO NOTHING;
