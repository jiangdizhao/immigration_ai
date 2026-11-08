-- Phase 13 M9-A - persistent Project conversation step binding.
--
-- Additive only. No existing table is altered destructively, no historical row is
-- rewritten, and no standalone conversation is migrated or claimed by a step.
--
-- Why this is the only new persistent state M9-A needs: a "step conversation" is
-- still an ordinary owner-scoped Project Chat. The binding row only records which
-- workflow step the owner opened it from, so a Project member still cannot read
-- another member's private Chat, and a step binding grants no document, fact,
-- evidence, review or submission authority.
--
-- The composite foreign key makes a contradictory row impossible: the bound Chat
-- must already belong to the same Project AND the same creator, and the unique
-- index on the binding keeps one step conversation per owner per Project (which is
-- what makes find-or-create idempotent).

--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectConversation_chat_project_creator_unique" ON "ProjectConversation" USING btree ("chatId","projectId","createdByUserId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ProjectConversationStage" (
"chatId" uuid PRIMARY KEY NOT NULL,
"projectId" uuid NOT NULL,
"createdByUserId" uuid NOT NULL,
"stageKey" varchar(64) NOT NULL,
"createdAt" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "ProjectConversationStage_stage_key_check" CHECK ("stageKey" in ('school_applications','school_admissions','student500'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ProjectConversationStage_owner_stage_unique" ON "ProjectConversationStage" USING btree ("projectId","createdByUserId","stageKey");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ProjectConversationStage_project_idx" ON "ProjectConversationStage" USING btree ("projectId","createdAt");

--> statement-breakpoint
ALTER TABLE "ProjectConversationStage"
      ADD CONSTRAINT "ProjectConversationStage_conversation_fk"
      FOREIGN KEY ("chatId","projectId","createdByUserId")
      REFERENCES "ProjectConversation" ("chatId","projectId","createdByUserId")
      ON DELETE RESTRICT ON UPDATE RESTRICT;
