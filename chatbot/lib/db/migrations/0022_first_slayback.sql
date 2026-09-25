CREATE TABLE IF NOT EXISTS "ConsultationEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"consultationRequestId" uuid NOT NULL,
	"actorUserId" uuid,
	"actorRole" varchar NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"fromStatus" varchar,
	"toStatus" varchar,
	"metadata" json DEFAULT '{}'::json NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ConsultationRequest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"chatId" uuid,
	"legalMatterId" varchar(255),
	"lawyerClarificationRequestId" uuid,
	"status" varchar DEFAULT 'requested' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"customerTimezone" varchar(128) NOT NULL,
	"preferredWindows" json NOT NULL,
	"methodPreference" varchar NOT NULL,
	"customerNote" varchar(2000),
	"assignedLawyerUserId" uuid,
	"assignedAt" timestamp,
	"scheduledStartAt" timestamp,
	"scheduledEndAt" timestamp,
	"scheduledMethod" varchar,
	"meetingInstructions" varchar(2000),
	"proposedAt" timestamp,
	"confirmedAt" timestamp,
	"completedAt" timestamp,
	"cancelledAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConsultationEvent" ADD CONSTRAINT "ConsultationEvent_consultationRequestId_ConsultationRequest_id_fk" FOREIGN KEY ("consultationRequestId") REFERENCES "public"."ConsultationRequest"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConsultationEvent" ADD CONSTRAINT "ConsultationEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConsultationRequest" ADD CONSTRAINT "ConsultationRequest_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConsultationRequest" ADD CONSTRAINT "ConsultationRequest_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConsultationRequest" ADD CONSTRAINT "ConsultationRequest_lawyerClarificationRequestId_LawyerClarificationRequest_id_fk" FOREIGN KEY ("lawyerClarificationRequestId") REFERENCES "public"."LawyerClarificationRequest"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ConsultationRequest" ADD CONSTRAINT "ConsultationRequest_assignedLawyerUserId_User_id_fk" FOREIGN KEY ("assignedLawyerUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConsultationEvent_request_created_idx" ON "ConsultationEvent" USING btree ("consultationRequestId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConsultationRequest_owner_status_updated_idx" ON "ConsultationRequest" USING btree ("userId","status","updatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConsultationRequest_status_updated_idx" ON "ConsultationRequest" USING btree ("status","updatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConsultationRequest_lawyer_status_updated_idx" ON "ConsultationRequest" USING btree ("assignedLawyerUserId","status","updatedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ConsultationRequest_lawyer_interval_status_idx" ON "ConsultationRequest" USING btree ("assignedLawyerUserId","scheduledStartAt","scheduledEndAt","status");