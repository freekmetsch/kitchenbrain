ALTER TABLE `meal_plan_meals` ADD `servings` integer;--> statement-breakpoint
UPDATE `meal_plan_meals`
SET `servings` = (
	SELECT `recipes`.`servings`
	FROM `recipes`
	WHERE `recipes`.`slug` = `meal_plan_meals`.`recipe_slug`
)
WHERE `recipe_slug` IS NOT NULL
	AND `servings` IS NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `scaling_mode` text DEFAULT 'scalable' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `structure_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_list_overrides` ADD `included` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_list_overrides` ADD `selected_name` text;
