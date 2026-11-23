ALTER TABLE "product_images" ADD COLUMN "has_logo" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "photo_logo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "photo_logo_corner" varchar(12) DEFAULT 'bottom-right' NOT NULL;