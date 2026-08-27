"""Deterministic, content-safe political-gate fail-safe for FastAPI.

The browser is the primary gate.  This service is deliberately a local defence
in depth for callers that bypass the browser and Next.js route.  It consumes the
single generated runtime artifact and performs no network, database, model, or
semantic-routing work.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from itertools import chain
import json
import os
from pathlib import Path
import re
from time import perf_counter_ns
from typing import Any, Iterable, Iterator, Literal
from uuid import uuid4


PoliticalDecision = Literal["allow", "block"]
PoliticalLocale = Literal["en", "zh", "mixed", "other"]


@dataclass(frozen=True, slots=True)
class GateTimings:
    normalization_ms: float
    pattern_matching_ms: float
    context_evaluation_ms: float
    total_ms: float


@dataclass(frozen=True, slots=True)
class PoliticalGateResult:
    """Safe-to-forward result; it never contains raw or normalized user text."""

    decision: PoliticalDecision
    policy_version: str
    policy_hash: str
    decision_id: str
    locale: PoliticalLocale
    response_language: Literal["en", "zh"]
    response_text: str
    timings: GateTimings

    def content_free_telemetry(
        self, *, enforcement_layer: Literal["fastapi", "nextjs", "browser"], application_build: str
    ) -> dict[str, str | float]:
        return {
            "decision": self.decision,
            "policy_version": self.policy_version,
            "policy_hash": self.policy_hash,
            "enforcement_layer": enforcement_layer,
            "latency_ms": round(self.timings.total_ms, 4),
            "application_build": application_build,
        }


@dataclass(frozen=True, slots=True)
class _Pattern:
    kind: Literal["hard", "dictionary", "allow_exception", "never_standalone"]
    owner: str
    length: int
    word_boundary: bool


@dataclass(frozen=True, slots=True)
class _Match:
    pattern: _Pattern
    start: int
    end: int


def _is_cjk(char: str) -> bool:
    return (
        "\u3400" <= char <= "\u4dbf" or "\u4e00" <= char <= "\u9fff" or "\uf900" <= char <= "\ufaff"
    )


def _is_ascii_word(char: str) -> bool:
    return "a" <= char <= "z" or "0" <= char <= "9"


class CompiledPoliticalMatcher:
    """A serialized Aho-Corasick automaton with bounded context evaluation."""

    def __init__(self, runtime: dict[str, Any]) -> None:
        self.policy_version = str(runtime["policy_version"])
        self.policy_hash = str(runtime["policy_hash"])
        self.normalization = dict(runtime["normalization"])
        self.blocked_response = dict(runtime["blocked_response"])
        automaton = runtime["automaton"]
        self.transitions: tuple[dict[str, int], ...] = tuple(
            {str(char): int(target) for char, target in node["next"]} for node in automaton["nodes"]
        )
        self.failures: tuple[int, ...] = tuple(int(node["fail"]) for node in automaton["nodes"])
        self.outputs: tuple[tuple[int, ...], ...] = tuple(
            tuple(int(value) for value in node["out"]) for node in automaton["nodes"]
        )
        self.patterns: tuple[_Pattern, ...] = tuple(
            _Pattern(
                kind=pattern["kind"],
                owner=str(pattern["owner"]),
                length=int(pattern["length"]),
                word_boundary=bool(pattern["word_boundary"]),
            )
            for pattern in automaton["patterns"]
        )
        self.contextual_rules: tuple[tuple[tuple[str, ...], int], ...] = tuple(
            (
                tuple(str(group) for group in rule["groups"]),
                int(rule["proximity_chars"]),
            )
            for rule in runtime["contextual_rules"]
        )

        removed_names = self.normalization.get("remove_characters", [])
        zero_width = {
            "ZERO_WIDTH_SPACE": "\u200b",
            "ZERO_WIDTH_NON_JOINER": "\u200c",
            "ZERO_WIDTH_JOINER": "\u200d",
            "WORD_JOINER": "\u2060",
            "BYTE_ORDER_MARK": "\ufeff",
        }
        translation: dict[int, str | None] = {
            ord(zero_width[name]): None for name in removed_names if name in zero_width
        }
        if self.normalization.get("ascii_lowercase", False):
            translation.update({ord(char): char.lower() for char in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"})
        self._normalization_translation = str.maketrans(translation)
        separator_config = self.normalization.get("normalize_separators", {})
        self.normalize_separators = bool(separator_config.get("enabled", False))
        self.separators = frozenset(str(value) for value in separator_config.get("separators", []))
        separator_characters = "".join(re.escape(value) for value in self.separators)
        separator_expression = (
            r"\s" if not self.normalize_separators else rf"(?:\s|[{separator_characters}])"
        )
        self._separator_pattern = re.compile(f"{separator_expression}+")
        obfuscation = self.normalization.get("separator_obfuscation", {})
        self.compact_cjk_separators = bool(obfuscation.get("enabled", False))
        self.max_cjk_separators = int(
            obfuscation.get("maximum_separators_between_cjk_characters", 0)
        )

    @classmethod
    def from_file(cls, path: Path) -> "CompiledPoliticalMatcher":
        return cls(json.loads(path.read_text(encoding="utf-8")))

    def normalize(self, text: str) -> str:
        # ``unicodedata.normalize`` is intentionally imported lazily only once
        # the matching machinery is constructed; it is deterministic/local.
        import unicodedata

        value = unicodedata.normalize("NFKC", text).translate(self._normalization_translation)

        def normalize_separator(match: re.Match[str]) -> str:
            start, end = match.span()
            previous = value[start - 1] if start > 0 else ""
            following = value[end] if end < len(value) else ""
            compact = (
                self.compact_cjk_separators
                and end - start <= self.max_cjk_separators
                and bool(previous)
                and bool(following)
                and _is_cjk(previous)
                and _is_cjk(following)
            )
            return "" if compact else " "

        return self._separator_pattern.sub(normalize_separator, value).strip()

    def _matches(self, normalized: str) -> Iterator[_Match]:
        state = 0
        transitions = self.transitions
        failures = self.failures
        outputs = self.outputs
        patterns = self.patterns
        for index, char in enumerate(normalized):
            target = transitions[state].get(char)
            while state and target is None:
                state = failures[state]
                target = transitions[state].get(char)
            state = 0 if target is None else target
            for pattern_index in outputs[state]:
                pattern = patterns[pattern_index]
                start = index - pattern.length + 1
                end = index + 1
                if pattern.word_boundary and (
                    (start > 0 and _is_ascii_word(normalized[start - 1]))
                    or (end < len(normalized) and _is_ascii_word(normalized[end]))
                ):
                    continue
                yield _Match(pattern=pattern, start=start, end=end)

    @staticmethod
    def _distance(left: _Match, right: _Match) -> int:
        if left.end < right.start:
            return right.start - left.end
        if right.end < left.start:
            return left.start - right.end
        return 0

    @staticmethod
    def _overlaps(left: _Match, right: _Match) -> bool:
        return left.start < right.end and right.start < left.end

    def _has_contextual_block(self, matches: tuple[_Match, ...]) -> bool:
        grouped: dict[str, list[_Match]] = {}
        allow_exceptions = tuple(
            match for match in matches if match.pattern.kind == "allow_exception"
        )
        for match in matches:
            if match.pattern.kind == "dictionary":
                # An exact approved false-positive phrase only protects the
                # dictionary text it contains.  It cannot turn into a broad
                # safe-word bypass for a separate contextual rule elsewhere
                # in the same untrusted submission.
                if any(self._overlaps(match, exception) for exception in allow_exceptions):
                    continue
                grouped.setdefault(match.pattern.owner, []).append(match)

        for required_groups, proximity in self.contextual_rules:
            group_matches = [grouped.get(group, []) for group in required_groups]
            if any(not values for values in group_matches):
                continue
            if self._two_groups_within_proximity(group_matches[0], group_matches[1], proximity):
                return True
        return False

    def _two_groups_within_proximity(
        self, left_matches: list[_Match], right_matches: list[_Match], proximity: int
    ) -> bool:
        """Find the nearest pair in linear time; policy rules have two groups."""

        left_index = 0
        right_index = 0
        while left_index < len(left_matches) and right_index < len(right_matches):
            left = left_matches[left_index]
            right = right_matches[right_index]
            if self._distance(left, right) <= proximity:
                return True
            if left.end < right.start:
                left_index += 1
            else:
                right_index += 1
        return False

    @staticmethod
    def _locale(text: str) -> PoliticalLocale:
        has_cjk = any(_is_cjk(char) for char in text)
        has_ascii = any(("A" <= char <= "Z") or ("a" <= char <= "z") for char in text)
        if has_cjk and has_ascii:
            return "mixed"
        if has_cjk:
            return "zh"
        if has_ascii:
            return "en"
        return "other"

    def evaluate(self, text: str) -> PoliticalGateResult:
        total_started = perf_counter_ns()
        normalized_started = total_started
        normalized = self.normalize(text)
        normalized_finished = perf_counter_ns()
        matches = tuple(self._matches(normalized))
        matched_finished = perf_counter_ns()

        # Hard rules are checked before any exception/context logic.  Match
        # details are intentionally not included in the result or telemetry.
        blocked = any(match.pattern.kind == "hard" for match in matches)
        if not blocked:
            blocked = self._has_contextual_block(matches)
        context_finished = perf_counter_ns()

        locale = self._locale(text)
        response_language: Literal["en", "zh"] = "zh" if locale in {"zh", "mixed"} else "en"
        timings = GateTimings(
            normalization_ms=(normalized_finished - normalized_started) / 1_000_000,
            pattern_matching_ms=(matched_finished - normalized_finished) / 1_000_000,
            context_evaluation_ms=(context_finished - matched_finished) / 1_000_000,
            total_ms=(context_finished - total_started) / 1_000_000,
        )
        return PoliticalGateResult(
            decision="block" if blocked else "allow",
            policy_version=self.policy_version,
            policy_hash=self.policy_hash,
            decision_id=str(uuid4()),
            locale=locale,
            response_language=response_language,
            response_text=str(self.blocked_response[response_language]),
            timings=timings,
        )


def _runtime_asset_path() -> Path:
    configured = os.getenv("POLITICAL_POLICY_RUNTIME_PATH")
    candidates = [Path(configured)] if configured else []
    local_root = Path(__file__).resolve().parents[3]
    candidates.extend(
        [
            local_root / "chatbot/lib/political-gate/policy.runtime.json",
            Path("/app/political-policy/policy.runtime.json"),
        ]
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise RuntimeError("compiled political-policy runtime asset is unavailable")


def _iter_user_strings(value: Any) -> Iterator[str]:
    """Iteratively extract every client-controlled string without recursion.

    A fixed string-count cutoff would let an attacker hide a blocked value after
    otherwise harmless fields. JSON has no cyclic references, but the identity
    guard also makes this safe for in-process callers that provide one.
    """

    pending = [value]
    seen_containers: set[int] = set()
    while pending:
        item = pending.pop()
        if isinstance(item, str):
            yield item
            continue
        if isinstance(item, dict):
            identity = id(item)
            if identity in seen_containers:
                continue
            seen_containers.add(identity)
            for key, child in reversed(tuple(item.items())):
                # Keys can be rendered by legacy structured prompts too.
                if isinstance(key, str):
                    yield key
                pending.append(child)
            continue
        if isinstance(item, (list, tuple)):
            identity = id(item)
            if identity in seen_containers:
                continue
            seen_containers.add(identity)
            pending.extend(reversed(item))


def _iter_frontend_message_strings(messages: Any, *, current_only: bool = False) -> Iterator[str]:
    """Yield current or all forwarded messages and their nested client strings.

    Widget routes serialize text parts by joining them with a newline before
    FastAPI sees them.  Matching that joined carrier prevents a direct caller
    from splitting a hard or contextual phrase over individually harmless
    parts, while the nested traversal still covers arbitrary client fields.
    Historical messages are not a current submission and must not independently
    trigger the gate.
    """

    if not isinstance(messages, list):
        yield from _iter_user_strings(messages)
        return

    selected_messages = (
        [
            next(
                (
                    message
                    for message in reversed(messages)
                    if isinstance(message, dict) and message.get("role") == "user"
                ),
                None,
            )
        ]
        if current_only
        else messages
    )

    for message in selected_messages:
        if message is None:
            continue
        if isinstance(message, dict):
            direct_text = message.get("text")
            if isinstance(direct_text, str):
                yield direct_text

            parts = message.get("parts")
            if isinstance(parts, list):
                text_parts = [
                    part["text"]
                    for part in parts
                    if isinstance(part, dict)
                    and part.get("type") == "text"
                    and isinstance(part.get("text"), str)
                ]
                if text_parts:
                    yield "\n".join(text_parts)

        yield from _iter_user_strings(message)


_REMOVED = object()


def _remove_blocked_values(value: Any, matcher: CompiledPoliticalMatcher) -> Any:
    """Copy client history while dropping values blocked by the local policy."""

    if isinstance(value, str):
        return _REMOVED if matcher.evaluate(value).decision == "block" else value
    if isinstance(value, dict):
        cleaned: dict[Any, Any] = {}
        for key, child in value.items():
            if isinstance(key, str) and matcher.evaluate(key).decision == "block":
                continue
            safe_child = _remove_blocked_values(child, matcher)
            if safe_child is not _REMOVED:
                cleaned[key] = safe_child
        return cleaned
    if isinstance(value, list):
        return [
            safe_child
            for child in value
            if (safe_child := _remove_blocked_values(child, matcher)) is not _REMOVED
        ]
    if isinstance(value, tuple):
        return tuple(
            safe_child
            for child in value
            if (safe_child := _remove_blocked_values(child, matcher)) is not _REMOVED
        )
    return value


class PoliticalFailsafeService:
    """FastAPI wrapper around a process-startup compiled matcher."""

    def __init__(self, matcher: CompiledPoliticalMatcher | None = None) -> None:
        self.matcher = matcher or CompiledPoliticalMatcher.from_file(_runtime_asset_path())

    def evaluate_text(self, text: str) -> PoliticalGateResult:
        return self.matcher.evaluate(text)

    def sanitize_history(self, messages: Any) -> Any:
        """Drop blocked historical message carriers before normal model use."""

        if not isinstance(messages, list):
            return messages
        return [
            message
            for message in messages
            if not any(
                result.decision == "block"
                for result in (
                    self.matcher.evaluate(value)
                    for value in _iter_frontend_message_strings([message])
                )
            )
        ]

    def sanitize_payload_history(self, payload: Any) -> Any:
        """Remove blocked carried history without changing the current turn."""

        update = {
            "frontend_messages": self.sanitize_history(
                getattr(payload, "frontend_messages", [])
            ),
            "intake_facts": _remove_blocked_values(
                getattr(payload, "intake_facts", {}), self.matcher
            ),
        }
        return payload.model_copy(update=update)

    def evaluate_payload(self, payload: Any) -> PoliticalGateResult:
        # Scan only current submission carriers.  Historical carriers are
        # sanitized separately before normal model processing, so they cannot
        # create a sticky block or contaminate a later prompt.
        current_intake_facts = getattr(payload, "current_intake_facts", None)
        frontend_messages = getattr(payload, "frontend_messages", [])
        compatibility_facts = (
            current_intake_facts
            if current_intake_facts is not None
            else (
                getattr(payload, "intake_facts", {})
                if not isinstance(frontend_messages, list) or not frontend_messages
                else None
            )
        )
        values: Iterable[str] = chain(
            [str(getattr(payload, "question", ""))],
            _iter_frontend_message_strings(
                frontend_messages, current_only=True
            ),
            _iter_user_strings(compatibility_facts),
        )
        last_result: PoliticalGateResult | None = None
        for value in values:
            result = self.matcher.evaluate(value)
            if result.decision == "block":
                return result
            last_result = result
        return last_result or self.matcher.evaluate("")


@lru_cache(maxsize=1)
def get_political_failsafe_service() -> PoliticalFailsafeService:
    return PoliticalFailsafeService()
