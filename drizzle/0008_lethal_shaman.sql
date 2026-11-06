CREATE TABLE `website_analytics_meta` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `website_conversions` (
	`id` text PRIMARY KEY NOT NULL,
	`view_id` text NOT NULL,
	`visit_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `website_conversions_created_idx` ON `website_conversions` (`created_at`);--> statement-breakpoint
CREATE INDEX `website_conversions_visit_idx` ON `website_conversions` (`visit_id`);--> statement-breakpoint
CREATE TABLE `website_views` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`visitor_id` text NOT NULL,
	`path` text NOT NULL,
	`source` text NOT NULL,
	`device` text NOT NULL,
	`country` text NOT NULL,
	`started_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`active_ms` integer DEFAULT 0 NOT NULL,
	`nav_talk` integer DEFAULT 0 NOT NULL,
	`hero_talk` integer DEFAULT 0 NOT NULL,
	`campus_talk` integer DEFAULT 0 NOT NULL,
	`university_talk` integer DEFAULT 0 NOT NULL,
	`package_talk` integer DEFAULT 0 NOT NULL,
	`closing_talk` integer DEFAULT 0 NOT NULL,
	`footer_contact` integer DEFAULT 0 NOT NULL,
	`form_start` integer DEFAULT 0 NOT NULL,
	`demo_click` integer DEFAULT 0 NOT NULL,
	`email_click` integer DEFAULT 0 NOT NULL,
	`package_change` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `website_views_started_idx` ON `website_views` (`started_at`);--> statement-breakpoint
CREATE INDEX `website_views_visitor_idx` ON `website_views` (`visitor_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `website_views_visit_idx` ON `website_views` (`visit_id`);