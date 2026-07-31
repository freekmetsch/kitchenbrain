ALTER TABLE `recipes` ADD `rotation_policy` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `rotation_seasons_json` text DEFAULT '[]' NOT NULL;