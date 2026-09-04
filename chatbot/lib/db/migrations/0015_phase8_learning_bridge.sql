CREATE TABLE IF NOT EXISTS "ImmigrationAnswerTraceLink" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chatId" uuid NOT NULL,
	"assistantMessageId" uuid NOT NULL,
	"legalMatterId" varchar(255),
	"answerTraceId" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "LawyerClarificationLearningBridge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requestId" uuid NOT NULL,
	"assistantMessageId" uuid,
	"legalMatterId" varchar(255),
	"answerTraceId" varchar(255),
	"experienceRecordId" varchar(255),
	"status" varchar DEFAULT 'pending' NOT NULL,
	"phase7AnswerReviewId" varchar(255),
	"evaluationArtifactId" varchar(255),
	"reasoningLessonCandidateArtifactId" varchar(255),
	"preferredReasoningOrResearchApproach" text,
	"createReasoningLessonCandidate" boolean DEFAULT false NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"lastAttemptAt" timestamp,
	"completedAt" timestamp,
	"lastErrorCode" varchar(128),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ImmigrationAnswerTraceLink" ADD CONSTRAINT "ImmigrationAnswerTraceLink_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "LawyerClarificationLearningBridge" ADD CONSTRAINT "LawyerClarificationLearningBridge_requestId_LawyerClarificationRequest_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."LawyerClarificationRequest"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ImmigrationAnswerTraceLink_chat_assistant_unique" ON "ImmigrationAnswerTraceLink" USING btree ("chatId","assistantMessageId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ImmigrationAnswerTraceLink_trace_unique" ON "ImmigrationAnswerTraceLink" USING btree ("answerTraceId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "LawyerClarificationLearningBridge_request_unique" ON "LawyerClarificationLearningBridge" USING btree ("requestId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "LawyerClarificationLearningBridge_status_updated_idx" ON "LawyerClarificationLearningBridge" USING btree ("status","updatedAt");
--> statement-breakpoint
ALTER TABLE "LawyerClarificationLearningBridge" ADD COLUMN IF NOT EXISTS "actingStaffRole" varchar;
