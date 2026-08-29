CREATE TABLE IF NOT EXISTS "VipPurchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"providerPaymentId" varchar(255) NOT NULL,
	"amountMinor" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"purchasedAt" timestamp,
	"vipStartsAt" timestamp,
	"vipExpiresAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "VipPurchase" ADD CONSTRAINT "VipPurchase_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "VipPurchase_provider_payment_unique" ON "VipPurchase" USING btree ("provider","providerPaymentId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "VipPurchase_user_status_idx" ON "VipPurchase" USING btree ("userId","status");
