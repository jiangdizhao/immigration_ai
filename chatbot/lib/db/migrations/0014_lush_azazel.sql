CREATE TABLE IF NOT EXISTS "LawyerClarificationEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requestId" uuid NOT NULL,
	"actorUserId" uuid,
	"actorRole" varchar NOT NULL,
	"eventType" varchar(64) NOT NULL,
	"fromStatus" varchar(64),
	"toStatus" varchar(64),
	"metadata" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "LawyerClarificationMessage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requestId" uuid NOT NULL,
	"authorUserId" uuid,
	"authorRole" varchar NOT NULL,
	"body" varchar(8000) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "LawyerClarificationRequest" ADD COLUMN "assignedLawyerUserId" uuid;--> statement-breakpoint
ALTER TABLE "LawyerClarificationRequest" ADD COLUMN "assignedAt" timestamp;--> statement-breakpoint
ALTER TABLE "LawyerClarificationRequest" ADD COLUMN "customerLastViewedAt" timestamp;--> statement-breakpoint
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_role_check";--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('user', 'lawyer', 'admin'));--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LawyerClarificationEvent" ADD CONSTRAINT "LawyerClarificationEvent_requestId_LawyerClarificationRequest_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."LawyerClarificationRequest"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LawyerClarificationEvent" ADD CONSTRAINT "LawyerClarificationEvent_actorUserId_User_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LawyerClarificationMessage" ADD CONSTRAINT "LawyerClarificationMessage_requestId_LawyerClarificationRequest_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."LawyerClarificationRequest"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LawyerClarificationMessage" ADD CONSTRAINT "LawyerClarificationMessage_authorUserId_User_id_fk" FOREIGN KEY ("authorUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LawyerClarificationEvent_request_created_idx" ON "LawyerClarificationEvent" USING btree ("requestId","createdAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LawyerClarificationMessage_request_created_idx" ON "LawyerClarificationMessage" USING btree ("requestId","createdAt");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LawyerClarificationRequest" ADD CONSTRAINT "LawyerClarificationRequest_assignedLawyerUserId_User_id_fk" FOREIGN KEY ("assignedLawyerUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LawyerClarificationRequest_assigned_lawyer_status_idx" ON "LawyerClarificationRequest" USING btree ("assignedLawyerUserId","status","updatedAt");
