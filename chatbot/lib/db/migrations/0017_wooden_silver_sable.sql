CREATE TABLE IF NOT EXISTS "VipBillingNotification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"billingEventId" uuid NOT NULL,
	"userId" uuid NOT NULL,
	"notificationType" varchar NOT NULL,
	"deliveryStatus" varchar DEFAULT 'pending' NOT NULL,
	"deliveryToken" varchar(128),
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"lastErrorCode" varchar(128),
	"sentAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "VipBillingEvent" ADD COLUMN "processingToken" varchar(128);--> statement-breakpoint
ALTER TABLE "VipBillingEvent" ADD COLUMN "processingStartedAt" timestamp;--> statement-breakpoint
ALTER TABLE "VipSubscription" ADD COLUMN "providerCheckoutSessionId" varchar(255);--> statement-breakpoint
ALTER TABLE "VipSubscription" ADD COLUMN "lastPaidInvoiceId" varchar(255);--> statement-breakpoint
ALTER TABLE "VipSubscription" ADD COLUMN "lastPaidAt" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "VipBillingNotification" ADD CONSTRAINT "VipBillingNotification_billingEventId_VipBillingEvent_id_fk" FOREIGN KEY ("billingEventId") REFERENCES "public"."VipBillingEvent"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "VipBillingNotification" ADD CONSTRAINT "VipBillingNotification_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "VipBillingNotification_event_type_unique" ON "VipBillingNotification" USING btree ("billingEventId","notificationType");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "VipBillingNotification_status_idx" ON "VipBillingNotification" USING btree ("deliveryStatus","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "VipSubscription_provider_checkout_session_unique" ON "VipSubscription" USING btree ("providerCheckoutSessionId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "VipSubscription_live_per_user_unique" ON "VipSubscription" USING btree ("userId") WHERE "VipSubscription"."status" <> 'cancelled';