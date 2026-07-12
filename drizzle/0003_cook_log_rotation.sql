CREATE TABLE `cook_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recipe_id` integer,
	`recipe_slug` text,
	`cooked_at` integer NOT NULL,
	`cooked_date` text NOT NULL,
	`source` text NOT NULL,
	`meal_plan_meal_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`meal_plan_meal_id`) REFERENCES `meal_plan_meals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `recipes` ADD `last_cooked_at` integer;--> statement-breakpoint
ALTER TABLE `recipes` ADD `cooked_count` integer DEFAULT 0 NOT NULL;