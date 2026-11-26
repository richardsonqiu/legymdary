ALTER TABLE `goals` ADD `target_mode` text DEFAULT 'steady' NOT NULL;--> statement-breakpoint
ALTER TABLE `goals` ADD `relocked_at` integer;