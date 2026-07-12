ALTER TABLE `recipes` ADD `title_en` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `category_en` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `cuisine_en` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `notes_en` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `ingredients_en` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `directions_en` text;--> statement-breakpoint
ALTER TABLE `recipes` ADD `translation_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `recipes` ADD `translated_at` integer;