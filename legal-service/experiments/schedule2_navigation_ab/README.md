# Schedule-2 navigation A/B

This is an isolated evaluation harness, not serving integration. It compares
the same default Luna research configuration with and without a compact
appendix containing only explicit sidecar navigation relationships.

Offline mode is the default and writes paired manual-scoring records without
network, model, database, or checker calls. It validates the case set, sidecar
lookups, hint safety, and output contract. Live mode uses the existing Luna
shadow runtime and keeps the same runtime configuration for both arms; the
only input difference is the navigation appendix.

The graph is navigation metadata only. It is never treated as legal evidence.
The manual fields are intentionally left blank for lawyer/reviewer scoring:

- relevant legal branches found;
- missed explicit Schedule-2 references;
- unsupported material legal claims;
- latency.

No production module imports this package.
