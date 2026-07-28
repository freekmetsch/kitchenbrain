CREATE TABLE `recipe_ah_preferences` (
	`recipe_id` integer NOT NULL,
	`ingredient_id` text NOT NULL,
	`ah_product_id` text NOT NULL,
	`ah_product_name` text NOT NULL,
	`variant_label` text NOT NULL,
	`selected_at` integer NOT NULL,
	PRIMARY KEY(`recipe_id`, `ingredient_id`),
	FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON UPDATE no action ON DELETE cascade
);
