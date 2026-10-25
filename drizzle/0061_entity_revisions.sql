ALTER TABLE "recipes" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "brews" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "client_operations_recipe_id_idx" ON "client_operations" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "client_operations_created_at_idx" ON "client_operations" USING btree ("created_at");
