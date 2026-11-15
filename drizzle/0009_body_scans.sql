CREATE TABLE `body_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`date` text NOT NULL,
	`time` text,
	`device` text DEFAULT 'InBody' NOT NULL,
	`score` real,
	`weight` real,
	`skeletal_muscle` real,
	`fat_mass` real,
	`body_fat_pct` real,
	`bmi` real,
	`visceral_fat` real,
	`waist_hip` real,
	`total_body_water` real,
	`protein` real,
	`mineral` real,
	`bmr` real,
	`smi` real,
	`segmental_lean` text,
	`segmental_fat` text,
	`body_type` text,
	`balance` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_scans_user_date_unique` ON `body_scans` (`user_id`,`date`);