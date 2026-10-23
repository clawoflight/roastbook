CREATE TABLE "client_operations" (
	"operation_id" text PRIMARY KEY NOT NULL,
	"brew_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_operations" ADD CONSTRAINT "client_operations_brew_id_brews_id_fk" FOREIGN KEY ("brew_id") REFERENCES "public"."brews"("id") ON DELETE set null ON UPDATE no action;