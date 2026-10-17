CREATE TABLE "recipe_drink_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"option_value_id" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipe_drink_options" ADD CONSTRAINT "recipe_drink_options_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_drink_options" ADD CONSTRAINT "recipe_drink_options_option_value_id_drink_option_values_id_fk" FOREIGN KEY ("option_value_id") REFERENCES "public"."drink_option_values"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_drink_options_recipe_value_idx" ON "recipe_drink_options" USING btree ("recipe_id","option_value_id");--> statement-breakpoint
CREATE INDEX "recipe_drink_options_value_id_idx" ON "recipe_drink_options" USING btree ("option_value_id");