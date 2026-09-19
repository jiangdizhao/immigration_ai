# Manual Policy Intelligence Curation

This directory is the interim repository-backed editorial source for Policy
Intelligence. It is intentionally empty until a real policy source has been
verified and approved. The registry is server-only; do not import it from a
client component.

Manual workflow:

1. Verify the official source.
2. Add or update a typed repository editorial entry.
3. Start the entry as `draft` or `review_required`.
4. Run the local validation and test commands.
5. Have the lawyer/project owner review the source and analysis.
6. Change `editorialStatus` to `published` only after approval.
7. Inspect the Git diff.
8. Commit and release through the normal project workflow.

Source/legal status and editorial publication status are separate. A proposed
policy remains legally `proposed` even if an approved editorial explanation is
published.

`officialExcerpt` is verbatim source text with its source language. AI
explanation is not official source text. Lawyer commentary is optional and must
only be added when real reviewed commentary exists. There is no automatic
publication and no runtime file editing in production.
