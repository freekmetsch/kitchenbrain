ALTER TABLE `recipes` ADD `direction_ids_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `source_snapshot_json` text;--> statement-breakpoint
UPDATE `recipes`
SET `direction_ids_json` = (
	SELECT coalesce(
		json_group_array(printf('dir_migrated_%d_%d', `recipes`.`id`, json_each.`key`)),
		json('[]')
	)
	FROM json_each(`recipes`.`directions`)
);--> statement-breakpoint
UPDATE `recipes`
SET `source_snapshot_json` = json_object(
	'version', 1,
	'provenance', 'legacy_baseline',
	'capturedAt', `updated_at`,
	'title', `title`,
	'servings', `servings`,
	'sourceUrl', `source_url`,
	'ingredients', json(`ingredients`),
	'directions', json(`directions`)
);--> statement-breakpoint
CREATE TRIGGER `recipes_source_snapshot_immutable`
BEFORE UPDATE OF `source_snapshot_json` ON `recipes`
WHEN OLD.`source_snapshot_json` IS NOT NULL
	AND NEW.`source_snapshot_json` IS NOT OLD.`source_snapshot_json`
BEGIN
	SELECT RAISE(ABORT, 'Recipe source snapshot is immutable');
END;
