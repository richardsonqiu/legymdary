CREATE TABLE `garmin_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`date` text NOT NULL,
	`start_time_local` text,
	`name` text NOT NULL,
	`type` text,
	`duration_sec` real,
	`calories` real,
	`avg_hr` real,
	`distance_m` real,
	`training_load` real,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_activities_user_activity_unique` ON `garmin_activities` (`user_id`,`activity_id`);--> statement-breakpoint
CREATE INDEX `garmin_activities_user_date_idx` ON `garmin_activities` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `garmin_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`api_key_enc` text NOT NULL,
	`key_hint` text NOT NULL,
	`token_enc` text,
	`token_expires_at` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_error` text,
	`last_sync_at` integer,
	`adjust_for_activity` integer DEFAULT false NOT NULL,
	`connected_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `garmin_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`total_kcal` real,
	`active_kcal` real,
	`bmr_kcal` real,
	`consumed_kcal` real,
	`steps` integer,
	`intensity_minutes` integer,
	`resting_hr` integer,
	`stress_avg` integer,
	`body_battery_high` integer,
	`body_battery_low` integer,
	`body_battery_charged` integer,
	`body_battery_drained` integer,
	`sleep_seconds` integer,
	`sleep_score` integer,
	`hrv_last_night` integer,
	`hrv_weekly_avg` integer,
	`hrv_status` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_daily_user_date_unique` ON `garmin_daily` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `body_stats` ADD `source` text DEFAULT 'manual' NOT NULL;