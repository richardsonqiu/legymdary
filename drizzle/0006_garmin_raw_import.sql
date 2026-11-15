CREATE TABLE `garmin_datasets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`dataset` text NOT NULL,
	`status` text DEFAULT 'ok' NOT NULL,
	`last_error` text,
	`backfilled_to` text,
	`latest_date` text,
	`empty_streak` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_datasets_user_dataset_unique` ON `garmin_datasets` (`user_id`,`dataset`);--> statement-breakpoint
CREATE TABLE `garmin_raw` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`dataset` text NOT NULL,
	`key` text NOT NULL,
	`date` text,
	`payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garmin_raw_user_dataset_key_unique` ON `garmin_raw` (`user_id`,`dataset`,`key`);--> statement-breakpoint
CREATE INDEX `garmin_raw_user_date_idx` ON `garmin_raw` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `garmin_connections` ADD `history_days` integer DEFAULT 90 NOT NULL;