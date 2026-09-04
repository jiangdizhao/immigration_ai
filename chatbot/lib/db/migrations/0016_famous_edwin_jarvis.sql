CREATE TABLE IF NOT EXISTS "VipBillingEvent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"providerEventId" varchar(255) NOT NULL,
	"eventType" varchar(128) NOT NULL,
	"processingStatus" varchar DEFAULT 'received' NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"lastErrorCode" varchar(128),
	"receivedAt" timestamp DEFAULT now() NOT NULL,
	"processedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "VipPlanPrice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amountMinor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'AUD' NOT NULL,
	"billingInterval" varchar DEFAULT 'month' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdByUserId" uuid,
	"provider" varchar(32),
	"providerProductId" varchar(255),
	"providerPriceId" varchar(255),
	"providerSyncStatus" varchar DEFAULT 'unprovisioned' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"retiredAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "VipSubscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"planPriceId" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"providerCustomerId" varchar(255),
	"providerSubscriptionId" varchar(255),
	"providerPriceId" varchar(255),
	"amountMinor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"currentPeriodStart" timestamp,
	"currentPeriodEnd" timestamp,
	"cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
	"cancelledAt" timestamp,
	"endedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "VipPlanPrice" ADD CONSTRAINT "VipPlanPrice_createdByUserId_User_id_fk" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "VipSubscription" ADD CONSTRAINT "VipSubscription_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "VipSubscription" ADD CONSTRAINT "VipSubscription_planPriceId_VipPlanPrice_id_fk" FOREIGN KEY ("planPriceId") REFERENCES "public"."VipPlanPrice"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "VipBillingEvent_provider_event_unique" ON "VipBillingEvent" USING btree ("provider","providerEventId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "VipBillingEvent_status_updated_idx" ON "VipBillingEvent" USING btree ("processingStatus","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "VipPlanPrice_active_unique" ON "VipPlanPrice" USING btree ("active") WHERE "VipPlanPrice"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "VipSubscription_provider_subscription_unique" ON "VipSubscription" USING btree ("provider","providerSubscriptionId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "VipSubscription_user_status_idx" ON "VipSubscription" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "VipSubscription_plan_price_idx" ON "VipSubscription" USING btree ("planPriceId");