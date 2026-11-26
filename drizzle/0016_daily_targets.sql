CREATE TABLE `daily_targets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`calories` integer NOT NULL,
	`protein` integer,
	`carbs` integer,
	`fat` integer,
	`bonus` integer DEFAULT 0 NOT NULL,
	`maintenance` integer,
	`maintenance_source` text,
	`weight` real,
	`weekly_rate` real,
	`goal_key` text,
	`backfilled` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_targets_user_date_unique` ON `daily_targets` (`user_id`,`date`);