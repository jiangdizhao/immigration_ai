/**
 * Public, content-free projection of the Default AgentRuntime telemetry.
 *
 * The backend keeps this data in retrieval_debug.  Widget routes must retain
 * their legacy normalized fields, so this helper adds one stable namespace
 * without forwarding arbitrary debug keys, prompts, tool output, or private
 * review content.
 */

type UnknownRecord = Record<string, any>;

function pick(source: UnknownRecord, keys: string[]): UnknownRecord {
  return Object.fromEntries(
    keys
      .filter((key) => key in source)
      .map((key) => [key, source[key]])
  );
}

function projectCheckerDecisions(value: unknown): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, 100)
    .filter((item): item is UnknownRecord => Boolean(item) && typeof item === "object")
    .map((item) =>
      pick(item, ["claim_id", "verdict", "reason_codes", "evidence_refs"])
    );
}

export function defaultAgentRuntimeDebug(
  retrievalDebug: UnknownRecord | null | undefined
): UnknownRecord | null {
  const debug = retrievalDebug ?? {};
  const nested =
    (debug.default_agent_runtime as UnknownRecord | undefined) ??
    (debug.defaultAgentRuntime as UnknownRecord | undefined) ??
    (debug.agent_runtime_serving === true ? debug : null);

  if (!nested || nested.agent_runtime_serving !== true) {
    return null;
  }

  const result: UnknownRecord = {
    ...pick(nested, [
      "agent_runtime_serving",
      "runtime_architecture",
      "model",
      "reasoning_effort",
      "experiment_arm",
      "legacy_pfvd_skipped",
      "fallback_to_pfvd",
    ]),
    tool_policy: nested.tool_policy
      ? pick(nested.tool_policy, [
          "tool_choice",
          "max_tool_rounds",
          "max_provider_calls",
          "max_retries",
          "max_flat_rag_calls",
          "native_web_enabled",
          "flat_rag_enabled",
          "exact_lookup_enabled",
          "graph_navigation_only",
        ])
      : null,
    evidence_registry: nested.evidence_registry
      ? pick(nested.evidence_registry, [
          "request_scoped",
          "total_refs",
          "canonical_local_refs",
          "native_web_refs",
          "graph_evidence_count",
        ])
      : null,
    reasoning_bank: nested.reasoning_bank
      ? pick(nested.reasoning_bank, [
          "mode",
          "bank_namespace",
          "retrieval_status",
          "guidance_injected",
          "selected_rule_keys",
          "selected_rule_versions",
          "relevance_scores",
          "error_code",
        ])
      : null,
    checker: nested.checker
      ? pick(nested.checker, [
          "status",
          "provider_call_count",
          "tool_call_count",
          "checker_error_code",
          "checker_latency_ms",
          "checker_timeout_allocated_ms",
          "checker_remaining_budget_before_ms",
          "checker_remaining_budget_after_ms",
          "customer_text_mutated",
        ])
      : null,
    checker_packet: nested.checker_packet
      ? pick(nested.checker_packet, [
          "material_claim_count",
          "checker_evidence_count",
          "canonical_local_count",
          "native_web_count",
          "evidence_with_backend_text_count",
          "checker_evidence_text_chars",
          "matter_fact_chars",
          "serialized_packet_chars",
        ])
      : null,
    execution_metrics: nested.execution_metrics ?? null,
  };

  if (nested.checker && typeof nested.checker === "object") {
    result.checker = {
      ...result.checker,
      keep_count: nested.checker.keep_count,
      flag_count: nested.checker.flag_count,
      block_count: nested.checker.block_count,
      dependency_block_count: nested.checker.dependency_block_count,
      material_omission_suspected: nested.checker.material_omission_suspected,
      material_omission_evidence_refs: Array.isArray(
        nested.checker.material_omission_evidence_refs
      )
        ? nested.checker.material_omission_evidence_refs.slice(0, 30)
        : [],
      decisions: projectCheckerDecisions(nested.checker.decisions),
    };
  }

  return result;
}
