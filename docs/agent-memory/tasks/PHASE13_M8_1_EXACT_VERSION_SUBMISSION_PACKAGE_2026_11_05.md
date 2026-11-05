# Phase 13 M8.1 — Exact-Version Submission Package and Customer Confirmation

**Status:** `M8_1_IMPLEMENTED_PENDING_INDEPENDENT_REVIEW_AND_DB_BROWSER_ACCEPTANCE`
**Branch:** `phase13-m8-versioned-submission-authorization` (from verified M7 HEAD `27f07eddaaab56d32eeae42d1df78144666853eb`)
**Owner authorization:** one integrated M8.1 engineering delivery. No migration execution, Docker, browser run, AWS, paid provider, commit or push.

## Scope

One shared, target-agnostic package lifecycle plus two narrow target adapters:

| Target kind | Upstream authority |
| --- | --- |
| `managed_school_application` | M5.1 immutable `SchoolApplicationPackage` (version + `contentSha256` + `targetBindingSha256`) |
| `student_500_visa_application` | M6.2 application revision + exact GS draft version/digest + preparation snapshot + selected fact references + legal-source revision |

M8.1 **wraps and references** those immutable artifacts. It never re-implements M5.1/M6.2/M7 models, never copies document bodies or chat content, and never invents legal or professional authority.

## Delivered capability

1. A customer can freeze an exact-version **submission package** whose canonical manifest and server-generated SHA-256 bind the content they are asked to review.
2. A customer can record an explicit, durable **confirmation** of that exact version (content review and/or customer declarations), never a generic `approved=true`.
3. Frozen versions stay immutable while **current usability** is derived from live dependencies with deterministic reason codes.
4. Authenticated Project-scoped HTTP and an integrated customer UI deliver the real flow end to end.

## Invariants

| # | Invariant | Enforcement |
| --- | --- | --- |
| 1 | Exact identity | confirmation requires `packageVersionId` **and** `manifestSha256` **and** `targetVersion` to match |
| 2 | Immutable history | repository is insert-once; SQL guard triggers refuse UPDATE of identity/content and refuse DELETE |
| 3 | Revocation-aware access | current reads re-derive fact/draft visibility; a revoked source can never be served from a frozen row |
| 4 | No cross-scope leakage | every read/write is filtered by `projectId` + `targetKind` + `targetId`; foreign ids resolve to `not_found` |
| 5 | Current authorization | actor context is read from persisted Project membership on every request; browser never supplies role |
| 6 | Idempotency/concurrency | `unique (projectId, operationId)` + `requestSha256` comparison; `unique (projectId,targetKind,targetId,version)` version allocation |
| 7 | Legal honesty | manifest always carries `submissionStatus: not_submission_ready`; no approval/submission/receipt field exists |
| 8 | Production fail-closed | `PHASE13_SUBMISSION_PACKAGES_ENABLED` is default-OFF; schema probe returns 503 until migration 0051 is applied |
| 9 | No regression | no change to reasoning modes, Phase 6 checker, ReasoningBank, VIP/Stripe or existing Phase 13 permission semantics |

## Data model (migration 0051, additive only)

- `SubmissionPackage` — frozen versions: project/target identity, monotonic `version`, canonical `manifest` jsonb, `manifestSha256`, `dependencySha256`, `schemaVersion`, honesty markers, creator, `operationId`, `requestSha256`, `createdAt`.
- `SubmissionPackageConfirmation` — immutable exact-version confirmations: package version identity + digest + target version, `confirmationType`, `statementPolicyVersion`, actor, `operationId`, `requestSha256`, `confirmedAt`.
- `SubmissionPackageInvalidation` — append-only audit evidence: which confirmation, which dependency digest was observed, which reason codes, when. Insert-once per `(confirmationId, dependencySha256)`.

Historical migrations 0000–0050 are untouched. 0051 is **unapplied** in every environment.

## API surface

`GET  /api/projects/{projectId}/submission-packages?targetKind=…&targetId=…`
→ `{ target, packageVersions[], currentPackage, currentFreshness, confirmations[], confirmationHistory[], statements, limits, disclosures }`

`POST /api/projects/{projectId}/submission-packages`
→ `{ action: "build_package", targetKind, targetId, operationId, expectedVersion? }`
→ `{ action: "confirm_package", targetKind, targetId, packageVersionId, manifestSha256, targetVersion, confirmationType, statementPolicyVersion, operationId, consentGranted: true }`

Authorization: session → `regular` account only; Project membership/ownership derived server-side; closed Project = read-only; archived target = no new build/confirm; unknown target or foreign Project = `404`.

## Out of scope (M8.2+)

Professional sign-off/credential verification, managed handoff authorization, self-service submission authorization, external submission/receipts, school-portal or ImmiAccount integration, new payments/contracts, new AI drafting, deployment or production activation.

## Acceptance scenarios (offline)

- **A** three independent school packages in one Project; one changes, others stay current.
- **B** Student 500 package on an exact GS draft; a new accepted draft invalidates current confirmation without mutating history.
- **C** owner/member/revoked member/foreign Project/unauthorized account; fact-sharing revocation hides content while hashes survive.
- **D** replay, changed-payload conflict, stale expected version, concurrent builds, confirmation races.

Guarded PostgreSQL and browser harnesses may be authored; their execution stays `PENDING_OWNER_AUTHORIZATION`.

## M8.1-R1 correction contract (2026-11-05)

Independent review returned `REWORK_REQUIRED` on patch
`06b0d912bc1cfc21b28c283abae63017c6a97c80833653ab9c4d5dae77c6e606`. One bounded R1
correction implements four areas; the scope above is unchanged.

| Area | Correction |
| --- | --- |
| A | `review` representation reconstructed from the pinned GS draft version (never latest) or the frozen school package identity; `null` + refused confirmation when not reconstructable; consent bound to `projectId + targetKind + targetId + packageVersionId + manifestSha256 + statementPolicyVersion`, reset on any change, v1 consent cannot confirm v2 |
| B | writes run in one transaction that locks the Project row and re-derives authority from persisted rows; post-write dependency re-validation records invalidation evidence and returns 409 instead of a successful invalid confirmation; adversarial injection tests |
| C | integrity failure is never current/served/confirmable; only the newest version is confirmable; persisted invalidation evidence blocks resurrection; migration 0051 adds composite-identity foreign keys |
| D | guarded PostgreSQL suite extended to 7 real-repository tests; query-runner seam removed so the production SQL path is exercised; `MIN_PASS` raised (not lowered); execution still pending owner authorization |

## M8.1-R2 correction contract (2026-11-05)

The R1 independent review found four remaining correctness issues. All four are fixed in
one bounded batch; the milestone scope is unchanged.

| Area | Correction |
| --- | --- |
| R2-01 | Composite FKs moved out of `CREATE TABLE` into guarded `ALTER TABLE` statements that follow their referenced unique index; parser-based ordering regression test added |
| R2-02 | Both consent checkboxes share one reducer that binds consent to the exact Project/target/version/hash/policy; declarations-only path fixed; stale consent cannot enable a confirm button |
| R2-03 | Append-only finalization record gates confirmation validity; the finalize step is mandatory and its failures (like invalidation failures) are never suppressed; fault-injection tests for reader failure, invalidation failure and dependency reversion |
| R2-04 | M5.1 narrow exact-version `readPackageSnapshot`; school review rendered from the frozen version; inaccessible/unverifiable content blocks confirmation; `confirmable` aligned with review availability |
