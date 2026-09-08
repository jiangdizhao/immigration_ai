# Fast Answer mode

Fast is the speed-first customer lane. It sends one backend request to the
OpenAI Responses API using configurable `FAST_LUNA_MODEL` (default
`gpt-5.6-luna`) with low reasoning and only the hosted native `web_search`
tool available with `tool_choice=auto`. Luna decides whether to search; Fast
does not force search for greetings or stable questions. Structured native web
source URLs are copied into the normal customer citation shape only when the
Responses result actually returns them.

The public modes are:

| Mode | Meaning |
| --- | --- |
| `fast` | Fast — Quick Answer; Luna direct answer, optional native web search |
| `default` | Slow — Legal Check; existing source-aware Default pipeline |
| `premium` | Premium — Premium Answer; existing Premium implementation and entitlement checks |

Access is enforced in both the mode-access endpoint/UI and the request
boundaries:

| Session | Fast | Slow / Legal Check | Premium |
| --- | --- | --- | --- |
| Guest | allowed | disabled and server-rejected | disabled and server-rejected |
| Registered free | allowed | allowed | disabled and server-rejected |
| VIP | allowed | allowed | allowed |
| Lawyer/admin | existing entitlement semantics | existing registered-user semantics | existing `isPremiumAllowed` semantics |

Fast branches in FastAPI after the political defense-in-depth gate but before
`QueryService` construction, matter/state loading, or any application
research work. `FastDirectLunaService` has no dependency on local retrieval,
Flat-RAG, pgvector, Schedule navigation, graph navigation, exact lookup,
Phase-6 checker, ReasoningBank, PFVD, or an application-managed research loop.
It does not retry through Slow or Premium.

Timeouts are intentionally separate: the default provider budget is 38 s, the
Fast backend absolute deadline is 45 s, and the Next.js Fast transport budget
is 50 s. A provider failure or timeout returns a concise Fast-specific fallback
and never starts another lane. The optional `FAST_LUNA_SERVICE_TIER` setting
is unset by default; no higher-cost tier is enabled here.

Focused coverage includes canonical/legacy mode handling, route selection,
access-policy resolution and stale local-storage recovery, FastAPI early
dispatch, one-call Luna/native-web request shape, structured native URL
normalization, local-tool non-entry, and Fast failure neutrality. Existing
Slow, Premium, political-gate, correlation, billing, and short-input tests
remain part of the repository validation commands.
