CREATE TABLE `shopping_list_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start_date` text NOT NULL,
	`name` text NOT NULL,
	`bought` integer DEFAULT false NOT NULL,
	`manual` integer DEFAULT false NOT NULL,
	`amount` text,
	`unit` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shopping_list_overrides_week_start_date_name_unique` ON `shopping_list_overrides` (`week_start_date`,`name`);