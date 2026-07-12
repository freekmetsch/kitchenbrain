CREATE TABLE `shopping_push_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start_date` text NOT NULL,
	`user_id` integer,
	`destination` text NOT NULL,
	`account_name` text,
	`products_pushed` integer DEFAULT 0 NOT NULL,
	`freetext_pushed` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shopping_push_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`push_id` integer NOT NULL,
	`source_ref` text NOT NULL,
	`source_name` text NOT NULL,
	`amount` text,
	`unit` text,
	`mode` text NOT NULL,
	`ah_product_id` text,
	`ah_product_name` text,
	`quantity` integer,
	`destination` text NOT NULL,
	`status` text NOT NULL,
	`failure_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`push_id`) REFERENCES `shopping_push_history`(`id`) ON UPDATE no action ON DELETE cascade
);
