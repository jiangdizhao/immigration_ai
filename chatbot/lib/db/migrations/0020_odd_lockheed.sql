ALTER TABLE "MatterDocument" ADD COLUMN "storageStatus" varchar DEFAULT 'stored' NOT NULL;
--> statement-breakpoint
ALTER TABLE "MatterDocument" ALTER COLUMN "storageStatus" SET DEFAULT 'uploading';