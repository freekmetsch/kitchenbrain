ALTER TABLE `inventory_items` ADD `kind` text;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `food_class` text;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `made_from_recipe_id` integer REFERENCES recipes(id);--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `recipe_status` text;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `recipe_status_at` integer;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `needs_review` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `review_reason` text;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD `is_staple` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_ops_log` ADD `actor` text;--> statement-breakpoint
ALTER TABLE `inventory_ops_log` ADD `item_id` integer REFERENCES inventory_items(id);--> statement-breakpoint
ALTER TABLE `inventory_ops_log` ADD `before_snapshot` text;--> statement-breakpoint
ALTER TABLE `inventory_ops_log` ADD `after_snapshot` text;--> statement-breakpoint
ALTER TABLE `inventory_ops_log` ADD `undo_of` integer REFERENCES inventory_ops_log(id);--> statement-breakpoint
ALTER TABLE `recipes` ADD `is_freezer_staple` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `target_portions` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `needs_review` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `review_reason` text;