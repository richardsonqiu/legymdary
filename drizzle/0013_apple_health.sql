CREATE TABLE `apple_health_imports` (
	`user_id` text PRIMARY KEY NOT NULL,
	`first_date` text,
	`last_date` text,
	`days` integer DEFAULT 0 NOT NULL,
	`nights` integer DEFAULT 0 NOT NULL,
	`workouts` integer DEFAULT 0 NOT NULL,
	`weigh_ins` integer DEFAULT 0 NOT NULL,
	`imported_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `garmin_daily` ADD `source` text DEFAULT 'garmin' NOT NULL;