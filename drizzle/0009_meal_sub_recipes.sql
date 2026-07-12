CREATE TABLE `meal_sub_recipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_recipe_id` integer NOT NULL,
	`sub_recipe_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`meal_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sub_recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_sub_recipes_meal_recipe_id_sub_recipe_id_unique` ON `meal_sub_recipes` (`meal_recipe_id`,`sub_recipe_id`);