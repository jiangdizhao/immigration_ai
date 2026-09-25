# DECISIONS

Durable decisions for future ChatGPT/Cline/Codex sessions. Do not silently reverse an ACCEPTED decision. If new evidence requires a change, add a superseding decision record.

## D-001 — Phase 11 product target

**Date:** 2026-09-19  
**Status:** ACCEPTED

The product target is a **Chinese-first Australian Immigration & Study Service Platform**, not a chatbot-only or simple legal-Q&A website.

AI is the low-friction intake/analysis layer inside a broader service platform.

## D-002 — Main repo is functional authority; temporary UI is design authority

**Date:** 2026-09-19  
**Status:** ACCEPTED

`jiangdizhao/immigration_ai` is the production functional authority.

`jiangdizhao/immigration_temporal_ui`, especially `codex/fidelity-completion-v4@8abbba2`, is a design, composition, terminology, and user-journey reference only.

Do not wholesale-copy the Vite prototype or let mock data override production contracts.

## D-003 — Chinese default with one-click English

**Date:** 2026-09-19  
**Status:** ACCEPTED

The website UI defaults to `zh-CN` and supports one-click English switching.

Initial implementation must avoid locale-prefixed route migration. UI locale is independent from user question language and legal answer language.

## D-004 — Matter is the UX center

**Date:** 2026-09-19  
**Status:** ACCEPTED

Matter continuity is the center of the product experience. Conversation, facts, sources, lawyer escalation, and future materials should appear continuous across AI and human service.

Do not redesign the database solely to achieve this presentation. Reuse current conversation and legal-matter identity first.

## D-005 — Phase 11 does not redesign legal reasoning

**Date:** 2026-09-19  
**Status:** ACCEPTED

Phase 11 UI tasks do not authorize changes to Fast, Legal Check/Default, Premium, Phase-6, evidence identity, legal retrieval, ReasoningBank governance, political/privacy gating, or provider budget policy.

Backend changes require a separately approved task.

## D-006 — Provenance must be visible

**Date:** 2026-09-19  
**Status:** ACCEPTED

Production UI must preserve the semantic distinction:

```text
Official / Original Law != AI Analysis != Lawyer Advice
```

No UI styling may imply that AI-generated analysis is statutory text or a lawyer's advice.

## D-007 — Prototype claims are not production facts

**Date:** 2026-09-19  
**Status:** ACCEPTED

Temporary-UI lawyer names, credentials, office address, performance statistics, testimonials, response-time/SLA claims, success claims, privilege wording, and similar demonstration content are not verified production facts unless separately confirmed.

They must not be copied into production unqualified.

## D-008 — Incremental rebase; no big-bang frontend replacement

**Date:** 2026-09-19  
**Status:** ACCEPTED

Phase 11 is implemented through bounded Task Packets.

Shared shell and locale foundation come first. Public pages follow. Policy Intelligence follows. The high-risk AI Workspace is refactored later and incrementally.

## D-009 — Repository is the shared external memory

**Date:** 2026-09-19  
**Status:** ACCEPTED

Adopt the repository-first shared project-state workflow:

- conversations are temporary working memory;
- Git/code/tests and concise Markdown records are durable state;
- coding agents verify Git before editing;
- meaningful tasks have Task Packets;
- coding agents update `CURRENT_HANDOFF.md` before ending;
- ChatGPT reviews implementation against source/diff/tests rather than accepting narrative claims;
- correction work gets a new `-R1`, `-R2`, etc. Task Packet instead of silently rewriting an in-progress/completed task contract.

## D-010 — No deployment implied by Phase 11 documentation work

**Date:** 2026-09-19  
**Status:** ACCEPTED

Creating the Phase 11 branch and project-memory documents does not deploy AWS, run migrations, or change production/staging state.

Deployment remains a separately authorized operation.

## D-011 — Placeholder brand remains Sovereign Nexus Legal

**Date:** 2026-09-19  
**Status:** ACCEPTED

Until the real firm/platform branding is confirmed, the public UI may continue to use **Sovereign Nexus Legal** as an explicit placeholder brand.

Do not infer that this is the final production brand. Future replacement must be centralized and low-risk.

## D-012 — Public positioning is service-platform first

**Date:** 2026-09-19  
**Status:** ACCEPTED

The public website should primarily present an **Australian immigration and study one-stop service platform**.

AI is an important first-contact and intake capability; it must not dominate the public positioning as if the product were only an AI legal chatbot.

Preferred product story:

```text
service discovery -> AI-assisted intake -> structured matter context
-> human lawyer escalation when needed -> continuing service
```

## D-013 — Initial public service catalogue uses six service families

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002 may organize the first public service catalogue around six provisional families:

1. 留学与学生签证 / Study & Student Visa
2. 技术移民与雇主担保 / Skilled Migration & Employer Sponsorship
3. 配偶与家庭类 / Partner & Family
4. 签证拒签与 ART 复审 / Visa Refusal & ART Review
5. 永居与公民相关服务 / Permanent Residence & Citizenship-related Services
6. 复杂案件与个案策略咨询 / Complex Matters & Case Strategy

These are product-navigation categories, not legal conclusions or service guarantees. A lawyer may later refine, merge, rename or remove categories.

## D-014 — Lawyer-team UI may use explicit mock profiles only

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002 may include lawyer/team card structure so the production layout can be reviewed before real lawyer information is available.

Any temporary lawyer profile must be visibly and structurally identified as **mock / placeholder / awaiting confirmation**.

Do not present invented names, qualifications, practising-certificate details, years of experience, achievements, case counts, success rates or specialisations as production truth.

Use replaceable placeholder avatars rather than implying a real person's identity.

## D-015 — No invented public contact coordinates

**Date:** 2026-09-19  
**Status:** ACCEPTED

Until real contact details are confirmed, public pages must not invent a phone number, street address, WeChat account, email address or office location.

Use action-oriented contact/consultation CTAs that lead into the existing website workflow. Real coordinates can be added later after confirmation.

## D-016 — V4 is a strong visual reference, not a pixel-copy mandate

**Date:** 2026-09-19  
**Status:** ACCEPTED

The temporary V4 UI should strongly influence visual hierarchy, section composition, semantic color roles and overall premium/legal-service tone.

The production Next.js implementation may adapt layout and components to preserve existing auth, routing, responsive behavior and maintainability. Pixel-perfect copying is not required.

## D-017 — Unknown subjective content must be escalated, not silently decided

**Date:** 2026-09-19  
**Status:** ACCEPTED

When a Phase 11 task encounters an unresolved product/content decision that is not determined by repository authority, the coding agent must not silently convert a plausible guess into production truth.

Examples include lawyer identity, qualifications, contact details, pricing, service commitments, testimonials, branding claims, legal/commercial promises and materially subjective user-facing wording.

If the information is not needed for the active task, leave it untouched.

If a visible placeholder is necessary for structural development, use an explicit replaceable placeholder consistent with `docs/product/CONTENT_POLICY.md`.

If the choice affects architecture, legal/commercial meaning, product positioning or long-term information architecture, stop and ask the project owner.

## D-018 — P11-002A accepted; P11-002B is presentation-only refinement

**Date:** 2026-09-19  
**Status:** ACCEPTED

P11-002A at `d0964924be003fd61902fca760bd71aca53abe4f` is accepted as the structural baseline for the public platform pages after Git review and browser review of Home, Services, Process, Contact, plus English locale switching.

P11-002B may refine visual hierarchy, spacing, typography, responsive behavior, reusable presentation primitives, and restrained interaction polish for those public pages.

P11-002B must not reopen the accepted service catalogue, locale architecture, route structure, content-governance rules, auth/entitlement behavior, legal backend behavior, or introduce unverified business/lawyer facts merely for visual fidelity.

## D-019 — Policy Intelligence starts manual-first and is automation-ready

**Date:** 2026-09-19  
**Status:** ACCEPTED

Policy Intelligence will follow option **C**:

1. **Initial implementation:** manually curated policy entries only.
2. **Future architecture:** data contracts must be ready for automated discovery from authoritative sources plus human review/publication.
3. **No automatic publication:** future automated discovery or AI summarisation must not become public legal/policy content without an explicit review/publication gate.

P11-003A therefore builds the public Policy Intelligence experience and a provenance-safe typed content model without adding live crawlers, background jobs, database migrations or automated publication.

P11-003B is reserved for the future official-source discovery / curation / review workflow.

## D-020 — Policy source status and editorial publication status are separate

**Date:** 2026-09-19  
**Status:** ACCEPTED

Policy Intelligence must not collapse the legal/source status of an item into the platform's editorial workflow.

The model must distinguish, conceptually:

- **source/legal status** — for example in force, announced, proposed, consultation, superseded;
- **publication/review status** — for example draft, review required, published, archived.

A proposal/consultation must never be styled or worded as current law merely because the platform has published an explanation of it.

Only explicitly publishable entries may appear in public Policy Intelligence routes.

Official source facts, AI-assisted analysis and lawyer commentary remain visually and semantically distinct.

## D-021 — P11-003A accepted after provenance hardening

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003A is accepted after:

- implementation commit `f7fa6363e4f2ee326306b20203692dd73e45cebd`;
- provenance-hardening correction `4f232fe40161a7adad104bcbf6c382b846425936`.

The accepted model keeps:

- source/legal status separate from editorial publication status;
- public selectors restricted to published entries;
- production policy registry empty until real records are manually verified;
- official verbatim excerpt data owned by source/provenance identity rather than localized copy;
- AI analysis and lawyer commentary separate from official source material.

## D-022 — Policy curation remains repository-backed before database/admin-write work

**Date:** 2026-09-20  
**Status:** ACCEPTED

The next Policy Intelligence step will use a repository-backed manual curation workflow rather than introducing a database migration or runtime admin editor.

Reasons:

- Phase 11 does not currently authorize a Policy Intelligence database migration;
- real lawyer/policy editorial workflow is still being validated;
- the public UI already has a typed manual-first model;
- repository-backed review provides traceability through Git while content volume is low.

This is an interim operational model, not a permanent CMS decision.

A future task may move Policy Intelligence persistence into a database/admin workflow after explicit approval.

## D-023 — Unpublished policy content must remain server-only

**Date:** 2026-09-20  
**Status:** ACCEPTED

Draft, review-required, archived, or otherwise unpublished Policy Intelligence records must not be shipped into public browser bundles merely because client-side selectors hide them.

The curation boundary must therefore separate:

- shared public-safe policy types/projections;
- server-only editorial registry/content;
- public published projection passed to client-rendered presentation where necessary.

The server-only boundary should use existing Next.js conventions such as `server-only` and server components/loaders.

Public pages may receive published policy data, but must not receive unpublished editorial records.

## D-024 — Automated discovery is deferred until the manual publication boundary is hardened

**Date:** 2026-09-20  
**Status:** ACCEPTED

The earlier P11-003B scope is split:

- **P11-003B:** repository-backed manual curation + server-only publication boundary;
- **P11-003C:** automated official-source discovery into non-public candidates, with no automatic publication.

P11-003C must not begin automatically after P11-003B. Automated discovery requires separate review of source scope, scheduling, deduplication, freshness, and lawyer/admin review semantics.

## D-025 — P11-003B server-only publication boundary accepted

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003B at `081ef46dd040b6131d475750d0968c9f2e461bb2` is accepted.

The repository-backed Policy Intelligence editorial source is now server-only. Public Home/list/detail surfaces receive only explicit published public-safe projections from server loaders. Draft, review-required, archived, discovery and origin metadata are not delivered to public client presentation.

The production registry remains intentionally empty until real policy records are verified and approved.

## D-026 — Automated discovery creates non-public candidates only

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003C may automate discovery from allowlisted official sources, but discovery output is **candidate evidence**, not a publishable Policy Intelligence entry.

Automated discovery must not:

- infer or assert legal effect/status when the official source does not explicitly establish it;
- create public AI analysis;
- create lawyer commentary;
- change an editorial record to `published`;
- write into the public editorial registry automatically.

Candidate promotion remains a deliberate human-reviewed step.

## D-027 — First discovery implementation is operator-run and offline-safe

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003C will be an operator-run discovery tool/CLI, not a web-request runtime feature and not a scheduler.

It may use controlled live HTTP fetches only when explicitly invoked by the operator and only against an allowlisted official-source configuration grounded in repository authority. Deterministic tests must use local fixtures and must not depend on network availability.

P11-003C must not modify `legal-service/`; it may inspect the existing official-source registry as design authority but must keep the Policy Intelligence discovery implementation isolated from answer-time legal retrieval.

## D-028 — Home Affairs discovery uses structured site data, not generic page-link crawling

**Date:** 2026-09-20  
**Status:** ACCEPTED

A live smoke against the configured Home Affairs Student 500 seed established that the page is a valid Home Affairs response but is a poor generic `listing_links` discovery surface.

Observed evidence from the downloaded page:

- decoded HTML size is approximately 1.43 MB;
- ordinary same-host anchors are mostly the current page, homepage, SharePoint `FIXUPREDIRECT.ASPX` links, and conditions-of-use/navigation material;
- the page embeds a large `<script id="siteData" type="application/json">` payload;
- that payload contains structured `alertItems` records with fields such as title, content, category/type, URLs and update date.

Therefore the Home Affairs discovery strategy should parse bounded structured `siteData.alertItems` evidence rather than treat normal `<a href>` links as policy candidates.

This is a source-specific acquisition strategy. It does not change the human publication gate.

## D-029 — Discovery response limits apply to decoded bodies and may be source-strategy specific

**Date:** 2026-09-20  
**Status:** ACCEPTED

The discovery fetch boundary limits the decoded response body, not merely compressed network bytes. This is intentional because the safety boundary must also constrain decompression expansion.

The prior 128 KB per-response limit is too small for the observed Home Affairs seed page, whose decoded HTML is approximately 1.43 MB.

P11-003C-R2 may introduce a tightly bounded source/strategy-specific limit sufficient for the known Home Affairs structured seed, with an absolute ceiling around 2 MiB for that strategy, while retaining stricter limits for smaller sources where practical.

Increasing the limit must not remove or weaken:

- full-operation timeout;
- total-run byte cap;
- page-count/fan-out limits;
- redirect revalidation;
- DNS/private-network checks;
- exact host allowlisting.

## D-030 — Home Affairs alert dates remain raw candidate evidence

**Date:** 2026-09-20  
**Status:** ACCEPTED

Fields such as Home Affairs `siteData.alertItems.updateDate` are discovery evidence only.

They must not be automatically converted into:

- legal effective dates;
- commencement dates;
- `PolicySourceStatus` values;
- public publication status.

Any later mapping into a production `PolicyEntry` remains a human review decision.

## D-031 — Home Affairs relative alert URLs are valid provenance after safe resolution

**Date:** 2026-09-20  
**Status:** ACCEPTED

Review of the real Home Affairs `siteData.alertItems` payload showed that `alertItems.urls` commonly contains root-relative paths such as `/Visa-subsite/Pages/work/...`, not absolute URLs.

For Home Affairs structured discovery:

- a relative alert URL may be resolved against the already allowlisted fetched Home Affairs page URL;
- the resolved absolute URL must then pass the same HTTPS, exact-host allowlist and canonicalisation checks;
- out-of-scope absolute or resolved URLs remain rejected;
- alert URLs remain provenance pointers only and are not fetched in P11-003C;
- seed fallback is used only when no usable alert URL remains after safe resolution.

Generic fetched-page provenance must not be mislabeled as seed provenance.

## D-032 — P11-003C official-source discovery accepted after R1-R3 hardening

**Date:** 2026-09-20  
**Status:** ACCEPTED

P11-003C is accepted at checkpoint `fa02295675dc4343430ae0a109722141e669bbf9` after the base implementation plus R1, R2, and R3 corrections.

The accepted discovery boundary is:

- operator-run only; no scheduler or public request-time execution;
- configured allowlisted official sources only; no arbitrary URL mode;
- HTTPS/exact-host enforcement with redirect revalidation;
- DNS/private/local/link-local rejection and full-operation request deadlines;
- bounded decoded response sizes, page counts, candidate counts, and runtime;
- Home Affairs uses one bounded structured `siteData.alertItems` seed parse rather than generic link crawling;
- Home Affairs alert URLs are provenance pointers only, safely resolved/canonicalised and never fetched in this phase;
- `alertItems.updateDate` remains raw source metadata and is not converted into legal/effective/publication status;
- discovery candidates remain non-public and separate from `PolicyEntry`;
- no LLM interpretation, lawyer commentary, automatic promotion, automatic publication, database migration, or `legal-service` change.

R3 also makes URL provenance explicit as `alert`, `seed`, or `fetched_page`.

The remaining observation that the live Home Affairs alert feed includes operational/navigation items as well as policy-like items is not a discovery-safety blocker because candidates remain non-public and require human review. Any automated relevance/legal-importance filtering requires a separate future decision.

## D-033 — Phase 11 task granularity is coarser from P11-004 onward

**Date:** 2026-09-24  
**Status:** ACCEPTED

From P11-004 onward, Phase 11 work should avoid proliferating small lettered/correction tasks for normal implementation refinement.

Each major milestone should normally have one Task Packet, for example `P11-004.md`, with a small number of internal implementation stages and review gates.

Create a separate correction task only when review exposes a materially new architecture/security boundary, a distinct rollback unit, or a change that cannot reasonably remain inside the active major task.

This does not weaken the existing inspect -> commit/push -> GitHub review workflow.

## D-034 — P11-004 is a presentation rebase around preserved production behavior

**Date:** 2026-09-24  
**Status:** ACCEPTED

P11-004 will redesign the AI Workspace presentation while preserving its current functional controller and production contracts.

The rebase must preserve:

- conversation creation, history, reopening and ownership;
- frontend chat / legal matter identity continuity;
- Fast / Legal Check / Premium access policy and route selection;
- political/privacy gate and sanitized history behavior;
- guided intake submission;
- citations/source rendering;
- lawyer-request action and persisted assistant-message identity;
- VIP/server entitlement boundaries;
- existing legal-service and answer-lane contracts.

P11-004 is not authorization to change legal reasoning, provider/model routing, database schema, billing, lawyer workflow semantics, or booking infrastructure.

## D-035 — AI Workspace uses a dedicated bilingual operational shell

**Date:** 2026-09-24  
**Status:** ACCEPTED

The production AI Workspace should use a denser operational layout inspired by the approved V4 reference rather than stacking public-marketing hero sections around the chat.

Desktop direction:

```text
shared site header
    ->
compact workspace toolbar / answer mode
    ->
left: conversations
center: active consultation/chat
right: matter facts + source context + lawyer handoff
```

The existing shared site header/account controls remain production authority.

Static workspace chrome follows the persisted site locale (`zh-CN` default, English switch). User question language and assistant answer language remain independent from the site locale.

The real appointment flow remains owned by P11-007; P11-004 must not invent a booking integration.

## D-036 — Secure matter documents precede the Client Portal

**Date:** 2026-09-24  
**Status:** ACCEPTED

The Phase 11 roadmap is rebaselined from P11-005 onward because a real matter-centered service platform requires secure customer document handling before the Client Portal is consolidated around matter continuity.

Repository inspection established that the existing file scaffold is not a production matter-document system:

- `Message_v2.attachments` exists as generic chat JSON metadata, but the Phase 11 AI Workspace does not use it as a matter-document lifecycle;
- `chatbot/components/multimodal-input.tsx` can call the generic `/api/files/upload` route, but that route accepts only JPEG/PNG up to 5 MiB;
- the existing upload route writes to Vercel Blob with `access: "public"`, which is not an acceptable production boundary for passports, refusal notices, bank statements, CoEs and similar immigration materials;
- PDF intake, private matter-scoped ownership, document lifecycle/status, extraction, page provenance, and AI/lawyer continuity are not implemented.

Therefore the roadmap becomes:

1. **P11-005 — Secure Matter Documents & AI File Intake**
2. **P11-006 — Matter-centered Client Portal**
3. **P11-007 — Lawyer Workspace Continuity**
4. **P11-008 — Appointment / Consultation Workflow**
5. **P11-009 — Bilingual / responsive / accessibility / E2E + staging acceptance**

This decision supersedes only the P11-005-and-later numbering/order in Section 10 of `SERVICE_PLATFORM_UI_REBASE_V1.md`. The architecture document's product, matter-continuity, provenance, incremental-migration, legal-backend and deployment invariants remain authoritative.

## D-037 — Matter documents are private evidence, not public chat attachments

**Date:** 2026-09-24  
**Status:** ACCEPTED

P11-005 establishes a security boundary for customer-supplied matter documents.

Production direction:

- support PDF, JPEG and PNG first;
- store file bytes outside PostgreSQL in private object storage, with AWS S3 as the production target behind a storage abstraction;
- store document identity, ownership, matter/chat linkage, integrity metadata, processing status and provenance metadata in PostgreSQL;
- never rely on a public object URL as authorization;
- every upload/read/download/delete operation must re-check authenticated ownership/role and applicable matter/chat access;
- use server-generated object keys and validate file type/size/content before processing;
- keep customer documents semantically distinct from official legal sources, AI analysis and lawyer advice;
- document content is untrusted evidence and must never become model/system instructions;
- extraction must retain document/page provenance so later answers can identify which customer document/page supplied a fact;
- lawyer handoff may reuse matter documents only through explicit authorized document references, not copied public URLs.

P11-005 is a distinct architecture/security task under D-033. Additive schema/migration code may be proposed where the current generic attachment field cannot represent the required lifecycle, but applying migrations to any shared/staging/production database remains separately authorized.

The real scheduling workflow remains outside P11-005.

## D-038 — Matter-document format support is broad and registry-driven

**Date:** 2026-09-24  
**Status:** ACCEPTED

The production matter-document system must not be limited to PDF/JPEG/PNG. Customer evidence may arrive in mainstream document, spreadsheet, text/data and image formats.

The first broad production allowlist must include at least:

- PDF: `.pdf`
- images: `.jpg`, `.jpeg`, `.png`
- word-processing: `.docx`, legacy `.doc`
- plain/structured text: `.txt`, `.md`, `.json`, `.csv`
- spreadsheets: `.xlsx`, legacy `.xls`

The implementation should use a centralized format registry so later additions do not require duplicating MIME/extension/policy logic across routes and processors.

This is still an allowlist, not arbitrary-file acceptance. Executables, scripts, HTML/SVG active content, generic archives and macro-enabled Office formats remain out of scope unless separately approved.

Validation must be format-aware:

- binary formats require signature/container validation rather than trusting the browser MIME or filename;
- OOXML formats such as DOCX/XLSX are ZIP containers and must be distinguished from arbitrary ZIP files by bounded container inspection;
- legacy DOC/XLS compound files require OLE/CFB-aware recognition rather than extension-only trust;
- text-like formats such as TXT/MD/CSV require bounded text/binary validation;
- JSON should receive bounded structural validation;
- files remain untrusted/pending until the later security/processing gates permit downstream use.

Stage 2 document understanding must eventually cover the accepted Stage 1 formats rather than silently processing only PDF/images.

## D-039 — Conversation deletion must not orphan private document objects

**Date:** 2026-09-24  
**Status:** ACCEPTED

Matter-document metadata and private object bytes must have an explicit lifecycle relationship.

A normal Chat / ImmigrationConversation deletion must not cascade away the only database reference while silently leaving the corresponding private object permanently orphaned in object storage.

P11-005 Stage 1 must close this lifecycle gap before acceptance. The implementation may use an explicit cleanup/tombstone/outbox/retention-safe design consistent with the existing architecture, but it must be deterministic, tested, and must not depend on best-effort memory-only cleanup.

The migration remains unapplied. If the lifecycle correction requires a new SQL change after the already-pushed `0018` migration, prefer generating a follow-up migration rather than silently rewriting an already-pushed migration history, unless repository migration tooling clearly requires otherwise.


## D-040 — P11-005 production-readiness gates are deferred, not waived

**Date:** 2026-09-25  
**Status:** ACCEPTED

All three P11-005 implementation stages are accepted. The owner explicitly chose to defer the remaining deployment/operational production-readiness gates to P11-009 AWS/staging acceptance so P11-006 product work can proceed.

The deferred gates remain mandatory:

- deployment-compatible `@napi-rs/canvas` native binding/package trace;
- authorized migrations `0018`–`0021` plus DB-backed smoke;
- private S3/IAM/Block Public Access verification;
- retention/purge and stale storage-intent recovery operations;
- malware/quarantine/scanning strategy.

This decision does **not** mark P11-005 VERIFIED and does not authorize deployment, migration application, live OpenAI document vision or production claims.

P11-009 must explicitly carry and close these gates before staging/production acceptance.

## D-041 — P11-006 is an aggregation-first, matter-centered customer portal

**Date:** 2026-09-25  
**Status:** ACCEPTED

P11-006 will build a registered-customer portal using existing authoritative production data before considering any new schema.

Portal identity rules:

- exact non-null `legalMatterId` is the strongest existing matter grouping key;
- conversations sharing the same exact `legalMatterId` may be presented as one portal matter group;
- a conversation without a legal matter ID remains a provisional conversation-backed portal group and must not be presented as a fully established legal matter;
- the portal must not create or rewrite legal-matter identity merely for UI convenience.

Data authority rules:

- chatbot PostgreSQL remains authority for customer ownership, conversations, MatterDocuments, lawyer requests and VIP/billing state;
- legal-service Matter data may be projected only after the chatbot has established that the requested `legalMatterId` is linked to an owned conversation;
- raw legal-service `metadata_json`, hidden traces and provider/debug data must never be exposed to the browser;
- confirmed/user-origin facts and unresolved/missing facts must remain visibly distinct;
- customer-document text must not be copied into the portal overview;
- no inferred deadline, case-status, lawyer-status or legal conclusion may be invented by the portal.

P11-006 is a continuity and navigation layer. AI Workspace, lawyer-request detail, VIP billing, future lawyer workspace and future appointment workflow remain their own authorities.


## D-042 — Client Portal degrades explicitly when deferred document schema is unavailable

**Date:** 2026-09-25  
**Status:** ACCEPTED

Because P11-005 migrations `0018`–`0021` are intentionally deferred to P11-009, P11-006 must not treat the MatterDocument schema as a hard prerequisite for rendering the customer portal.

The accepted rollout-compatibility behavior is:

- the document-summary query may fail soft for the expected missing-schema condition;
- the public projection exposes document availability explicitly and must not translate unavailable data into an authoritative zero-document count;
- the portal continues to expose safe owned conversation, lawyer-request and membership state;
- Legal Service Matter unavailability remains an independent per-matter fail-soft condition;
- unrelated database failures must not be broadly swallowed.

This decision is a compatibility bridge only. It does not apply migrations, weaken P11-005 security, or mark P11-005 production-ready. D-040 remains fully in force.


## D-043 — Lawyer continuity is request-scoped, not matter-wide staff access

**Date:** 2026-09-25  
**Status:** ACCEPTED

P11-007 improves the assigned-lawyer workspace using the existing immutable `LawyerClarificationRequest` handoff contract.

Assignment authorizes the lawyer to work on that request; it does **not** automatically authorize unrestricted access to the customer's:

- full conversation history;
- all conversations sharing a `legalMatterId`;
- raw MatterDocuments or private object downloads;
- all document extraction/evidence units;
- raw Legal Service `Matter.metadata_json`;
- internal AI traces outside the existing request/learning workflow.

The accepted lawyer continuity package is the request itself plus its bounded immutable snapshot, clarification thread and existing disposition/learning fields.

P11-007 may restructure and safely project that data for human usability, but must not silently widen the authorization model. Any future matter-wide staff workspace or generic document browsing requires a separate architecture/security decision.

Official/legal evidence, AI analysis, customer-document evidence and lawyer advice must remain visibly separate in the lawyer UI.


## D-044 — P11-008 uses a first-party request/proposal/confirmation workflow

**Date:** 2026-09-25  
**Status:** ACCEPTED

P11-008 will implement a real appointment/consultation workflow without pretending that the repository already has an external calendar, real-time lawyer availability, verified office hours, consultation pricing, meeting-provider configuration, or public contact coordinates.

The accepted model is:

- a registered, verified, non-guest customer submits a consultation request with timezone, up to three preferred future windows, method preference, and an optional bounded note;
- admin remains the assignment authority and may assign a verified lawyer;
- the assigned lawyer or admin proposes a concrete slot and consultation method/instructions;
- the customer explicitly confirms the proposal or requests rescheduling;
- confirmed consultations can be completed or cancelled by authorized staff;
- same-lawyer proposed/confirmed slot overlap must be rejected transactionally;
- immutable consultation events record assignment and status/slot transitions.

A new additive consultation schema is justified because `LawyerClarificationRequest` is an answer-review/handoff contract and does not model time-window negotiation or confirmed appointments. P11-008 must not overload that table.

Authorization is independent and least-privilege:

- customers see only their own consultation requests;
- admins may manage all requests;
- lawyers see only consultations assigned to them;
- appointment assignment does not grant access to the customer's full chat history, MatterDocuments, unrelated lawyer requests, or arbitrary Legal Service matter data.

Optional chat/lawyer-request continuity links must be ownership-checked and server-derived. They are references, not authorization capabilities.

No consultation price, VIP-only entitlement, external calendar provider, video provider, office location, phone number, SLA, or real-time availability claim is introduced by this decision. Those require separate verified business/integration authority.

Stage 1 may create the next additive migration artifact, but applying it to any database remains separately authorized.


## D-045 — P11-008 Stage 2 is customer-only and availability-aware before migration 0022

**Date:** 2026-09-26  
**Status:** ACCEPTED

P11-008 Stage 1 source is accepted at `83506156546dcff2944b21edef16423a5b402d54`, but migration `0022_first_slayback.sql` remains intentionally unapplied.

Stage 2 may proceed as a customer-facing source/UI implementation without applying 0022, provided the rollout boundary is explicit:

- consultation schema availability is checked server-side through an exact catalog/`to_regclass` test;
- absence of `ConsultationRequest` is represented as **unavailable**, never as an authoritative empty consultation history;
- existing Client Portal, lawyer-request and account workflows must continue when 0022 is absent;
- unrelated database errors must not be swallowed;
- real migrated-DB create/confirm/reschedule/cancel E2E remains deferred until a separately authorized migrated/disposable environment exists.

Stage 2 is customer-only:

- `/consultations`, `/consultations/new`, and `/consultations/[id]`;
- customer status-valid actions only;
- AI Workspace / Contact / Client Portal entry points;
- no admin or lawyer scheduling UI;
- no notification implementation.

Continuity remains exact-reference and least-privilege. AI Workspace and Client Portal may pass an owned `chatId` as a hint; the server re-authorizes ownership and derives any matter identity. Client code must never supply a trusted `legalMatterId`.

The initial time-entry UI uses browser-local `datetime-local` values with the browser-resolved IANA timezone displayed to the customer. It must not label browser-local times as a different arbitrary timezone. A future editable timezone selector requires a correct timezone-aware conversion layer.

This decision does not authorize migration application, pricing, VIP-only booking, external calendar/video/phone providers, office hours, real-time availability claims, or Legal Service changes.
