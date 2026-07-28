CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`device_label` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_id_user_unique` ON `push_subscriptions` (`id`,`user_id`);--> statement-breakpoint
CREATE TABLE `timer_alert_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`subscription_id` text NOT NULL,
	`deadline` integer NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`navigate` text NOT NULL,
	`state` text DEFAULT 'scheduled' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer NOT NULL,
	`claimed_at` integer,
	`sent_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`,`user_id`) REFERENCES `push_subscriptions`(`id`,`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `timer_alert_jobs_due_idx` ON `timer_alert_jobs` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE INDEX `timer_alert_jobs_user_idx` ON `timer_alert_jobs` (`user_id`);