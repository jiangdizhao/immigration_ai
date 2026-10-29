# M4-004 Service engagement, agreements and resource disclosure

Phase 13 M4-004 adds three connected but independent domains to a Project:

| Domain | Table(s) | Owner/writer |
| --- | --- | --- |
| Service engagement | `ServiceEngagement` | current Project customer owner (draft/lifecycle) |
| Versioned agreements | `ServiceAgreementVersion`, `ServiceAgreementAcceptance`, `ServiceSignatureEvidence` | scope-specific operator authority (terms, issuance, verification), customer owner (acceptance, evidence submission) |
| Protected resource disclosure | `ProjectResourceDisclosureGrant` | the actual resource owner only |

Everything is gated by `PHASE13_SERVICE_ENGAGEMENT_ENABLED` (default off) and by a
Migration-0043 schema probe. When either is missing, every M4-004 route returns
`404`/`503` and no M4-002, M4-003, customer Chat, lawyer-request or VIP behavior
changes.

## Authority boundaries

1. An engagement draft is **not** an entitlement. `managed` service can only
   become `active` with an accepted current agreement version **and** signature
   evidence that an injected verification port marked `verified`. The production
   verifier (`denyAllServiceSignatureEvidenceVerifier`) never verifies anything, so
   managed activation is unreachable until an approved signature/attestation
   policy exists. `self_service` activation requires only the accepted current
   version and never claims professional or lawyer approval.
2. Agreement versions are immutable. Authoring, issuance **and** signature
   verification each require a scope-specific operator decision (see R1-04 below);
   the production authority (`denyAllServiceOperatorAuthority`) denies every action
   because no contract operator, issuer or verification-operator policy is
   approved.
3. Acceptance is a consent record bound to the exact `agreementVersionId` and
   `termsSha256`. It is never a legally verified signature. A superseded version
   can no longer be accepted or activated.
4. Disclosure grants never derive from M4-002 assignment, M4-003 thread
   participation consent, M2 AI-context grants, VIP membership or an admin role.
   The recipient is resolved from the active staff assignment, the grantor must be
   the resource owner, and the exact resource version **and adapter fingerprint**
   must match a server-side source adapter.
   `unsupportedProjectResourceDisclosureResolver` is the production default, so no
   real grant can be created yet.
5. `evaluateProjectResourceDisclosure` re-evaluates current project state, the
   Grant owner's current Project eligibility, assignment state, grant state,
   resource version, adapter fingerprint and purpose on every call and returns
   `ALLOW` only when all of them hold. `read_content` is always denied in this
   slice: no Fact, Document or Chat content endpoint is connected.

## R1 authorization corrections (independent review round 1)

**R1-01 — staff metadata.** An active M4-002 assignment establishes Project staff
scope only. Service mode, scope codes and lifecycle status are protected
counterparty metadata: the staff projection returns `null` for each unless an
explicitly approved policy authorizes it, and always reports the applied policy
code (`m4-004-staff-metadata-deny-by-default`). The Project owner uses the separate
`m4-004-project-owner-full-metadata` policy.

**R1-02 — disclosure metadata.** A Grant record is itself protected metadata and a
`DENY` decision never authorizes returning it. `loadDisclosureAccessContext`
computes metadata authorization from current state, independently of the access
decision:

- `recipient_current` — only while the assignment is active for this exact
  recipient account (email-hash match, eligible verified lawyer account) **and**
  the grant is still `granted` and not expired. A revoked assignment, demoted
  account, revoked grant or expiry returns `404` with no metadata.
- `resource_owner_audit` — the recorded owner keeps a read-only audit view of the
  grants they created (including revoked/expired ones, and after leaving the
  Project). The audit response carries `auditOnly: true` and `decision: null`; it
  is never an access authorization.

**R1-03 — resource-owner eligibility.** A grant cannot stay effectively authorized
after its owner loses Project eligibility. The evaluator takes a server-derived
`resourceOwnerEligible` flag (Project ownership or active membership, with a
current account) and denies `resource_owner_ineligible` ahead of every recipient
check. The recorded owner can no longer revoke after losing eligibility
(`403 forbidden`, distinct from `404` for non-owners); no general Project access is
restored to solve that, and an administrative revocation procedure remains an
unresolved policy item.

**R1-04 — scope-specific operator authority.** A global `lawyer` or `admin` role
authorizes nothing. `ServiceOperatorAuthority` receives the exact persisted target
(Project, engagement, mode, scope, engagement status, agreement version
id/status/number, terms hash, evidence id/status, signer), the operator's current
M4-002 assignment state and derived eligibility, and the canonical
`requestSha256`. The HTTP layer loads that request from the repository before
deciding; the mutation re-derives it from the rows it locks and refuses any
mismatch (`integrity_conflict`), and refuses an operator without an active
assignment (`forbidden`). `author_draft` passes the real terms hash/scope/mode under
a caller-generated draft id; `issue` passes the persisted version's facts (never
nulls); `verify_signature` passes the persisted evidence facts and is refused for
the signatory themself.

**R1-05 — resource disclosure TOCTOU (reduced, not eliminated).** A grant is bound
to one reproducible observation: adapter code, Project, category, resource id,
version, owner and an opaque adapter `fingerprint`, hashed into
`resourceObservationSha256` (also part of the operation request hash and persisted
as `resourceFingerprint`). The repository recomputes that hash from persisted
values, then requires an injected `ProjectResourceDisclosureRevalidator` to re-read
the resource **inside** the grant transaction; a changed version, owner or
fingerprint aborts with `state_conflict`. Production composes no revalidator, so
grant creation fails closed (`resource_unavailable`).

*Outstanding requirement (stated, not claimed as solved):* atomicity against a real
source store is **not** yet established. A future verified adapter must prove a
locked or serializable snapshot re-read inside the same transaction (including
storage-level version/ETag concurrency), and be explicitly authorized per resource
category. Until that contract exists and is reviewed, no Fact, Document or private
Chat content endpoint may be connected.

**R1-06 — migration integrity.** `ServiceEngagement_scope_check` and
`ServiceAgreementVersion_scope_check` use `cardinality(...) between 1 and 2` (an
`array_length` test is `NULL` for `{}`, so an empty scope array would pass a CHECK).
`ServiceEngagement_current_agreement_fk` is the composite
`(currentAgreementVersionId, id) -> (id, engagementId)`, backed by
`ServiceAgreementVersion_id_engagement_unique`, so an engagement can never point at
another engagement's agreement version. The signature guard bounds
`declaredSignedAt` at `submittedAt + interval '5 minutes'`, matching
`SERVICE_SIGNATURE_DECLARED_TIME_FUTURE_SKEW_MS` enforced by HTTP and the
repository.

## Lifecycle

```
engagement : draft -> awaiting_customer_action -> active -> suspended <-> active
                                                         \-> terminated
agreement  : draft -> issued -> superseded (replacement creates a new version)
signature  : pending -> verified | rejected (single transition, no reactivation)
disclosure : granted -> revoked | expired
```

Each M4-004 operation advances the Project revision by exactly one, emits exactly
one typed `ProjectEvent`, and is bound by a deferred constraint trigger to the
evidence row it claims. Identical replays return the original result; a changed
request with the same operation ID is an idempotency conflict.

## R2 review corrections (independent review round 2)

**R2-01 — disclosure list/detail parity.** `runListDisclosureGrants` and the
disclosure detail read now share one predicate, `recipientGrantMetadataEligible`:
eligible verified lawyer account, the exact active assignment (id, project, staff
user, purpose, email-hash match), a still-`granted` and unexpired grant, and a
resource owner that is still an eligible Project participant. The resource-owner
audit projection is separate and unchanged.

Eligibility is enforced in **SQL** (`recipientGrantOwnerEligibilitySql`) as well as
by that shared predicate, and the shared predicate is still applied to the returned
rows as defense in depth. A revoked, expired, reassigned or owner-ineligible grant
therefore cannot appear in items, page sizes or pagination signals.

**R2-02 — exact draft binding.** `author_draft` authority requests now carry the
pre-generated `agreementVersionId` (and `agreementVersionStatus: "draft"`), so
identical terms/scope under draft A cannot authorize draft B. `author_draft`,
`issue` and `verify_signature` all re-derive the same canonical hash under lock and
refuse a mismatch with `integrity_conflict`.

**R2-03 — no staff Engagement detail.** An active M4-002 assignment authorizes the
previously approved restricted Project shell only. Engagement detail
(`runGetEngagement`) is owner-only: staff, members, admins and guests receive the
same `not_found`, so Engagement existence, ids, revision, timestamps, mode, scope
and status are not disclosed. `SERVICE_ENGAGEMENT_STAFF_METADATA_POLICY` remains the
documented deny-by-default position for a future approved staff policy.

**R2-04 — guarded launcher repaired.** The launcher no longer clears
`POSTGRES_URL` (the runtime repositories require it). The child environment is
derived from the approved URL (`buildM4_004_ChildEnvironment`) and re-verified
(`assertM4_004_ChildEnvironment`) with every alternative database variable cleared,
so the runtime can only reach the exact isolated target. Preflight additionally
verifies Docker container identity/labels/image/port/tmpfs, the server
database/role/PostgreSQL major/restricted role privileges, and the Drizzle ledger
head tied to the pinned Migration 0043 bytes.

**R2-05 — integration suite is executable.** Every successful fixture now uses the
production contract: canonical operation hashes plus authority bindings obtained
from `loadServiceOperatorContext`/`loadSignatureVerificationTarget`, and grants
bound to a real observation hash with an explicit test-only revalidator. New
database assertions cover staff Engagement denial, grant list/detail consistency,
resource-owner membership revocation, draft-id/authority-hash mismatch, the empty
scope CHECK, the composite current-agreement FK, the signature timestamp boundary,
idempotency and concurrent transitions. The suite still requires separate owner
authorization and has **not** been executed.


## R3 review corrections (independent review round 3)

**FIX-01 — M4-002 fixture workflow.** The guarded suite no longer proposes with the
customer's own account. `seedFixture` creates a separate synthetic administrator and
executes the accepted Option A sequence — admin proposes → Project owner approves →
named lawyer accepts — and first asserts that an owner-actor proposal is refused.
Production authorization was not changed to accommodate a fixture.

**FIX-02 — revocation assertions.** Once a resource owner loses Project
eligibility, the recipient read returns `not_found` (no grant metadata at all), the
recipient list is empty with `hasMore: false`, and the recorded owner still receives
the independent `resource_owner_audit` view.

**FIX-03 — canonical agreement terms.** Agreement fixtures are produced through
`parseServiceAgreementTerms`, so every authority request, draft, issue and
acceptance uses that payload and its own SHA-256. The repository write boundary
(`serviceAgreementTermsWriteMatches`) now rejects a non-canonical payload (different
key order/whitespace), a mismatched hash, or terms whose scope/mode differ from the
request — `invalid_request`, before any row is written.

**FIX-04 — pagination on authorized rows.** Recipient-list eligibility is a SQL
predicate (owner account currency + `ProjectMembership`/owner relationship), so
`LIMIT limit + 1` already selects authorized rows and interleaved ineligible grants
can no longer shorten a page or corrupt `hasMore`. The guest prefix is a single
shared constant whose SQL form is asserted equivalent to `guestRegex`.

**Guarded-suite executable SQL.** The empty-scope CHECK and the composite
`current-agreement` FK are now exercised executably: the *installed* definitions are
read from `pg_catalog` and replayed against session-local probe tables, then a
violating `INSERT` must fail with `23514` / `23503`. Direct writes to the production
tables remain impossible because the append-only guards reject unbacked rows first,
which is itself asserted.

**DBREADY — offline preflight of the guarded suite.** The PostgreSQL suite itself
was corrected (no production code changed): fixture state is created through the
supported contracts (`inviteProjectMember` → `acceptProjectMembership` →
`revokeProjectMembership`, admin → owner → lawyer M4-002 workflow), the
idempotency case now reuses the same action so it fails for the intended reason,
constraint metadata is asserted through `pg_constraint`/`pg_attribute` identity
(OIDs and ordered columns) instead of deparsed SQL text, and the behavioural
constraint probe runs on a **single reserved session** with an explicitly
constructed equivalent composite FK whose `confrelid` is verified to be the
temporary relation. See `scripts/PHASE13_M4_004_DB_TEST_HARNESS.md`.

## Unresolved policy (fail closed)

Signature provider/enforceability, contract-operator authority, verification-operator
authority, protected-resource source adapters and their in-transaction revalidation,
post-departure grant revocation, and per-resource sharing granularity remain
undecided. Their ports deny by default and must not be replaced with synthetic
implementations outside tests.

## Validation

```bash
pnpm test:phase13:m4-004:offline
pnpm test:phase13:m4-004:guard
pnpm db:check
```

Real PostgreSQL validation is **not** part of this slice. See
`scripts/PHASE13_M4_004_DB_TEST_HARNESS.md` for the exact owner-authorized
procedure.
