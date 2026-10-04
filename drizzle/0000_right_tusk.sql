CREATE TABLE `feedback_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_hash` text NOT NULL,
	`payload_hash` text NOT NULL,
	`session_hash` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`improve` integer DEFAULT 0 NOT NULL,
	`review_note` text DEFAULT '' NOT NULL,
	`correction` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`reviewed_at` integer
);
--> statement-breakpoint
CREATE INDEX `feedback_expiry_idx` ON `feedback_reports` (`expires_at`);--> statement-breakpoint
CREATE INDEX `feedback_session_idx` ON `feedback_reports` (`session_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `feedback_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`reviewer` text NOT NULL,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`correction` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_review_report_idx` ON `feedback_reviews` (`report_id`);