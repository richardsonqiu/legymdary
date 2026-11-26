ALTER TABLE `goals` ADD `training_days` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_sets` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_reps` text;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_weight` real;--> statement-breakpoint
ALTER TABLE `workouts` ADD `garmin_activity_id` text;--> statement-breakpoint
ALTER TABLE `workouts` ADD `plan_key` text;