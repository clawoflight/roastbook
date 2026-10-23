ALTER TABLE "brews" ADD COLUMN "client_operation_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "brews_client_operation_id_unique" ON "brews" USING btree ("client_operation_id");