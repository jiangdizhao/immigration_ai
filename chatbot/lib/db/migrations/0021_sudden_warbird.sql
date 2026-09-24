CREATE TABLE IF NOT EXISTS "MatterDocumentEvidenceUnit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentId" uuid NOT NULL,
	"runId" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"sourceClass" varchar DEFAULT 'customer_document' NOT NULL,
	"locator" json NOT NULL,
	"provenance" json DEFAULT '{}'::json NOT NULL,
	"extractionMethod" varchar NOT NULL,
	"extractedText" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MatterDocumentProcessingRun" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"documentId" uuid NOT NULL,
	"extractorVersion" varchar(80) NOT NULL,
	"status" varchar NOT NULL,
	"extractionMethod" varchar,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"unitCount" integer DEFAULT 0 NOT NULL,
	"totalTextChars" integer DEFAULT 0 NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	"errorCode" varchar(64)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatterDocumentEvidenceUnit" ADD CONSTRAINT "MatterDocumentEvidenceUnit_documentId_MatterDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."MatterDocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatterDocumentEvidenceUnit" ADD CONSTRAINT "MatterDocumentEvidenceUnit_runId_MatterDocumentProcessingRun_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."MatterDocumentProcessingRun"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatterDocumentProcessingRun" ADD CONSTRAINT "MatterDocumentProcessingRun_documentId_MatterDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."MatterDocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "MatterDocumentEvidenceUnit_run_ordinal_unique" ON "MatterDocumentEvidenceUnit" USING btree ("runId","ordinal");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MatterDocumentEvidenceUnit_document_run_idx" ON "MatterDocumentEvidenceUnit" USING btree ("documentId","runId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "MatterDocumentProcessingRun_document_started_idx" ON "MatterDocumentProcessingRun" USING btree ("documentId","startedAt");