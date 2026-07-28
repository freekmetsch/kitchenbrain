ALTER TABLE `timer_alert_jobs` ADD `kind` text DEFAULT 'timer' NOT NULL;--> statement-breakpoint
ALTER TABLE `timer_alert_jobs` ADD `worker_received_at` integer;--> statement-breakpoint
ALTER TABLE `timer_alert_jobs` ADD `notification_shown_at` integer;--> statement-breakpoint
ALTER TABLE `timer_alert_jobs` ADD `display_failed_at` integer;--> statement-breakpoint
ALTER TABLE `timer_alert_jobs` ADD `display_error` text;--> statement-breakpoint
ALTER TABLE `timer_alert_jobs` ADD `clicked_at` integer;