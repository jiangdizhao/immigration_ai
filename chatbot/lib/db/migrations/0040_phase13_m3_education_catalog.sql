CREATE TABLE IF NOT EXISTS "EducationCourse" (
	"courseId" varchar(128) PRIMARY KEY NOT NULL,
	"providerId" varchar(128) NOT NULL,
	"recordClass" varchar NOT NULL,
	"title" varchar(512) NOT NULL,
	"qualificationLevel" varchar(128),
	"sector" varchar(128),
	"cricosCourseCode" varchar(128),
	"institutionCourseCode" varchar(128),
	"studyField" varchar(256),
	CONSTRAINT "EducationCourse_id_record_class_unique" UNIQUE("courseId","recordClass"),
	CONSTRAINT "EducationCourse_id_provider_class_unique" UNIQUE("courseId","providerId","recordClass")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EducationDelivery" (
	"deliveryId" varchar(128) PRIMARY KEY NOT NULL,
	"courseId" varchar(128) NOT NULL,
	"providerId" varchar(128) NOT NULL,
	"recordClass" varchar NOT NULL,
	"campusId" varchar(128),
	"siteId" varchar(128),
	"campusName" varchar(512),
	"city" varchar(512),
	"state" varchar(128),
	"mode" varchar(128),
	CONSTRAINT "EducationDelivery_id_record_class_unique" UNIQUE("deliveryId","recordClass"),
	CONSTRAINT "EducationDelivery_id_provider_class_unique" UNIQUE("deliveryId","providerId","recordClass")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EducationFieldObservation" (
	"observationId" varchar(128) PRIMARY KEY NOT NULL,
	"targetType" varchar NOT NULL,
	"targetProviderId" varchar(128) NOT NULL,
	"providerTargetId" varchar(128),
	"courseTargetId" varchar(128),
	"deliveryTargetId" varchar(128),
	"intakeTargetId" varchar(128),
	"fieldKey" varchar NOT NULL,
	"claimDomain" varchar NOT NULL,
	"recordClass" varchar NOT NULL,
	"disposition" varchar NOT NULL,
	"value" jsonb,
	"sourceId" varchar(128) NOT NULL,
	"sourceFamily" varchar NOT NULL,
	"sourceScopeKind" varchar NOT NULL,
	"sourceScopeKey" varchar(128) NOT NULL,
	"snapshotId" varchar(128) NOT NULL,
	"snapshotOutcome" varchar DEFAULT 'CAPTURED' NOT NULL,
	"sourceUrl" varchar(2048) NOT NULL,
	"contentSha256" varchar(64) NOT NULL,
	"locator" varchar(512) NOT NULL,
	"excerpt" varchar(4096),
	"observedAt" varchar(64) NOT NULL,
	"effectiveFrom" varchar(64),
	"effectiveTo" varchar(64)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EducationIntake" (
	"intakeId" varchar(128) PRIMARY KEY NOT NULL,
	"deliveryId" varchar(128) NOT NULL,
	"providerId" varchar(128) NOT NULL,
	"recordClass" varchar NOT NULL,
	"intakeCode" varchar(128),
	"term" varchar(512),
	"year" integer,
	"startDate" varchar(10),
	"applicationDeadline" varchar(10),
	CONSTRAINT "EducationIntake_id_record_class_unique" UNIQUE("intakeId","recordClass"),
	CONSTRAINT "EducationIntake_id_provider_class_unique" UNIQUE("intakeId","providerId","recordClass")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EducationProvider" (
	"providerId" varchar(128) PRIMARY KEY NOT NULL,
	"recordClass" varchar NOT NULL,
	"displayName" varchar(512) NOT NULL,
	"legalName" varchar(512),
	"aliases" jsonb,
	"cricosProviderCode" varchar(128),
	"category" varchar(128),
	CONSTRAINT "EducationProvider_id_record_class_unique" UNIQUE("providerId","recordClass")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EducationSnapshot" (
	"snapshotId" varchar(128) PRIMARY KEY NOT NULL,
	"sourceId" varchar(128) NOT NULL,
	"recordClass" varchar NOT NULL,
	"sourceUrl" varchar(2048) NOT NULL,
	"retrievedAt" varchar(64) NOT NULL,
	"observedAt" varchar(64) NOT NULL,
	"publishedAt" varchar(64),
	"effectiveFrom" varchar(64),
	"effectiveTo" varchar(64),
	"contentSha256" varchar(64),
	"parserVersion" varchar(128),
	"contentExcerpt" varchar(4096),
	"locator" varchar(512),
	"acquisitionOutcome" varchar NOT NULL,
	CONSTRAINT "EducationSnapshot_id_source_evidence_unique" UNIQUE("snapshotId","sourceId","recordClass","sourceUrl","contentSha256","acquisitionOutcome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EducationSource" (
	"sourceId" varchar(128) PRIMARY KEY NOT NULL,
	"sourceFamily" varchar NOT NULL,
	"recordClass" varchar NOT NULL,
	"authorityName" varchar(256) NOT NULL,
	"originalUrl" varchar(2048) NOT NULL,
	"canonicalUrl" varchar(2048) NOT NULL,
	"scopeKind" varchar NOT NULL,
	"providerId" varchar(128),
	"scopeKey" varchar(128) NOT NULL,
	"language" varchar(35) NOT NULL,
	"accessMode" varchar NOT NULL,
	CONSTRAINT "EducationSource_id_family_class_unique" UNIQUE("sourceId","sourceFamily","recordClass"),
	CONSTRAINT "EducationSource_id_class_url_unique" UNIQUE("sourceId","recordClass","canonicalUrl"),
	CONSTRAINT "EducationSource_scope_identity_unique" UNIQUE("sourceId","sourceFamily","recordClass","scopeKind","scopeKey")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationCourse" ADD CONSTRAINT "EducationCourse_provider_record_class_fk" FOREIGN KEY ("providerId","recordClass") REFERENCES "public"."EducationProvider"("providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationDelivery" ADD CONSTRAINT "EducationDelivery_course_provider_class_fk" FOREIGN KEY ("courseId","providerId","recordClass") REFERENCES "public"."EducationCourse"("courseId","providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationFieldObservation" ADD CONSTRAINT "EducationFieldObservation_target_provider_class_fk" FOREIGN KEY ("targetProviderId","recordClass") REFERENCES "public"."EducationProvider"("providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationFieldObservation" ADD CONSTRAINT "EducationFieldObservation_provider_target_fk" FOREIGN KEY ("providerTargetId","recordClass") REFERENCES "public"."EducationProvider"("providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationFieldObservation" ADD CONSTRAINT "EducationFieldObservation_course_target_fk" FOREIGN KEY ("courseTargetId","targetProviderId","recordClass") REFERENCES "public"."EducationCourse"("courseId","providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationFieldObservation" ADD CONSTRAINT "EducationFieldObservation_delivery_target_fk" FOREIGN KEY ("deliveryTargetId","targetProviderId","recordClass") REFERENCES "public"."EducationDelivery"("deliveryId","providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationFieldObservation" ADD CONSTRAINT "EducationFieldObservation_intake_target_fk" FOREIGN KEY ("intakeTargetId","targetProviderId","recordClass") REFERENCES "public"."EducationIntake"("intakeId","providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationFieldObservation" ADD CONSTRAINT "EducationFieldObservation_source_scope_fk" FOREIGN KEY ("sourceId","sourceFamily","recordClass","sourceScopeKind","sourceScopeKey") REFERENCES "public"."EducationSource"("sourceId","sourceFamily","recordClass","scopeKind","scopeKey") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationFieldObservation" ADD CONSTRAINT "EducationFieldObservation_snapshot_evidence_fk" FOREIGN KEY ("snapshotId","sourceId","recordClass","sourceUrl","contentSha256","snapshotOutcome") REFERENCES "public"."EducationSnapshot"("snapshotId","sourceId","recordClass","sourceUrl","contentSha256","acquisitionOutcome") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationIntake" ADD CONSTRAINT "EducationIntake_delivery_provider_class_fk" FOREIGN KEY ("deliveryId","providerId","recordClass") REFERENCES "public"."EducationDelivery"("deliveryId","providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationSnapshot" ADD CONSTRAINT "EducationSnapshot_source_class_url_fk" FOREIGN KEY ("sourceId","recordClass","sourceUrl") REFERENCES "public"."EducationSource"("sourceId","recordClass","canonicalUrl") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EducationSource" ADD CONSTRAINT "EducationSource_provider_record_class_fk" FOREIGN KEY ("providerId","recordClass") REFERENCES "public"."EducationProvider"("providerId","recordClass") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "EducationCourse_provider_cricos_code_unique" ON "EducationCourse" USING btree ("providerId",upper(regexp_replace(trim(normalize("cricosCourseCode", NFKC)), '[[:space:]]+', ' ', 'g'))) WHERE "EducationCourse"."cricosCourseCode" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "EducationCourse_provider_institution_code_unique" ON "EducationCourse" USING btree ("providerId",upper(regexp_replace(trim(normalize("institutionCourseCode", NFKC)), '[[:space:]]+', ' ', 'g'))) WHERE "EducationCourse"."institutionCourseCode" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "EducationDelivery_course_location_mode_unique" ON "EducationDelivery" USING btree ("courseId",regexp_replace(trim(normalize(coalesce("siteId", "campusId"), NFKC)), '[[:space:]]+', ' ', 'g'),lower(regexp_replace(trim(normalize("mode", NFKC)), '[[:space:]]+', ' ', 'g'))) WHERE coalesce("EducationDelivery"."siteId", "EducationDelivery"."campusId") is not null and "EducationDelivery"."mode" is not null and length(trim("EducationDelivery"."mode")) > 0;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "EducationIntake_delivery_code_period_unique" ON "EducationIntake" USING btree ("deliveryId",upper(regexp_replace(trim(normalize("intakeCode", NFKC)), '[[:space:]]+', ' ', 'g')),regexp_replace(trim(normalize(coalesce("term", ''), NFKC)), '[[:space:]]+', ' ', 'g'),coalesce("year", -1),coalesce("startDate", '')) WHERE "EducationIntake"."intakeCode" is not null and ("EducationIntake"."year" is not null or "EducationIntake"."startDate" is not null);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "EducationIntake_delivery_date_period_unique" ON "EducationIntake" USING btree ("deliveryId","startDate",regexp_replace(trim(normalize(coalesce("term", ''), NFKC)), '[[:space:]]+', ' ', 'g'),coalesce("year", -1)) WHERE "EducationIntake"."intakeCode" is null and "EducationIntake"."startDate" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "EducationProvider_cricos_code_unique" ON "EducationProvider" USING btree (upper(regexp_replace(trim(normalize("cricosProviderCode", NFKC)), '[[:space:]]+', ' ', 'g'))) WHERE "EducationProvider"."cricosProviderCode" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "EducationSnapshot_source_retrieved_idx" ON "EducationSnapshot" USING btree ("sourceId","retrievedAt","snapshotId");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "EducationSource_catalog_family_url_unique" ON "EducationSource" USING btree ("sourceFamily","canonicalUrl") WHERE "EducationSource"."scopeKind" = 'CATALOG';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "EducationSource_provider_family_url_unique" ON "EducationSource" USING btree ("sourceFamily","canonicalUrl","providerId") WHERE "EducationSource"."scopeKind" = 'PROVIDER';
--> statement-breakpoint
ALTER TABLE "EducationProvider"
	ADD CONSTRAINT "EducationProvider_id_check" CHECK ("providerId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
	ADD CONSTRAINT "EducationProvider_record_class_check" CHECK ("recordClass" IN ('SYNTHETIC', 'UNVERIFIED')),
	ADD CONSTRAINT "EducationProvider_display_name_check" CHECK (length(trim("displayName")) BETWEEN 1 AND 512),
	ADD CONSTRAINT "EducationProvider_legal_name_check" CHECK ("legalName" IS NULL OR length(trim("legalName")) BETWEEN 1 AND 512),
	ADD CONSTRAINT "EducationProvider_aliases_check" CHECK ("aliases" IS NULL OR jsonb_typeof("aliases") = 'array');
--> statement-breakpoint
ALTER TABLE "EducationCourse"
	ADD CONSTRAINT "EducationCourse_id_check" CHECK ("courseId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
	ADD CONSTRAINT "EducationCourse_record_class_check" CHECK ("recordClass" IN ('SYNTHETIC', 'UNVERIFIED')),
	ADD CONSTRAINT "EducationCourse_title_check" CHECK (length(trim("title")) BETWEEN 1 AND 512);
--> statement-breakpoint
ALTER TABLE "EducationDelivery"
	ADD CONSTRAINT "EducationDelivery_id_check" CHECK ("deliveryId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
	ADD CONSTRAINT "EducationDelivery_record_class_check" CHECK ("recordClass" IN ('SYNTHETIC', 'UNVERIFIED'));
--> statement-breakpoint
ALTER TABLE "EducationIntake"
	ADD CONSTRAINT "EducationIntake_id_check" CHECK ("intakeId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
	ADD CONSTRAINT "EducationIntake_record_class_check" CHECK ("recordClass" IN ('SYNTHETIC', 'UNVERIFIED')),
	ADD CONSTRAINT "EducationIntake_year_check" CHECK ("year" IS NULL OR "year" BETWEEN 1900 AND 2200),
	ADD CONSTRAINT "EducationIntake_dates_check" CHECK (("startDate" IS NULL OR "startDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') AND ("applicationDeadline" IS NULL OR "applicationDeadline" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'));
--> statement-breakpoint
ALTER TABLE "EducationSource"
	ADD CONSTRAINT "EducationSource_id_check" CHECK ("sourceId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
	ADD CONSTRAINT "EducationSource_record_class_check" CHECK ("recordClass" IN ('SYNTHETIC', 'UNVERIFIED')),
	ADD CONSTRAINT "EducationSource_family_check" CHECK ("sourceFamily" IN ('CRICOS', 'STUDY_AUSTRALIA', 'INSTITUTION')),
	ADD CONSTRAINT "EducationSource_scope_kind_check" CHECK ("scopeKind" IN ('CATALOG', 'PROVIDER')),
	ADD CONSTRAINT "EducationSource_access_mode_check" CHECK ("accessMode" IN ('SYNTHETIC_FIXTURE', 'CURATED_REFERENCE')),
	ADD CONSTRAINT "EducationSource_scope_check" CHECK (("scopeKind" = 'CATALOG' AND "providerId" IS NULL AND "scopeKey" = '' AND "sourceFamily" <> 'INSTITUTION') OR ("scopeKind" = 'PROVIDER' AND "providerId" IS NOT NULL AND "scopeKey" = "providerId" AND "sourceFamily" = 'INSTITUTION')),
	ADD CONSTRAINT "EducationSource_access_class_check" CHECK (("recordClass" = 'SYNTHETIC' AND "accessMode" = 'SYNTHETIC_FIXTURE') OR ("recordClass" = 'UNVERIFIED' AND "accessMode" = 'CURATED_REFERENCE')),
	ADD CONSTRAINT "EducationSource_authority_check" CHECK (length(trim("authorityName")) BETWEEN 1 AND 256),
	ADD CONSTRAINT "EducationSource_urls_check" CHECK ("originalUrl" LIKE 'https://%' AND "canonicalUrl" LIKE 'https://%' AND position('#' IN "canonicalUrl") = 0),
	ADD CONSTRAINT "EducationSource_class_host_check" CHECK (
		(CASE WHEN substring("canonicalUrl" from '^https://[^/?#]+') ~ '^https://[^/@:?#]+$' THEN lower(substring("canonicalUrl" from '^https://([^/@:?#]+)')) ELSE NULL END) IS NOT NULL
		AND (
			("recordClass" = 'SYNTHETIC' AND (
				("sourceFamily" = 'CRICOS' AND (CASE WHEN substring("canonicalUrl" from '^https://[^/?#]+') ~ '^https://[^/@:?#]+$' THEN lower(substring("canonicalUrl" from '^https://([^/@:?#]+)')) ELSE NULL END) ~ '[.]cricos[.]example$')
				OR ("sourceFamily" = 'STUDY_AUSTRALIA' AND (CASE WHEN substring("canonicalUrl" from '^https://[^/?#]+') ~ '^https://[^/@:?#]+$' THEN lower(substring("canonicalUrl" from '^https://([^/@:?#]+)')) ELSE NULL END) ~ '[.]study-australia[.]example$')
				OR ("sourceFamily" = 'INSTITUTION' AND (CASE WHEN substring("canonicalUrl" from '^https://[^/?#]+') ~ '^https://[^/@:?#]+$' THEN lower(substring("canonicalUrl" from '^https://([^/@:?#]+)')) ELSE NULL END) ~ '[.]institution[.]example$')
			))
			OR ("recordClass" = 'UNVERIFIED' AND (CASE WHEN substring("canonicalUrl" from '^https://[^/?#]+') ~ '^https://[^/@:?#]+$' THEN lower(substring("canonicalUrl" from '^https://([^/@:?#]+)')) ELSE NULL END) !~ '[.]example$')
		)
	),
	ADD CONSTRAINT "EducationSource_language_check" CHECK (length(trim("language")) BETWEEN 1 AND 35);
--> statement-breakpoint
ALTER TABLE "EducationSnapshot"
	ADD CONSTRAINT "EducationSnapshot_id_check" CHECK ("snapshotId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
	ADD CONSTRAINT "EducationSnapshot_record_class_check" CHECK ("recordClass" IN ('SYNTHETIC', 'UNVERIFIED')),
	ADD CONSTRAINT "EducationSnapshot_outcome_check" CHECK ("acquisitionOutcome" IN ('CAPTURED', 'FAILED_FETCH', 'FAILED_PARSE')),
	ADD CONSTRAINT "EducationSnapshot_times_check" CHECK ("retrievedAt" ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.+(Z|[+-][0-9]{2}:[0-9]{2})$' AND "observedAt" ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.+(Z|[+-][0-9]{2}:[0-9]{2})$'),
	ADD CONSTRAINT "EducationSnapshot_source_dates_check" CHECK (("publishedAt" IS NULL OR "publishedAt" ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$') AND ("effectiveFrom" IS NULL OR "effectiveFrom" ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$') AND ("effectiveTo" IS NULL OR "effectiveTo" ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$')),
	ADD CONSTRAINT "EducationSnapshot_hash_check" CHECK (("contentSha256" IS NULL OR "contentSha256" ~ '^[a-fA-F0-9]{64}$') AND ("acquisitionOutcome" = 'FAILED_FETCH' OR "contentSha256" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "EducationFieldObservation"
	ADD CONSTRAINT "EducationFieldObservation_id_check" CHECK ("observationId" ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
	ADD CONSTRAINT "EducationFieldObservation_record_class_check" CHECK ("recordClass" IN ('SYNTHETIC', 'UNVERIFIED')),
	ADD CONSTRAINT "EducationFieldObservation_target_type_check" CHECK ("targetType" IN ('PROVIDER', 'COURSE', 'DELIVERY', 'INTAKE')),
	ADD CONSTRAINT "EducationFieldObservation_field_key_check" CHECK ("fieldKey" IN ('PROVIDER_LEGAL_NAME', 'CRICOS_PROVIDER_STATUS', 'COURSE_TITLE', 'COURSE_QUALIFICATION_LEVEL', 'CRICOS_COURSE_STATUS', 'INSTITUTION_COURSE_CODE', 'COURSE_ADMISSIONS_CRITERIA', 'COURSE_AVAILABILITY', 'TUITION_FEE', 'CAMPUS_NAME', 'DELIVERY_MODE', 'DELIVERY_AVAILABILITY', 'INTAKE_PERIOD', 'INTAKE_START_DATE', 'APPLICATION_DEADLINE', 'INTAKE_AVAILABILITY', 'DISCOVERY_REFERENCE')),
	ADD CONSTRAINT "EducationFieldObservation_claim_domain_check" CHECK ("claimDomain" IN ('CRICOS_REGISTRATION', 'INSTITUTION_COURSE', 'INSTITUTION_ADMISSIONS', 'INSTITUTION_AVAILABILITY', 'INSTITUTION_FEE', 'INSTITUTION_DELIVERY', 'INSTITUTION_INTAKE', 'DISCOVERY')),
	ADD CONSTRAINT "EducationFieldObservation_disposition_check" CHECK ("disposition" IN ('ASSERTION', 'WITHDRAWAL', 'NOT_APPLICABLE')),
	ADD CONSTRAINT "EducationFieldObservation_source_family_check" CHECK ("sourceFamily" IN ('CRICOS', 'STUDY_AUSTRALIA', 'INSTITUTION')),
	ADD CONSTRAINT "EducationFieldObservation_source_scope_kind_check" CHECK ("sourceScopeKind" IN ('CATALOG', 'PROVIDER')),
	ADD CONSTRAINT "EducationFieldObservation_snapshot_outcome_check" CHECK ("snapshotOutcome" = 'CAPTURED'),
	ADD CONSTRAINT "EducationFieldObservation_target_shape_check" CHECK (("targetType" = 'PROVIDER' AND "providerTargetId" IS NOT NULL AND "providerTargetId" = "targetProviderId" AND "courseTargetId" IS NULL AND "deliveryTargetId" IS NULL AND "intakeTargetId" IS NULL) OR ("targetType" = 'COURSE' AND "providerTargetId" IS NULL AND "courseTargetId" IS NOT NULL AND "deliveryTargetId" IS NULL AND "intakeTargetId" IS NULL) OR ("targetType" = 'DELIVERY' AND "providerTargetId" IS NULL AND "courseTargetId" IS NULL AND "deliveryTargetId" IS NOT NULL AND "intakeTargetId" IS NULL) OR ("targetType" = 'INTAKE' AND "providerTargetId" IS NULL AND "courseTargetId" IS NULL AND "deliveryTargetId" IS NULL AND "intakeTargetId" IS NOT NULL)),
	ADD CONSTRAINT "EducationFieldObservation_source_scope_target_check" CHECK (("sourceScopeKind" = 'CATALOG' AND "sourceScopeKey" = '') OR ("sourceScopeKind" = 'PROVIDER' AND "sourceScopeKey" = "targetProviderId")),
	ADD CONSTRAINT "EducationFieldObservation_value_disposition_check" CHECK (("disposition" = 'ASSERTION' AND "value" IS NOT NULL AND jsonb_typeof("value") = 'object' AND ("value"->>'kind') IN ('text', 'enum', 'boolean', 'date', 'money')) OR ("disposition" IN ('WITHDRAWAL', 'NOT_APPLICABLE') AND "value" IS NULL)),
	ADD CONSTRAINT "EducationFieldObservation_field_type_check" CHECK (("disposition" <> 'ASSERTION') OR ("fieldKey" IN ('PROVIDER_LEGAL_NAME', 'COURSE_TITLE', 'INSTITUTION_COURSE_CODE', 'COURSE_ADMISSIONS_CRITERIA', 'CAMPUS_NAME', 'INTAKE_PERIOD', 'DISCOVERY_REFERENCE') AND "value"->>'kind' = 'text') OR ("fieldKey" IN ('CRICOS_PROVIDER_STATUS', 'COURSE_QUALIFICATION_LEVEL', 'CRICOS_COURSE_STATUS', 'COURSE_AVAILABILITY', 'DELIVERY_MODE', 'DELIVERY_AVAILABILITY', 'INTAKE_AVAILABILITY') AND "value"->>'kind' = 'enum') OR ("fieldKey" = 'TUITION_FEE' AND "value"->>'kind' = 'money') OR ("fieldKey" IN ('INTAKE_START_DATE', 'APPLICATION_DEADLINE') AND "value"->>'kind' = 'date')),
	ADD CONSTRAINT "EducationFieldObservation_field_domain_check" CHECK (("fieldKey" IN ('PROVIDER_LEGAL_NAME', 'COURSE_TITLE', 'COURSE_QUALIFICATION_LEVEL', 'INSTITUTION_COURSE_CODE') AND "claimDomain" = 'INSTITUTION_COURSE') OR ("fieldKey" IN ('CRICOS_PROVIDER_STATUS', 'CRICOS_COURSE_STATUS') AND "claimDomain" = 'CRICOS_REGISTRATION') OR ("fieldKey" = 'COURSE_ADMISSIONS_CRITERIA' AND "claimDomain" = 'INSTITUTION_ADMISSIONS') OR ("fieldKey" IN ('COURSE_AVAILABILITY', 'DELIVERY_AVAILABILITY') AND "claimDomain" = 'INSTITUTION_AVAILABILITY') OR ("fieldKey" = 'TUITION_FEE' AND "claimDomain" = 'INSTITUTION_FEE') OR ("fieldKey" IN ('CAMPUS_NAME', 'DELIVERY_MODE') AND "claimDomain" = 'INSTITUTION_DELIVERY') OR ("fieldKey" IN ('INTAKE_PERIOD', 'INTAKE_START_DATE', 'APPLICATION_DEADLINE', 'INTAKE_AVAILABILITY') AND "claimDomain" = 'INSTITUTION_INTAKE') OR ("fieldKey" = 'DISCOVERY_REFERENCE' AND "claimDomain" = 'DISCOVERY')),
	ADD CONSTRAINT "EducationFieldObservation_field_target_check" CHECK (("fieldKey" IN ('PROVIDER_LEGAL_NAME', 'CRICOS_PROVIDER_STATUS') AND "targetType" = 'PROVIDER') OR ("fieldKey" IN ('COURSE_TITLE', 'COURSE_QUALIFICATION_LEVEL', 'CRICOS_COURSE_STATUS', 'INSTITUTION_COURSE_CODE', 'COURSE_ADMISSIONS_CRITERIA', 'COURSE_AVAILABILITY', 'DISCOVERY_REFERENCE') AND "targetType" = 'COURSE') OR ("fieldKey" IN ('CAMPUS_NAME', 'DELIVERY_MODE', 'DELIVERY_AVAILABILITY') AND "targetType" = 'DELIVERY') OR ("fieldKey" IN ('INTAKE_PERIOD', 'INTAKE_START_DATE', 'APPLICATION_DEADLINE', 'INTAKE_AVAILABILITY') AND "targetType" = 'INTAKE') OR ("fieldKey" = 'TUITION_FEE' AND "targetType" IN ('COURSE', 'DELIVERY', 'INTAKE'))),
	ADD CONSTRAINT "EducationFieldObservation_source_domain_check" CHECK (("claimDomain" = 'CRICOS_REGISTRATION' AND "sourceFamily" = 'CRICOS') OR ("claimDomain" = 'DISCOVERY' AND "sourceFamily" = 'STUDY_AUSTRALIA') OR ("claimDomain" LIKE 'INSTITUTION_%' AND "sourceFamily" = 'INSTITUTION')),
	ADD CONSTRAINT "EducationFieldObservation_source_dates_check" CHECK ("observedAt" ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.+(Z|[+-][0-9]{2}:[0-9]{2})$' AND ("effectiveFrom" IS NULL OR "effectiveFrom" ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$') AND ("effectiveTo" IS NULL OR "effectiveTo" ~* '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T.+(Z|[+-][0-9]{2}:[0-9]{2}))?$')),
	ADD CONSTRAINT "EducationFieldObservation_hash_check" CHECK ("contentSha256" ~ '^[a-fA-F0-9]{64}$'),
	ADD CONSTRAINT "EducationFieldObservation_locator_check" CHECK (length(trim("locator")) BETWEEN 1 AND 512);
--> statement-breakpoint
CREATE FUNCTION education_catalog_reject_history_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'education catalog history is append-only'
		USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "EducationSnapshot_append_only"
BEFORE UPDATE OR DELETE ON "EducationSnapshot"
FOR EACH ROW EXECUTE FUNCTION education_catalog_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "EducationFieldObservation_append_only"
BEFORE UPDATE OR DELETE ON "EducationFieldObservation"
FOR EACH ROW EXECUTE FUNCTION education_catalog_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "EducationSnapshot_truncate_guard"
BEFORE TRUNCATE ON "EducationSnapshot"
FOR EACH STATEMENT EXECUTE FUNCTION education_catalog_reject_history_mutation();
--> statement-breakpoint
CREATE TRIGGER "EducationFieldObservation_truncate_guard"
BEFORE TRUNCATE ON "EducationFieldObservation"
FOR EACH STATEMENT EXECUTE FUNCTION education_catalog_reject_history_mutation();
--> statement-breakpoint
CREATE FUNCTION education_catalog_guard_source_identity() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF ROW(NEW."sourceFamily", NEW."recordClass", NEW."canonicalUrl", NEW."scopeKind", NEW."providerId", NEW."scopeKey")
		IS DISTINCT FROM ROW(OLD."sourceFamily", OLD."recordClass", OLD."canonicalUrl", OLD."scopeKind", OLD."providerId", OLD."scopeKey") THEN
		RAISE EXCEPTION 'education source identity is immutable'
			USING ERRCODE = '23514';
	END IF;
	RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "EducationSource_identity_immutable"
BEFORE UPDATE OF "sourceFamily", "recordClass", "canonicalUrl", "scopeKind", "providerId", "scopeKey" ON "EducationSource"
FOR EACH ROW EXECUTE FUNCTION education_catalog_guard_source_identity();
