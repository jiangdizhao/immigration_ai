ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "role" varchar DEFAULT 'user' NOT NULL;
--> statement-breakpoint
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "membershipTier" varchar DEFAULT 'free' NOT NULL;
--> statement-breakpoint
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "vipExpiresAt" timestamp;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_normalized_unique"
  ON "User" (lower(trim("email")));
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('user', 'admin'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "User"
    ADD CONSTRAINT "User_membershipTier_check" CHECK ("membershipTier" IN ('free', 'vip'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
