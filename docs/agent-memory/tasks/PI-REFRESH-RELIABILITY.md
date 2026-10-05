# PI-REFRESH-RELIABILITY — Policy Intelligence Refresh Reliability

**Status:** ACTIVE  
**Activated:** 2026-10-06  
**Canonical branch:** `phase11-chinese-service-platform-ui-rebase`  
**Activation baseline:** `dfb845de5ce2ffb9862000b6c7bedaa7312255b7`  
**Protected Policy WIP branch:** `policy-intelligence-admin-detail-wip-20261004` at `a73e3b51cb091b275f46116bad911ede445be54d`

## Objective

Restore reliable discovery of genuinely new Australian immigration/legal updates while preserving the existing official-source, provenance, verifier and fail-closed publication boundaries.

This task is not a UI redesign and is not an instruction to lower the verifier/publication gate merely to increase publication volume.

## Live AWS evidence that activates this task

Read-only AWS/RDS inspection established that the daily EventBridge Scheduler is running normally. Natural 06:00 Australia/Sydney runs were recorded across 3–6 October 2026 for all three configured sources.

For the recent natural runs:

- Home Affairs: 10 discovered, 10 unchanged, 0 snapshotted, 0 analyzed, 0 published.
- Federal Register: 3 discovered, 3 unchanged, 0 snapshotted, 0 analyzed, 0 published.
- ART: 3 discovered, 3 unchanged, 0 snapshotted, 0 analyzed, 0 published.
- recent runs completed with no source failure.

Therefore the recent zero-publication symptom is not primarily a Scheduler failure and did not reach analyzer/verifier execution. The immediate bottleneck is discovery repeatedly returning the same candidates.

A live Federal Register dry-run demonstrated a structural selection defect. The current discovery returned the sitemap seed plus static/non-legislative pages such as the Federal Register homepage, Terms of Use and Glossary instead of recent legislation/instruments. The current generic sitemap parser takes early `<loc>` entries and truncates before any recency/relevance ordering.

A live Home Affairs inspection found 70 `siteData.alertItems`. The first ten are currently the newest alerts: the newest are dated 2 October 2026, followed by 1 October and then 23 September. There were no hidden 3–6 October alerts below the ten-candidate cutoff. Thus the current Home Affairs ten-candidate cap is not the direct cause of the 3–6 October inactivity, although deterministic ranking and secondary-URL coverage still need hardening.

The publication gate remains a separate known issue for earlier items that were discovered/analyzed but held, including useful Home Affairs visa updates. Do not conflate that older hold problem with the recent discovery-stage inactivity.

## Implementation plan

### RR-01 — Discovery reliability + operator observability — ACTIVE

Implement this as one concentrated coding/review unit.

#### 1. Federal Register discovery must become source-aware

Replace first-N sitemap traversal with bounded structured selection that is suitable for legislation monitoring.

Required behavior:

- parse sitemap records structurally, preserving `loc` and `lastmod` when present;
- distinguish sitemap/index documents from candidate legislation pages;
- do not emit the sitemap seed itself as a legal-update candidate;
- rank/filter before candidate truncation rather than taking source-document order;
- reject obvious static/support/navigation pages such as homepage, terms/help/glossary surfaces;
- prefer recent official legislation/instrument material using official metadata where available;
- if the current Federal Register exposes a more appropriate bounded official listing/search surface, it may replace or supplement the sitemap strategy only after inspecting the real source contract and adding deterministic fixtures/tests;
- do not hard-code individual instrument IDs and do not use provider/open-ended web search as publication authority.

The implementation must remain HTTPS allowlisted, SSRF-safe, bounded in pages/bytes/time and deterministic.

#### 2. Home Affairs discovery hardening

Preserve the current `siteData.alertItems` source strategy, but remove reliance on incidental source ordering.

Required behavior:

- parse and rank valid `updateDate` values newest-first before applying the publication candidate cap;
- preserve deterministic ordering for equal/unparseable dates;
- deduplicate canonical URLs deterministically;
- inspect all allowed alert records within the existing bounded alert-item ceiling before truncation;
- review multi-URL alerts so distinct valid official pages are not silently lost merely because the first URL was chosen, while keeping a bounded candidate budget;
- do not infer legal effect from an alert title alone.

#### 3. ART discovery hardening

Inspect the current ART immigration/citizenship listing semantics and existing fixture coverage, then make link selection source-aware rather than generic first-link traversal.

Required behavior:

- exclude navigation, generic service and unrelated utility pages;
- prefer immigration/citizenship review changes, procedural updates, practice directions, announcements or other genuinely update-like official content;
- use explicit source dates when available;
- rank/filter before truncation;
- retain the existing host/network safety boundary.

If live ART inspection is unavailable in the coding environment, implement from deterministic fixtures/source structure and leave the bounded live smoke to owner acceptance rather than inventing live facts.

#### 4. Candidate-selection semantics

Across all three sources:

- selection order must be explicit, testable and deterministic;
- recency/relevance filtering must occur before `maxCandidates` truncation;
- static/seed/index transport resources must not consume scarce legal-update candidate slots;
- unchanged snapshots should remain cheap and should not trigger AI analysis;
- do not broaden resource ceilings blindly just to improve counts;
- avoid brittle visa-subclass-only regexes that would exclude future immigration topics.

#### 5. Admin/operator observability

The current admin item JSON is insufficient to prove Scheduler freshness because unchanged snapshots do not update item timestamps and normal source sync diagnostics may be null.

Add a safe admin/operator projection of recent/latest sync-run health using the existing `PolicyIntelligenceSyncRun` data, including at minimum:

- sourceConfigId;
- status;
- startedAt/completedAt;
- discoveredCount;
- snapshottedCount;
- unchangedCount;
- analyzedCount;
- publishedCount;
- heldCount;
- failureCount;
- safeErrorCode.

Expose only bounded operational metadata. Do not expose `POSTGRES_URL`, provider payloads, prompts, source bodies, credentials or raw stack traces.

Prefer reusing the existing authenticated Policy Intelligence admin boundary. No database migration should be required because these fields already exist.

#### 6. Deterministic regression coverage

Add fixtures/tests that would have caught the production failure:

- Federal sitemap where static pages occur first but newer legislation occurs later;
- Federal lastmod/recency ordering;
- seed/index/static pages do not consume candidate slots;
- Home Affairs >10 alerts with date ordering independent of document order;
- Home Affairs duplicate/multi-URL behavior;
- ART generic links before a relevant update;
- candidate caps applied after ranking/filtering;
- safe admin sync-run projection and authorization;
- existing SSRF, redirect, timeout and response-size tests remain green.

Run the normal chatbot unit suite once after the complete change, production build, focused Biome and `git diff --check`.

#### 7. RR-01 stop boundary

Do not change analyzer prompts, verifier semantics, publication-gate strictness, policy public copy, Legal Service reasoning, billing, consultation/lawyer flows, database schema or AWS resources in RR-01.

Do not merge, overwrite or delete `policy-intelligence-admin-detail-wip-20261004`.

Leave RR-01 source uncommitted/unpushed for independent review. After review, use one implementation commit/push rather than a chain of cosmetic micro-fixes.

### RR-02 — Publication-gate diagnosis/correction — PLANNED AFTER RR-01

Only after RR-01 is accepted and discovery is producing useful current candidates:

- inspect full stored analyzer + verifier assessments for representative held Home Affairs items such as 186/482/494;
- use/review the protected admin-detail WIP separately if it remains the safest diagnostic path;
- determine whether holds come from unsupported model narrative, source-status modeling, verifier structural mismatch or a genuinely unsupported claim;
- preserve fail-closed legal/source facts;
- if appropriate, allow a publication revision to contain only fully supported core factual material while omitting/holding optional unsupported interpretation, rather than weakening evidence requirements globally;
- do not optimize for publication rate.

RR-02 requires its own evidence-based implementation decision; this task file does not pre-authorize a verifier relaxation.

### Rollout / acceptance after source review

AWS mutation remains owner-authorized separately.

When RR-01 is source-reviewed and committed:

1. deploy only the required web/policy-runner artifacts using the current canonical AWS procedure;
2. run bounded dry-runs for Home Affairs, Federal Register and ART;
3. verify Federal Register no longer returns homepage/terms/glossary as the effective legal candidate set;
4. execute one owner-authorized manual all-source sync and inspect the recorded sync funnel;
5. observe at least the next natural 06:00 Scheduler run;
6. verify public content remains fail-closed and existing published/reviewed content is not retracted by a failed sync.

## Success criteria

RR-01 is successful when:

- natural scheduling remains healthy;
- discovery no longer depends on arbitrary first-N document order;
- Federal Register yields current legislation/instrument candidates instead of static site pages;
- Home Affairs selection is explicitly date-ranked and bounded;
- ART selection is source-aware;
- admin operators can see actual latest sync timestamps/counters without direct RDS probing;
- unchanged content remains cheap;
- verifier/publication safety semantics are unchanged in RR-01;
- no protected Policy WIP is mixed into the implementation.
