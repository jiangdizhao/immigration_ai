CREATE TABLE IF NOT EXISTS "LawyerClarificationRequest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"chatId" uuid,
	"userMessageId" uuid,
	"assistantMessageId" uuid,
	"legalMatterId" varchar(255),
	"requestSource" varchar NOT NULL,
	"assistantMode" varchar DEFAULT 'unknown' NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"snapshotVersion" varchar(32) DEFAULT 'phase8.m3.v1' NOT NULL,
	"questionSnapshot" text NOT NULL,
	"answerSnapshot" text NOT NULL,
	"evidenceSnapshot" json NOT NULL,
	"contextSnapshot" json NOT NULL,
	"customerNote" text,
	"reviewerUserId" uuid,
	"lawyerResponse" text,
	"correctedAnswer" text,
	"reviewedAt" timestamp,
	"closedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LawyerClarificationRequest" ADD CONSTRAINT "LawyerClarificationRequest_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LawyerClarificationRequest" ADD CONSTRAINT "LawyerClarificationRequest_reviewerUserId_User_id_fk" FOREIGN KEY ("reviewerUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "LawyerClarificationRequest_user_assistant_unique" ON "LawyerClarificationRequest" USING btree ("userId","assistantMessageId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LawyerClarificationRequest_user_created_status_idx" ON "LawyerClarificationRequest" USING btree ("userId","createdAt","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LawyerClarificationRequest_status_created_idx" ON "LawyerClarificationRequest" USING btree ("status","createdAt");