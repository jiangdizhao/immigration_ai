# Experimental Schedule-2 Legal Navigation Map Sidecar

## Purpose

This is an isolated, offline, read-only, rebuildable experiment. It records
mechanically observable navigation structure in Schedule 2 of the tracked
Migration Regulations 1994 compilation and points to explicit locations that a
future research process may inspect next.

It is not integrated into Luna, Premium, the answer path, Flat-RAG, exact
lookup, the compact checker, PostgreSQL, or any FastAPI endpoint.

## Source and rebuild

The builder reads the tracked page-delimited raw representations:

- `data/raw/legislation/migration_regulations_1994_F2026C00667/F2026C00667VOL02.json`
- `data/raw/legislation/migration_regulations_1994_F2026C00667/F2026C00667VOL03.json`

The raw JSON is used because each section retains a source page, heading, and
text boundary. The builder also records the hashes of the corresponding
tracked PDFs for provenance; it does not re-parse or replace those PDFs. The
validated legal-locator JSONL is read-only compatibility metadata.

From `legal-service`, rebuild the generated artifact with:

```bash
PYTHONPATH=. /home/rico/anaconda3/envs/torch/bin/python \
  scripts/build_experimental_schedule2_navigation_sidecar.py
```

Verify the persisted artifact and a fresh deterministic rebuild with:

```bash
PYTHONPATH=. /home/rico/anaconda3/envs/torch/bin/python \
  scripts/verify_experimental_schedule2_navigation_sidecar.py
```

Run the independent structural oracle comparison separately with:

```bash
PYTHONPATH=. /home/rico/anaconda3/envs/torch/bin/python \
  scripts/verify_experimental_schedule2_structural_oracle.py
```

The generated files are under
`data/processed/experimental/schedule2_navigation/`. They are deliberately
outside the existing shared Schedule and serving-path artifact namespaces.

## Structural extraction

Schedule-2 page ownership is carried between structurally detected Schedule
headings. Obvious contents pages are excluded. A provision is recognized only
when a full provision locator is a standalone line, optionally followed by a
heading dash. A parenthesised reference such as `103.313(2)` is not accepted
as a provision heading. Subclass ownership is likewise taken only from a
separator-bearing structural `Subclass N—Title` line; ordinary prose cannot
overwrite the active owner.

Canonical provision identity is the normalized provision reference. Repeated
source occurrences are retained with page, line, source-file, source-hash,
and text-hash provenance. A provision whose observed ownership is missing,
conflicting, or prefix-inconsistent is reported and rejected by the strict
builder rather than assigned heuristically.

The validation-only oracle in
`app/legal_map_experimental/schedule2_structural_oracle.py` has independent
raw-JSON page-boundary, subclass, `Clause ...`, and standalone provision
grammars. It uses tokenized locator lines and source coordinates rather than
the production structural regexes. Structural interpretation shared with the
production extractor is explicitly recorded as none. It does not import the
production provision parser or perform legal inference. The verifier compares
canonical inventory, ownership, per-subclass source order, and the actual
`NEXT_CLAUSE`/`PREVIOUS_CLAUSE` graph pairs with the sidecar.

Schedule metadata is accepted only when the complete `heading` value is
heading-shaped, such as `Schedule 2`, `Schedule 2—Provisions`, or
`Schedule 2 - Provisions`. Compact display titles are accepted directly;
longer source-style headings that end with `Schedule N` require a matching
full-line Schedule title in the same page text. Trailing substring matches and
sentence-like continuations in prose are rejected.

External references are extracted only from explicit locator syntax such as
regulations, schedules, PICs, conditions, Act sections, instruments, and
Schedule-3 criteria. Ambiguous locators remain marked ambiguous. A missing
local locator is preserved as an unresolved external target; it never means
that the law or source does not exist.

## Nodes and edges

Nodes are only:

- `subclass`;
- `provision`;
- `external_locator`.

Edges are structural or explicit navigation relationships: `CONTAINS`,
`NEXT_CLAUSE`, `PREVIOUS_CLAUSE`, and the typed `REFERENCES_*` relations
represented in the generated manifest. No edge expresses eligibility,
applicability, exception, authority precedence, recommended pathway, or any
other legal conclusion. The map is navigation metadata, not legal evidence.

## Validation and limitations

The deterministic verifier checks IDs, edge endpoints, allowed relation names,
single provision ownership, occurrence/provenance metadata, manifest counts,
artifact hashes, deterministic rebuild equality, and independent-oracle
equality. Candidate accounting distinguishes accepted structural occurrences,
rejected candidate shapes and their reasons, ambiguous/conflicting candidates,
explicit `Clause` metadata headings, and duplicate source occurrences.
Focused tests cover contents/schedule boundaries including metadata-heading
false positives, ownership conflicts, duplicate occurrences, wrapped
cross-reference rejection, explicit references, ambiguity, locator
compatibility, forbidden relations, serialization, read-only queries, and
independent-oracle detection of incomplete/misowned/misordered inventories,
cross-source boundary leakage, and incorrect NEXT/PREVIOUS edges.

The sidecar does not prove that a reference is legally applicable, current, or
authoritative. It does not discover implicit dependencies, resolve every
possible legislative-instrument form, or replace research across the Act,
Regulations, other Schedules, transitional provisions, case law, tribunal
material, or current operational guidance. Absence from this artifact is
positive-only navigation coverage information and is never a negative legal
finding.

## Read-only inspection

Examples:

```bash
PYTHONPATH=. /home/rico/anaconda3/envs/torch/bin/python \
  scripts/inspect_experimental_schedule2_navigation_sidecar.py --subclass 500

PYTHONPATH=. /home/rico/anaconda3/envs/torch/bin/python \
  scripts/inspect_experimental_schedule2_navigation_sidecar.py \
  --provision 500.212 --references-only
```

The utility is not registered as an agent tool.

## Future A/B evaluation boundary

If separately approved, an evaluation can compare two bounded conditions on
the same held-out questions and source/evidence budgets:

1. Luna baseline;
2. Luna given sidecar navigation hints, while still requiring Luna to obtain
   genuine evidence through the existing approved retrieval/web paths.

The sidecar must remain an experimental input to that evaluation until recall,
false-navigation, latency/cost, citation-integrity, and regression results
are reviewed. The compact checker must continue to evaluate claims against
request-scoped evidence, never against graph edges alone. No serving-path
integration is part of this experiment.
