ALTER TABLE partnership_inquiries ADD COLUMN offer_json TEXT;
--> statement-breakpoint
ALTER TABLE partnership_inquiries ADD COLUMN email_state TEXT NOT NULL DEFAULT 'not_requested';
--> statement-breakpoint
ALTER TABLE partnership_inquiries ADD COLUMN email_id TEXT;
--> statement-breakpoint
ALTER TABLE partnership_inquiries ADD COLUMN email_attempts INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE partnership_inquiries ADD COLUMN email_attempted_at INTEGER;
--> statement-breakpoint
ALTER TABLE partnership_inquiries ADD COLUMN email_updated_at INTEGER;
--> statement-breakpoint
ALTER TABLE partnership_inquiries ADD COLUMN email_error TEXT;
