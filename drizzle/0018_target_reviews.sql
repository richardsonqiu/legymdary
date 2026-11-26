CREATE TABLE `target_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`period_start` text NOT NULL,
	`cadence` text NOT NULL,
	`current` integer NOT NULL,
	`suggested` integer,
	`suggested_protein` integer,
	`suggested_carbs` integer,
	`suggested_fat` integer,
	`applied` integer,
	`decision` text NOT NULL,
	`trend_kg_week` real,
	`logged_days` integer DEFAULT 0 NOT NULL,
	`avg_intake` integer,
	`avg_burn` integer,
	`decided_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `target_reviews_user_period_unique` ON `target_reviews` (`user_id`,`period_start`);--> statement-breakpoint
ALTER TABLE `goals` ADD `review_cadence` text DEFAULT 'weekly' NOT NULL;