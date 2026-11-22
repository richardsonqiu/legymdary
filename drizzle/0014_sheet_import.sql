CREATE TABLE `sheet_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`file_name` text NOT NULL,
	`workouts` integer DEFAULT 0 NOT NULL,
	`sets` integer DEFAULT 0 NOT NULL,
	`activities` integer DEFAULT 0 NOT NULL,
	`activity_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sheet_imports_user_idx` ON `sheet_imports` (`user_id`);--> statement-breakpoint
ALTER TABLE `workouts` ADD `import_id` integer;