import assert from "node:assert/strict";
import test from "node:test";
import { defaultAgentRuntimeDebug } from "./default-agent-runtime-debug";

test("projects Default AgentRuntime telemetry into the stable public namespace", () => {
  const projected = defaultAgentRuntimeDebug({
    agent_runtime_serving: true,
    runtime_architecture: "phase2.default_agent_runtime",
    model: "gpt-5.6-luna",
    reasoning_effort: "low",
    experiment_arm: "N",
    legacy_pfvd_skipped: true,
    fallback_to_pfvd: false,
    tool_policy: {
      tool_choice: "auto",
      max_tool_rounds: 2,
      max_provider_calls: 3,
      max_retries: 1,
      max_flat_rag_calls: 1,
      native_web_enabled: true,
      flat_rag_enabled: true,
      exact_lookup_enabled: true,
      graph_navigation_only: true,
      prompt: "must not escape",
    },
    evidence_registry: {
      request_scoped: true,
      total_refs: 2,
      canonical_local_refs: 1,
      native_web_refs: 1,
      graph_evidence_count: 0,
    },
    reasoning_bank: {
      mode: "shadow",
      guidance_injected: false,
      selected_rule_keys: ["bounded_research"],
      private_source_case: "must not escape",
    },
    checker: {
      status: "failed",
      provider_call_count: 1,
      tool_call_count: 0,
      checker_error_code: "provider_timeout",
      checker_latency_ms: 8001,
      checker_timeout_allocated_ms: 8000,
      checker_remaining_budget_before_ms: 9000,
      checker_remaining_budget_after_ms: 1000,
      customer_text_mutated: false,
      keep_count: 2,
      flag_count: 3,
      block_count: 0,
      dependency_block_count: 0,
      material_omission_suspected: true,
      material_omission_evidence_refs: ["exact:ref"],
      decisions: [
        {
          claim_id: "claim-1",
          verdict: "FLAG",
          reason_codes: ["INSUFFICIENT_SUPPORT"],
          evidence_refs: ["exact:ref"],
          claim_text: "must not escape",
          claim_type: "legal_rule",
        },
      ],
    },
    checker_packet: {
      material_claim_count: 1,
      checker_evidence_count: 1,
      canonical_local_count: 1,
      native_web_count: 0,
      evidence_with_backend_text_count: 1,
      checker_evidence_text_chars: 42,
      matter_fact_chars: 12,
      serialized_packet_chars: 500,
      evidence: [{ evidence_ref: "exact:ref", text: "must not escape" }],
    },
    phase6: {
      decisions: [{ claim_text: "must not escape", text: "must not escape" }],
    },
    execution_metrics: {
      native_web_search_call_count: 1,
      flat_rag_call_count: 1,
      schedule2_navigation_call_count: 1,
      exact_lookup_call_count: 1,
      utility_call_count: 0,
      provider_api_call_count: 2,
      tool_round_count: 1,
      submit_answer_call_count: 1,
    },
    secret: "must not escape",
  });

  assert.equal(projected?.agent_runtime_serving, true);
  assert.equal(projected?.legacy_pfvd_skipped, true);
  assert.equal(projected?.checker.status, "failed");
  assert.equal(projected?.checker.checker_error_code, "provider_timeout");
  assert.equal(projected?.checker.keep_count, 2);
  assert.equal(projected?.checker.flag_count, 3);
  assert.deepEqual(projected?.checker.decisions, [
    {
      claim_id: "claim-1",
      verdict: "FLAG",
      reason_codes: ["INSUFFICIENT_SUPPORT"],
      evidence_refs: ["exact:ref"],
    },
  ]);
  assert.equal(projected?.checker_packet.evidence_with_backend_text_count, 1);
  assert.equal("evidence" in projected!.checker_packet, false);
  assert.equal("phase6" in projected!, false);
  assert.equal(projected?.evidence_registry.graph_evidence_count, 0);
  assert.equal(projected?.execution_metrics.provider_api_call_count, 2);
  assert.equal("secret" in projected!, false);
  assert.equal("prompt" in projected!.tool_policy, false);
  assert.equal("private_source_case" in projected!.reasoning_bank, false);
});

test("does not add a Default namespace to Premium or legacy debug payloads", () => {
  assert.equal(defaultAgentRuntimeDebug({}), null);
  assert.equal(
    defaultAgentRuntimeDebug({ premium_direct_answer: { used: true } }),
    null
  );
});
