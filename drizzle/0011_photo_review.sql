CREATE TYPE "public"."image_review" AS ENUM('pending', 'approved', 'hidden');--> statement-breakpoint
ALTER TYPE "public"."image_kind" ADD VALUE 'photo';--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "review" "image_review" DEFAULT 'approved' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "uploaded_by" uuid;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;