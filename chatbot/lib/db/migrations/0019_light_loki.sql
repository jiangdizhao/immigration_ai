ALTER TABLE "MatterDocument" DROP CONSTRAINT "MatterDocument_chatId_ImmigrationConversation_chatId_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MatterDocument" ADD CONSTRAINT "MatterDocument_chatId_ImmigrationConversation_chatId_fk" FOREIGN KEY ("chatId") REFERENCES "public"."ImmigrationConversation"("chatId") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
