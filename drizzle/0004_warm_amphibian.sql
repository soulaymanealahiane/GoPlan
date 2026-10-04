CREATE TABLE `auth_password_tickets` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_password_expiry_idx` ON `auth_password_tickets` (`expires_at`);