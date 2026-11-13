CREATE TABLE `goals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`sex` text,
	`birth_year` integer,
	`height_cm` real,
	`activity_level` text,
	`target_weight` real,
	`target_body_fat` real,
	`weekly_rate` real,
	`calorie_override` real,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`meal_type` text DEFAULT 'snack' NOT NULL,
	`name` text NOT NULL,
	`calories` real DEFAULT 0 NOT NULL,
	`protein` real DEFAULT 0 NOT NULL,
	`carbs` real DEFAULT 0 NOT NULL,
	`fat` real DEFAULT 0 NOT NULL,
	`items` text,
	`notes` text,
	`photo` text,
	`ai_estimated` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `meals_user_date_idx` ON `meals` (`user_id`,`date`);