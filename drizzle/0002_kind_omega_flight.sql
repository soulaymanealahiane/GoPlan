CREATE TABLE `student_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`consent_version` text NOT NULL,
	`active_workspace_id` text
);
--> statement-breakpoint
CREATE INDEX `students_last_seen_idx` ON `student_profiles` (`last_seen_at`);--> statement-breakpoint
CREATE TABLE `student_workspaces` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`title` text NOT NULL,
	`phase` text NOT NULL,
	`state` text NOT NULL,
	`revision` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `student_workspaces_updated_idx` ON `student_workspaces` (`user_id`,`updated_at`);