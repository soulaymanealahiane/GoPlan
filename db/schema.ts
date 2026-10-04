import {sqliteTable,text,integer,index,primaryKey} from 'drizzle-orm/sqlite-core';

export const studentProfiles=sqliteTable('student_profiles',{
 id:text('id').primaryKey(),email:text('email').notNull(),firstName:text('first_name').notNull(),lastName:text('last_name').notNull(),
 createdAt:integer('created_at').notNull(),lastSeenAt:integer('last_seen_at').notNull(),consentVersion:text('consent_version').notNull(),activeWorkspaceId:text('active_workspace_id'),
},t=>[index('students_last_seen_idx').on(t.lastSeenAt)]);
export const studentWorkspaces=sqliteTable('student_workspaces',{
 userId:text('user_id').notNull(),id:text('id').notNull(),title:text('title').notNull(),phase:text('phase').notNull(),state:text('state').notNull(),revision:integer('revision').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.userId,t.id]}),index('student_workspaces_updated_idx').on(t.userId,t.updatedAt)]);

// Aggregate counters only: no student, session, questionnaire or plan identifiers.
export const usageDaily=sqliteTable('usage_daily',{
 id:text('id').primaryKey(),day:text('day').notNull(),kind:text('kind').notNull(),
 stage:text('stage').notNull(),channel:text('channel').notNull(),outcome:text('outcome').notNull(),
 count:integer('count').notNull().default(0),durationMs:integer('duration_ms').notNull().default(0),
 providerCalls:integer('provider_calls').notNull().default(0),inputTokens:integer('input_tokens').notNull().default(0),outputTokens:integer('output_tokens').notNull().default(0),
},t=>[index('usage_day_idx').on(t.day)]);

export const feedbackReports=sqliteTable('feedback_reports',{
 id:text('id').primaryKey(),receiptHash:text('receipt_hash').notNull(),payloadHash:text('payload_hash').notNull(),
 sessionHash:text('session_hash').notNull(),payload:text('payload').notNull(),
 status:text('status').notNull().default('pending'),improve:integer('improve').notNull().default(0),
 reviewNote:text('review_note').notNull().default(''),correction:text('correction'),
 createdAt:integer('created_at').notNull(),expiresAt:integer('expires_at').notNull(),reviewedAt:integer('reviewed_at'),
},t=>[index('feedback_expiry_idx').on(t.expiresAt),index('feedback_session_idx').on(t.sessionHash,t.createdAt)]);
export const feedbackReviews=sqliteTable('feedback_reviews',{
 id:text('id').primaryKey(),reportId:text('report_id').notNull(),reviewer:text('reviewer').notNull(),
 status:text('status').notNull(),note:text('note').notNull(),correction:text('correction'),createdAt:integer('created_at').notNull(),
},t=>[index('feedback_review_report_idx').on(t.reportId)]);

export const authIdentities=sqliteTable('auth_identities',{subject:text('subject').primaryKey(),userId:text('user_id').notNull()});
export const authSessions=sqliteTable('auth_sessions',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),email:text('email').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('auth_session_expiry_idx').on(t.expiresAt),index('auth_session_user_idx').on(t.userId)]);
export const authLimits=sqliteTable('auth_limits',{id:text('id').primaryKey(),count:integer('count').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('auth_limit_expiry_idx').on(t.expiresAt)]);

export const authPasswordTickets=sqliteTable('auth_password_tickets',{tokenHash:text('token_hash').primaryKey(),userId:text('user_id').notNull(),email:text('email').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('auth_password_expiry_idx').on(t.expiresAt)]);
