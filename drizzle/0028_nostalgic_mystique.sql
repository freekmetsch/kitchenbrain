CREATE TABLE `shopping_week_exclusions` (
	`week_start_date` text NOT NULL,
	`name_key` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`week_start_date`, `name_key`)
);
