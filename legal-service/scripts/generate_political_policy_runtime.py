"""Compile the reviewed local political-policy YAML into the tracked runtime asset.

The YAML remains deliberately ignored.  This script is the only policy compiler:
it converts that reviewed source into the compact Aho-Corasick asset consumed by
both the browser and FastAPI implementations.  The public browser asset is not
secret; its compact form simply avoids maintaining/shipping a second hand-written
policy dictionary.
"""

from __future__ import annotations

import argparse
from collections import deque
import hashlib
import json
from pathlib import Path
import re
import subprocess
import unicodedata
from typing import Any

import yaml


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_POLICY_PATH = REPOSITORY_ROOT / "doc/local-codex-specs/v2.1.1/political_policy.yaml"
DEFAULT_OUTPUT_PATH = REPOSITORY_ROOT / "chatbot/lib/political-gate/policy.runtime.json"

ZERO_WIDTH_CHARACTERS = {
    "ZERO_WIDTH_SPACE": "\u200b",
    "ZERO_WIDTH_NON_JOINER": "\u200c",
    "ZERO_WIDTH_JOINER": "\u200d",
    "WORD_JOINER": "\u2060",
    "BYTE_ORDER_MARK": "\ufeff",
}
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")
ASCII_WORD_RE = re.compile(r"[a-z0-9]")


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )


def policy_hash(policy: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(policy)).hexdigest()


def is_cjk(char: str) -> bool:
    return bool(CJK_RE.fullmatch(char))


def normalize_text(text: str, normalization: dict[str, Any]) -> str:
    """Mirror the lightweight browser/backend normalization contract exactly."""

    value = unicodedata.normalize("NFKC", text)
    if normalization.get("ascii_lowercase", False):
        value = "".join(char.lower() if "A" <= char <= "Z" else char for char in value)

    removed = {
        ZERO_WIDTH_CHARACTERS[name]
        for name in normalization.get("remove_characters", [])
        if name in ZERO_WIDTH_CHARACTERS
    }
    value = "".join(char for char in value if char not in removed)

    separator_config = normalization.get("normalize_separators", {})
    separators = set(separator_config.get("separators", []))
    separator_obfuscation = normalization.get("separator_obfuscation", {})
    max_cjk_separators = int(
        separator_obfuscation.get("maximum_separators_between_cjk_characters", 0)
    )
    compact_cjk = bool(separator_obfuscation.get("enabled", False))

    def is_separator(char: str) -> bool:
        return char.isspace() or (separator_config.get("enabled", False) and char in separators)

    normalized: list[str] = []
    index = 0
    while index < len(value):
        char = value[index]
        if not is_separator(char):
            normalized.append(char)
            index += 1
            continue

        end = index
        while end < len(value) and is_separator(value[end]):
            end += 1

        previous = normalized[-1] if normalized else ""
        following = value[end] if end < len(value) else ""
        separator_count = end - index
        should_compact = (
            compact_cjk
            and separator_count <= max_cjk_separators
            and bool(previous)
            and bool(following)
            and is_cjk(previous)
            and is_cjk(following)
        )
        if not should_compact and normalized and normalized[-1] != " ":
            normalized.append(" ")
        index = end

    return "".join(normalized).strip()


def requires_ascii_word_boundary(value: str) -> bool:
    return bool(value) and (
        bool(ASCII_WORD_RE.fullmatch(value[0])) or bool(ASCII_WORD_RE.fullmatch(value[-1]))
    )


def traditional_variants(values: list[str]) -> dict[str, set[str]]:
    """Derive Hant/Hans aliases from ICU, at compile time only.

    The approved policy contains a shared ``zh`` list rather than a separate
    conversion table.  ICU's deterministic Hans/Hant transliterators generate
    policy-term variants without adding new terms or a runtime dependency.
    """

    chinese_values = [value for value in values if CJK_RE.search(value)]
    variants = {value: {value} for value in values}
    if not chinese_values:
        return variants

    for transliterator in ("Simplified-Traditional", "Traditional-Simplified"):
        process = subprocess.run(
            ["uconv", "-x", transliterator],
            input="\n".join(chinese_values),
            text=True,
            capture_output=True,
            check=False,
        )
        if process.returncode != 0:
            raise RuntimeError(
                "ICU uconv is required to compile approved Simplified/Traditional "
                f"policy aliases: {process.stderr.strip()}"
            )
        converted = process.stdout.splitlines()
        if len(converted) != len(chinese_values):
            raise RuntimeError("ICU conversion changed the policy-term line count")
        for source, converted_value in zip(chinese_values, converted, strict=True):
            variants[source].add(converted_value)
    return variants


def append_pattern(
    patterns: list[dict[str, Any]],
    *,
    value: str,
    kind: str,
    owner: str,
    normalization: dict[str, Any],
) -> None:
    normalized = normalize_text(value, normalization)
    if not normalized:
        return
    patterns.append(
        {
            "kind": kind,
            "owner": owner,
            "value": normalized,
            "word_boundary": requires_ascii_word_boundary(normalized),
        }
    )


def build_patterns(policy: dict[str, Any]) -> list[dict[str, Any]]:
    normalization = policy["normalization"]
    source_patterns: list[tuple[str, str, str]] = []

    for hard_rule in policy.get("hard_rules", []):
        for aliases in hard_rule.get("aliases", {}).values():
            for alias in aliases:
                source_patterns.append(("hard", hard_rule["id"], alias))

    for dictionary_name, aliases_by_language in policy.get("dictionaries", {}).items():
        for aliases in aliases_by_language.values():
            for alias in aliases:
                source_patterns.append(("dictionary", dictionary_name, alias))

    for exception in policy.get("contextual_allow_exceptions", []):
        for aliases in exception.get("phrases", {}).values():
            for alias in aliases:
                source_patterns.append(("allow_exception", exception["id"], alias))

    for aliases in policy.get("never_standalone_block", {}).values():
        for alias in aliases:
            source_patterns.append(("never_standalone", "never_standalone", alias))

    variants = traditional_variants([source for _, _, source in source_patterns])
    patterns: list[dict[str, Any]] = []
    for kind, owner, source in source_patterns:
        for variant in sorted(variants[source]):
            append_pattern(
                patterns,
                value=variant,
                kind=kind,
                owner=owner,
                normalization=normalization,
            )

    # Equal variants must retain every owning rule/dictionary, but exact duplicate
    # output records are redundant and needlessly inflate the browser asset.
    unique: dict[tuple[str, str, str, bool], dict[str, Any]] = {}
    for pattern in patterns:
        key = (
            pattern["kind"],
            pattern["owner"],
            pattern["value"],
            pattern["word_boundary"],
        )
        unique[key] = pattern
    return [
        unique[key]
        for key in sorted(
            unique,
            key=lambda item: (item[0], item[1], item[2], item[3]),
        )
    ]


def build_automaton(
    patterns: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    nodes: list[dict[str, Any]] = [{"next": {}, "fail": 0, "out": []}]
    runtime_patterns: list[dict[str, Any]] = []

    for index, pattern in enumerate(patterns):
        node_index = 0
        value = pattern.pop("value")
        for char in value:
            next_nodes = nodes[node_index]["next"]
            if char not in next_nodes:
                next_nodes[char] = len(nodes)
                nodes.append({"next": {}, "fail": 0, "out": []})
            node_index = next_nodes[char]
        nodes[node_index]["out"].append(index)
        runtime_patterns.append({**pattern, "length": len(value)})

    queue: deque[int] = deque()
    for child in nodes[0]["next"].values():
        queue.append(child)
        nodes[child]["fail"] = 0

    while queue:
        current = queue.popleft()
        for char, child in nodes[current]["next"].items():
            queue.append(child)
            failure = nodes[current]["fail"]
            while failure and char not in nodes[failure]["next"]:
                failure = nodes[failure]["fail"]
            nodes[child]["fail"] = nodes[failure]["next"].get(char, 0)
            nodes[child]["out"].extend(nodes[nodes[child]["fail"]]["out"])

    serialized_nodes = [
        {
            "next": [[char, target] for char, target in sorted(node["next"].items())],
            "fail": node["fail"],
            "out": sorted(node["out"]),
        }
        for node in nodes
    ]
    return serialized_nodes, runtime_patterns


def build_runtime_asset(policy_document: dict[str, Any]) -> dict[str, Any]:
    policy = policy_document["policy"]
    patterns = build_patterns(policy)
    nodes, runtime_patterns = build_automaton(patterns)
    contextual_rules = []
    for rule in policy.get("contextual_rules", []):
        groups = [group["dictionary"] for group in rule["all"]]
        if len(groups) != 2:
            raise ValueError(
                "the v1 bounded contextual matcher requires exactly two dictionary groups "
                f"for {rule['id']}"
            )
        contextual_rules.append(
            {
                "id": rule["id"],
                "groups": groups,
                "proximity_chars": int(rule["proximity_chars"]),
            }
        )
    return {
        "schema_version": "immigration_ai.political_gate.runtime.v1",
        "policy_id": policy["id"],
        "policy_version": str(policy["version"]),
        "policy_hash": policy_hash(policy),
        "default_decision": policy["default_decision"].lower(),
        "normalization": policy["normalization"],
        "blocked_response": {
            "zh": policy["blocked_response"]["zh"].strip(),
            "en": policy["blocked_response"]["en"].strip(),
        },
        "contextual_rules": contextual_rules,
        "contextual_allow_exceptions": [
            {
                "id": exception["id"],
                "applies_only_if": exception.get("applies_only_if", {}),
            }
            for exception in policy.get("contextual_allow_exceptions", [])
        ],
        "runtime": {
            "benchmark_lengths_chars": policy["runtime"]["benchmark_lengths_chars"],
            "latency_targets_ms": policy["runtime"]["latency_targets_ms"],
        },
        "automaton": {"nodes": nodes, "patterns": runtime_patterns},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--policy", type=Path, default=DEFAULT_POLICY_PATH)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail if the tracked runtime asset differs from this policy compilation",
    )
    args = parser.parse_args()

    source = yaml.safe_load(args.policy.read_text(encoding="utf-8"))
    if not isinstance(source, dict) or not isinstance(source.get("policy"), dict):
        raise SystemExit("policy YAML must contain a top-level policy object")

    runtime = build_runtime_asset(source)
    rendered = json.dumps(runtime, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
    if args.check:
        existing = args.output.read_text(encoding="utf-8") if args.output.exists() else ""
        if existing != rendered:
            raise SystemExit("compiled policy runtime asset is stale; rerun without --check")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    print(
        "compiled "
        f"{runtime['policy_id']}@{runtime['policy_version']} "
        f"hash={runtime['policy_hash']} nodes={len(runtime['automaton']['nodes'])} "
        f"patterns={len(runtime['automaton']['patterns'])}"
    )


if __name__ == "__main__":
    main()
