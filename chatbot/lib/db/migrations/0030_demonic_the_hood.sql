CREATE TABLE IF NOT EXISTS "ProjectConversation" (
	"chatId" uuid PRIMARY KEY NOT NULL,
	"projectId" uuid NOT NULL,
	"createdByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"actorUserId" uuid NOT NULL,
	"projectRevision" integer NOT NULL,
	"eventType" varchar NOT NULL,
	"subjectKind" varchar,
	"subjectId" uuid,
	"operationRecordId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectMembership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"projectId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"invitedByUserId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"acceptedAt" timestamp,
	"revokedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectOperation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actorUserId" uuid NOT NULL,
	"operationType" varchar NOT NULL,
	"operationId" varchar(128) NOT NULL,
	"requestHash" varchar(64) NOT NULL,
	"resultKind" varchar NOT NULL,
	"resultId" uuid NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "StudyJourneyProject" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ownerUserId" uuid NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"closedAt" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "Chat_id_user_id_unique" ON "Chat" USING btree ("id","userId");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectConversation" ADD CONSTRAINT "ProjectConversation_chatId_ImmigrationConversation_chatId_fk" FOREIGN KEY ("chatId") REFERENCES "public"."ImmigrationConversation"("chatId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectConversation" ADD CONSTRAINT "ProjectConversation_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectConversation" ADD CONSTRAINT "ProjectConversation_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectConversation" ADD CONSTRAINT "ProjectConversation_chat_owner_fk" FOREIGN KEY ("chatId","createdByUserId") REFERENCES "public"."Chat"("id","userId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectEvent" ADD CONSTRAINT "ProjectEvent_operationRecordId_ProjectOperation_id_fk" FOREIGN KEY ("operationRecordId") REFERENCES "public"."ProjectOperation"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_projectId_StudyJourneyProject_id_fk" FOREIGN KEY ("projectId") REFERENCES "public"."StudyJourneyProject"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectMembership" ADD CONSTRAINT "ProjectMembership_invitedByUserId_User_id_fk" FOREIGN KEY ("invitedByUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ProjectOperation" ADD CONSTRAINT "ProjectOperation_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "StudyJourneyProject" ADD CONSTRAINT "StudyJourneyProject_ownerUserId_User_id_fk" FOREIGN KEY ("ownerUserId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectConversation_project_created_idx" ON "ProjectConversation" USING btree ("projectId","createdAt","chatId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectEvent_project_revision_unique" ON "ProjectEvent" USING btree ("projectId","projectRevision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectEvent_project_created_idx" ON "ProjectEvent" USING btree ("projectId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMembership_project_user_unique" ON "ProjectMembership" USING btree ("projectId","userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectMembership_user_status_project_idx" ON "ProjectMembership" USING btree ("userId","status","projectId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectOperation_actor_type_operation_unique" ON "ProjectOperation" USING btree ("actorUserId","operationType","operationId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectOperation_actor_created_idx" ON "ProjectOperation" USING btree ("actorUserId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectOperation_outcome_idx" ON "ProjectOperation" USING btree ("resultKind","resultId");
--> statement-breakpoint
ALTER TABLE "StudyJourneyProject"
  ADD CONSTRAINT "StudyJourneyProject_revision_positive_check"
  CHECK ("revision" > 0);
--> statement-breakpoint
ALTER TABLE "StudyJourneyProject"
  ADD CONSTRAINT "StudyJourneyProject_lifecycle_check"
  CHECK (("status" = 'active' AND "closedAt" IS NULL) OR ("status" = 'closed' AND "closedAt" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "StudyJourneyProject"
  ADD CONSTRAINT "StudyJourneyProject_status_check"
  CHECK ("status" IN ('active', 'closed'));
--> statement-breakpoint
ALTER TABLE "ProjectMembership"
  ADD CONSTRAINT "ProjectMembership_status_check"
  CHECK ("status" IN ('pending', 'active', 'revoked'));
--> statement-breakpoint
ALTER TABLE "ProjectMembership"
  ADD CONSTRAINT "ProjectMembership_lifecycle_check"
  CHECK (("status" = 'pending' AND "acceptedAt" IS NULL AND "revokedAt" IS NULL) OR ("status" = 'active' AND "acceptedAt" IS NOT NULL AND "revokedAt" IS NULL) OR ("status" = 'revoked' AND "revokedAt" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "ProjectOperation"
  ADD CONSTRAINT "ProjectOperation_operation_id_check"
  CHECK ("operationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
--> statement-breakpoint
ALTER TABLE "ProjectOperation"
  ADD CONSTRAINT "ProjectOperation_request_hash_check"
  CHECK ("requestHash" ~ '^[0-9a-f]{64}$');
--> statement-breakpoint
ALTER TABLE "ProjectOperation"
  ADD CONSTRAINT "ProjectOperation_type_check"
  CHECK ("operationType" IN ('project_create', 'project_close', 'membership_invite', 'membership_accept', 'membership_revoke', 'project_chat_create'));
--> statement-breakpoint
ALTER TABLE "ProjectOperation"
  ADD CONSTRAINT "ProjectOperation_result_kind_check"
  CHECK ("resultKind" IN ('project', 'membership', 'chat'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent"
  ADD CONSTRAINT "ProjectEvent_revision_positive_check"
  CHECK ("projectRevision" > 0);
--> statement-breakpoint
ALTER TABLE "ProjectEvent"
  ADD CONSTRAINT "ProjectEvent_type_check"
  CHECK ("eventType" IN ('project_created', 'membership_state_changed', 'project_chat_created', 'project_closed'));
--> statement-breakpoint
ALTER TABLE "ProjectEvent"
  ADD CONSTRAINT "ProjectEvent_subject_check"
  CHECK (("subjectKind" IS NULL AND "subjectId" IS NULL) OR ("subjectKind" IS NOT NULL AND "subjectId" IS NOT NULL AND "subjectKind" IN ('project', 'membership', 'chat')));
