CREATE TABLE `butler_candidate_states` (
	`user_id` integer NOT NULL,
	`candidate_key` text NOT NULL,
	`disposition` text NOT NULL,
	`snoozed_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `candidate_key`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `butler_candidate_states_user_disposition_idx` ON `butler_candidate_states` (`user_id`,`disposition`,`snoozed_until`);--> statement-breakpoint
CREATE TABLE `butler_initiative_preferences` (
	`user_id` integer NOT NULL,
	`domain` text NOT NULL,
	`level` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `domain`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `butler_user_states` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`changes_seen_through` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
