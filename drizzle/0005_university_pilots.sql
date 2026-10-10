CREATE TABLE university_access (
 university_id TEXT NOT NULL,
 email_hash TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY (university_id,email_hash)
);
--> statement-breakpoint
CREATE TABLE partnership_inquiries (
 id TEXT PRIMARY KEY NOT NULL,
 name TEXT NOT NULL,
 email TEXT NOT NULL,
 university TEXT NOT NULL,
 message TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX partnership_created_idx ON partnership_inquiries(created_at);
