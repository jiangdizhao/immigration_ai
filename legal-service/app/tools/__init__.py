"""Phase 4B — Common tool foundation.

This package contains tool implementations and contracts for the v2.1.1
agent architecture.  These tools are DORMANT from the customer-facing
runtime until later phases explicitly enable them.

Tools implemented:
- exact_legal_lookup: Coverage-aware exact legal source lookup
- deterministic_utility: Decimal/date/unit calculations
- flat_rag_search: Transitional wrapper around existing RetrievalService

The tools do NOT:
- Make LLM calls
- Make web calls (web search is Phase 5)
- Mutate canonical data
- Perform query-time ingestion
"""

from app.tools.base import ToolContext, ToolExecutionError

__all__ = ["ToolContext", "ToolExecutionError"]