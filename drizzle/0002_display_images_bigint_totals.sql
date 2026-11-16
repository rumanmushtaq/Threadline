ALTER TABLE "orders" ALTER COLUMN "total_minor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "display_key" varchar(300);