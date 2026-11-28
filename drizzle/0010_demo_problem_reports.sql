CREATE TABLE `demo_problem_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_problem_request_idx` ON `demo_problem_reports` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `demo_problem_rate_idx` ON `demo_problem_reports` (`user_id`,`created_at`);