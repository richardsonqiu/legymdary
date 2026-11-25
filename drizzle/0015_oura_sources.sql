CREATE TABLE `oura_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`access_token_enc` text NOT NULL,
	`refresh_token_enc` text NOT NULL,
	`expires_at` integer NOT NULL,
	`scopes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_error` text,
	`last_sync_at` integer,
	`backfilled_from` text,
	`connected_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `source_daily` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`source` text NOT NULL,
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
CREATE UNIQUE INDEX `source_daily_user_date_source_unique` ON `source_daily` (`user_id`,`date`,`source`);--> statement-breakpoint
CREATE TABLE `source_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`sleep` text DEFAULT 'auto' NOT NULL,
	`recovery` text DEFAULT 'auto' NOT NULL,
	`activity` text DEFAULT 'auto' NOT NULL,
	`workouts` text DEFAULT 'auto' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `garmin_activities` ADD `excluded` integer DEFAULT false NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `source_daily` (`user_id`, `date`, `source`, `total_kcal`, `active_kcal`, `bmr_kcal`, `consumed_kcal`, `steps`, `intensity_minutes`, `resting_hr`, `stress_avg`, `body_battery_high`, `body_battery_low`, `body_battery_charged`, `body_battery_drained`, `sleep_seconds`, `sleep_score`, `hrv_last_night`, `hrv_weekly_avg`, `hrv_status`, `updated_at`) SELECT `user_id`, `date`, `source`, `total_kcal`, `active_kcal`, `bmr_kcal`, `consumed_kcal`, `steps`, `intensity_minutes`, `resting_hr`, `stress_avg`, `body_battery_high`, `body_battery_low`, `body_battery_charged`, `body_battery_drained`, `sleep_seconds`, `sleep_score`, `hrv_last_night`, `hrv_weekly_avg`, `hrv_status`, `updated_at` FROM `garmin_daily`;
