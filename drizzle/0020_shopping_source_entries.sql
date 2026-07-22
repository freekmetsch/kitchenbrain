CREATE TABLE `recurring_shopping_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`amount` text,
	`unit` text,
	`start_week` text NOT NULL,
	`end_week` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `recurring_shopping_items_active_range_idx` ON `recurring_shopping_items` (`start_week`,`end_week`);--> statement-breakpoint
CREATE TABLE `shopping_week_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start_date` text NOT NULL,
	`source_key` text NOT NULL,
	`source_kind` text NOT NULL,
	`recipe_id` integer,
	`recipe_slug` text,
	`ingredient_id` text,
	`recurring_item_id` integer,
	`legacy_override_id` integer,
	`name` text NOT NULL,
	`amount` text,
	`unit` text,
	`amount_override` text,
	`unit_override` text,
	`component` text,
	`meal_ids` text DEFAULT '[]' NOT NULL,
	`approved_terms` text DEFAULT '[]' NOT NULL,
	`included` integer DEFAULT true NOT NULL,
	`selected_name` text,
	`bought` integer DEFAULT false NOT NULL,
	`needs_review` integer DEFAULT false NOT NULL,
	`retired_at` integer,
	`resolved_at` integer,
	`resolution` text,
	`resolved_source_key` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shopping_week_entries_week_active_idx` ON `shopping_week_entries` (`week_start_date`,`retired_at`);--> statement-breakpoint
CREATE INDEX `shopping_week_entries_recipe_source_idx` ON `shopping_week_entries` (`recipe_id`,`ingredient_id`);--> statement-breakpoint
CREATE INDEX `shopping_week_entries_recurring_idx` ON `shopping_week_entries` (`recurring_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_week_entries_legacy_override_unique` ON `shopping_week_entries` (`legacy_override_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_week_entries_week_start_date_source_key_unique` ON `shopping_week_entries` (`week_start_date`,`source_key`);--> statement-breakpoint
ALTER TABLE `shopping_push_history` ADD `attempt_status` text DEFAULT 'succeeded' NOT NULL;--> statement-breakpoint
ALTER TABLE `shopping_push_history` ADD `attempt_error` text;--> statement-breakpoint
ALTER TABLE `shopping_push_history` ADD `completed_at` integer;--> statement-breakpoint
CREATE TABLE `_0020_ingredient_id_guard` (`ok` integer NOT NULL CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `_0020_ingredient_id_guard` (`ok`)
WITH existing_ids AS (
	SELECT
		`recipes`.`id` AS `recipe_id`,
		json_type(`value`, '$.id') AS `ingredient_type`,
		json_extract(`value`, '$.id') AS `ingredient_id`
	FROM `recipes`, json_each(`recipes`.`ingredients`)
	WHERE json_type(`value`, '$.id') IS NOT NULL
)
SELECT CASE WHEN EXISTS (
	SELECT 1 FROM existing_ids
	WHERE `ingredient_type` <> 'text' OR length(trim(`ingredient_id`)) = 0
	UNION ALL
	SELECT 1 FROM existing_ids
	GROUP BY `recipe_id`, `ingredient_id`
	HAVING count(*) > 1
) THEN 0 ELSE 1 END;--> statement-breakpoint
DROP TABLE `_0020_ingredient_id_guard`;--> statement-breakpoint
UPDATE `recipes`
SET `ingredients` = (
	SELECT json_group_array(
		json(
			CASE
				WHEN json_type(`value`, '$.id') = 'text' THEN `value`
				ELSE json_set(`value`, '$.id', printf('ing_migrated_%d_%d', `recipes`.`id`, `json_each`.`key`))
			END
		)
	)
	FROM json_each(`recipes`.`ingredients`)
)
WHERE EXISTS (
	SELECT 1 FROM json_each(`recipes`.`ingredients`)
	WHERE json_type(`value`, '$.id') IS NULL
);--> statement-breakpoint
UPDATE `recipes`
SET `structure_draft` = (
	SELECT json_group_array(
		json(
			CASE
				WHEN json_type(`value`, '$.id') = 'text' THEN `value`
				ELSE json_set(`value`, '$.id', printf('ing_draft_%d_%d', `recipes`.`id`, `json_each`.`key`))
			END
		)
	)
	FROM json_each(`recipes`.`structure_draft`)
)
WHERE `structure_draft` IS NOT NULL
	AND EXISTS (
		SELECT 1 FROM json_each(`recipes`.`structure_draft`)
		WHERE json_type(`value`, '$.id') IS NULL
	);--> statement-breakpoint
CREATE TABLE `_0020_ingredient_id_guard` (`ok` integer NOT NULL CHECK (`ok` = 1));--> statement-breakpoint
INSERT INTO `_0020_ingredient_id_guard` (`ok`)
WITH migrated_ids AS (
	SELECT
		`recipes`.`id` AS `recipe_id`,
		json_type(`value`, '$.id') AS `ingredient_type`,
		json_extract(`value`, '$.id') AS `ingredient_id`
	FROM `recipes`, json_each(`recipes`.`ingredients`)
)
SELECT CASE WHEN EXISTS (
	SELECT 1 FROM migrated_ids
	WHERE `ingredient_type` IS NULL OR `ingredient_type` <> 'text' OR length(trim(`ingredient_id`)) = 0
	UNION ALL
	SELECT 1 FROM migrated_ids
	GROUP BY `recipe_id`, `ingredient_id`
	HAVING count(*) > 1
) THEN 0 ELSE 1 END;--> statement-breakpoint
DROP TABLE `_0020_ingredient_id_guard`;--> statement-breakpoint
CREATE TRIGGER `recurring_shopping_items_no_overlap_insert`
BEFORE INSERT ON `recurring_shopping_items`
WHEN EXISTS (
	SELECT 1 FROM `recurring_shopping_items` existing
	WHERE lower(trim(existing.`name`)) = lower(trim(NEW.`name`))
		AND existing.`start_week` <= coalesce(NEW.`end_week`, '9999-12-31')
		AND NEW.`start_week` <= coalesce(existing.`end_week`, '9999-12-31')
)
BEGIN
	SELECT RAISE(ABORT, 'Recurring shopping item ranges overlap');
END;--> statement-breakpoint
CREATE TRIGGER `recurring_shopping_items_no_overlap_update`
BEFORE UPDATE OF `name`, `start_week`, `end_week` ON `recurring_shopping_items`
WHEN EXISTS (
	SELECT 1 FROM `recurring_shopping_items` existing
	WHERE existing.`id` <> OLD.`id`
		AND lower(trim(existing.`name`)) = lower(trim(NEW.`name`))
		AND existing.`start_week` <= coalesce(NEW.`end_week`, '9999-12-31')
		AND NEW.`start_week` <= coalesce(existing.`end_week`, '9999-12-31')
)
BEGIN
	SELECT RAISE(ABORT, 'Recurring shopping item ranges overlap');
END;--> statement-breakpoint
CREATE TRIGGER `shopping_week_entries_resolution_once`
BEFORE UPDATE OF `resolved_at`, `resolution`, `resolved_source_key` ON `shopping_week_entries`
WHEN OLD.`resolved_at` IS NOT NULL
	AND (
		NEW.`resolved_at` IS NOT OLD.`resolved_at`
		OR NEW.`resolution` IS NOT OLD.`resolution`
		OR NEW.`resolved_source_key` IS NOT OLD.`resolved_source_key`
	)
BEGIN
	SELECT RAISE(ABORT, 'Legacy shopping resolution is immutable');
END;
