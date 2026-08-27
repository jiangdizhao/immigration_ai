import runtimeJson from "./policy.runtime.json";

export type PoliticalGateDecision = "allow" | "block";
export type PoliticalGateLocale = "en" | "zh" | "mixed" | "other";

type PatternKind =
  | "hard"
  | "dictionary"
  | "allow_exception"
  | "never_standalone";

type RuntimePattern = {
  kind: PatternKind;
  length: number;
  owner: string;
  word_boundary: boolean;
};

type RuntimeNode = {
  fail: number;
  next: [string, number][];
  out: number[];
};

type RuntimeAsset = {
  automaton: {
    nodes: RuntimeNode[];
    patterns: RuntimePattern[];
  };
  blocked_response: { en: string; zh: string };
  contextual_rules: { groups: string[]; proximity_chars: number }[];
  normalization: {
    ascii_lowercase: boolean;
    normalize_separators: { enabled: boolean; separators: string[] };
    remove_characters: string[];
    separator_obfuscation: {
      enabled: boolean;
      maximum_separators_between_cjk_characters: number;
    };
  };
  policy_hash: string;
  policy_version: string;
};

export type PoliticalGateTimings = {
  contextEvaluationMs: number;
  normalizationMs: number;
  patternMatchingMs: number;
  totalMs: number;
};

export type PoliticalGateResult = {
  decision: PoliticalGateDecision;
  decisionId: string;
  locale: PoliticalGateLocale;
  policyHash: string;
  policyVersion: string;
  timings: PoliticalGateTimings;
};

export type PoliticalGateBlockedResponse = {
  responseLanguage: "en" | "zh";
  text: string;
};

type PatternMatch = {
  end: number;
  pattern: RuntimePattern;
  start: number;
};

// JSON modules are inferred as generic nested arrays rather than the tuple
// shape emitted by the policy compiler.  The asset is generated and validated
// at build time, so this is a boundary cast rather than a second schema.
const matcherInitializationStarted = performance.now();
const runtime = runtimeJson as unknown as RuntimeAsset;
const transitions = runtime.automaton.nodes.map(
  (node) => new Map<string, number>(node.next)
);
const failures = runtime.automaton.nodes.map((node) => node.fail);
const outputs = runtime.automaton.nodes.map((node) => node.out);
const removedCharacters = new Set(
  runtime.normalization.remove_characters.flatMap((name) => {
    const values: Record<string, string> = {
      BYTE_ORDER_MARK: "\ufeff",
      WORD_JOINER: "\u2060",
      ZERO_WIDTH_JOINER: "\u200d",
      ZERO_WIDTH_NON_JOINER: "\u200c",
      ZERO_WIDTH_SPACE: "\u200b",
    };
    return values[name] ? [values[name]] : [];
  })
);
const separators = new Set(
  runtime.normalization.normalize_separators.separators
);
/** One-time browser-side Aho-Corasick structure construction time. */
export const politicalGateInitializationMs =
  performance.now() - matcherInitializationStarted;
let fallbackDecisionCounter = 0;

function now(): number {
  return performance.now();
}

function isCjk(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x34_00 && code <= 0x4d_bf) ||
    (code >= 0x4e_00 && code <= 0x9f_ff) ||
    (code >= 0xf9_00 && code <= 0xfa_ff)
  );
}

function isAsciiWord(char: string): boolean {
  return (char >= "a" && char <= "z") || (char >= "0" && char <= "9");
}

function isSeparator(char: string): boolean {
  return (
    char.trim().length === 0 ||
    (runtime.normalization.normalize_separators.enabled && separators.has(char))
  );
}

function asciiLowercase(text: string): string {
  let result = "";
  for (const char of text) {
    result += char >= "A" && char <= "Z" ? char.toLowerCase() : char;
  }
  return result;
}

/** The browser mirror of the generated policy's deterministic normalization. */
export function normalizePoliticalText(text: string): string {
  const value = runtime.normalization.ascii_lowercase
    ? asciiLowercase(text.normalize("NFKC"))
    : text.normalize("NFKC");
  const withoutZeroWidth = Array.from(value).filter(
    (char) => !removedCharacters.has(char)
  );
  const normalized: string[] = [];
  let index = 0;

  while (index < withoutZeroWidth.length) {
    const char = withoutZeroWidth[index];
    if (!isSeparator(char)) {
      normalized.push(char);
      index += 1;
      continue;
    }

    let end = index;
    while (
      end < withoutZeroWidth.length &&
      isSeparator(withoutZeroWidth[end])
    ) {
      end += 1;
    }
    const previous = normalized.at(-1) ?? "";
    const following = withoutZeroWidth[end] ?? "";
    const compact =
      runtime.normalization.separator_obfuscation.enabled &&
      end - index <=
        runtime.normalization.separator_obfuscation
          .maximum_separators_between_cjk_characters &&
      isCjk(previous) &&
      isCjk(following);
    if (!compact && normalized.length > 0 && previous !== " ") {
      normalized.push(" ");
    }
    index = end;
  }

  return normalized.join("").trim();
}

function findMatches(normalized: string): PatternMatch[] {
  const matches: PatternMatch[] = [];
  let state = 0;
  const chars = Array.from(normalized);
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    while (state !== 0 && !transitions[state].has(char)) {
      state = failures[state];
    }
    state = transitions[state].get(char) ?? 0;
    for (const patternIndex of outputs[state]) {
      const pattern = runtime.automaton.patterns[patternIndex];
      const start = index - pattern.length + 1;
      const end = index + 1;
      if (
        pattern.word_boundary &&
        ((start > 0 && isAsciiWord(chars[start - 1])) ||
          (end < chars.length && isAsciiWord(chars[end])))
      ) {
        continue;
      }
      matches.push({ end, pattern, start });
    }
  }
  return matches;
}

function matchDistance(left: PatternMatch, right: PatternMatch): number {
  if (left.end < right.start) {
    return right.start - left.end;
  }
  if (right.end < left.start) {
    return left.start - right.end;
  }
  return 0;
}

function overlaps(left: PatternMatch, right: PatternMatch): boolean {
  return left.start < right.end && right.start < left.end;
}

function groupsWithinProximity(
  leftMatches: PatternMatch[],
  rightMatches: PatternMatch[],
  proximity: number
): boolean {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftMatches.length && rightIndex < rightMatches.length) {
    const left = leftMatches[leftIndex];
    const right = rightMatches[rightIndex];
    if (matchDistance(left, right) <= proximity) {
      return true;
    }
    if (left.end < right.start) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }
  return false;
}

function hasContextualBlock(matches: PatternMatch[]): boolean {
  const byDictionary = new Map<string, PatternMatch[]>();
  const allowExceptions = matches.filter(
    (match) => match.pattern.kind === "allow_exception"
  );
  for (const match of matches) {
    if (match.pattern.kind !== "dictionary") {
      continue;
    }
    // An exact approved false-positive phrase only protects the dictionary
    // text it contains.  It cannot become a broad safe-word bypass for an
    // unrelated contextual rule elsewhere in the submission.
    if (allowExceptions.some((exception) => overlaps(match, exception))) {
      continue;
    }
    const current = byDictionary.get(match.pattern.owner) ?? [];
    current.push(match);
    byDictionary.set(match.pattern.owner, current);
  }

  return runtime.contextual_rules.some((rule) => {
    const [leftGroup, rightGroup] = rule.groups;
    const leftMatches = byDictionary.get(leftGroup) ?? [];
    const rightMatches = byDictionary.get(rightGroup) ?? [];
    return (
      leftMatches.length > 0 &&
      rightMatches.length > 0 &&
      groupsWithinProximity(leftMatches, rightMatches, rule.proximity_chars)
    );
  });
}

function detectLocale(text: string): PoliticalGateLocale {
  const hasCjk = Array.from(text).some(isCjk);
  const hasAscii = Array.from(text).some(
    (char) => (char >= "A" && char <= "Z") || (char >= "a" && char <= "z")
  );
  if (hasCjk && hasAscii) {
    return "mixed";
  }
  if (hasCjk) {
    return "zh";
  }
  if (hasAscii) {
    return "en";
  }
  return "other";
}

function newDecisionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackDecisionCounter += 1;
  return `political-gate-${Date.now()}-${fallbackDecisionCounter}`;
}

/** Evaluate one raw message without returning any match/rule/source text. */
export function evaluatePoliticalText(text: string): PoliticalGateResult {
  const totalStarted = now();
  const normalized = normalizePoliticalText(text);
  const normalizedFinished = now();
  const matches = findMatches(normalized);
  const matchedFinished = now();
  const hardBlocked = matches.some((match) => match.pattern.kind === "hard");
  const blocked = hardBlocked || hasContextualBlock(matches);
  const contextFinished = now();

  return {
    decision: blocked ? "block" : "allow",
    decisionId: newDecisionId(),
    locale: detectLocale(text),
    policyHash: runtime.policy_hash,
    policyVersion: runtime.policy_version,
    timings: {
      contextEvaluationMs: contextFinished - matchedFinished,
      normalizationMs: normalizedFinished - totalStarted,
      patternMatchingMs: matchedFinished - normalizedFinished,
      totalMs: contextFinished - totalStarted,
    },
  };
}

export function blockedResponseForLocale(
  locale: PoliticalGateLocale
): PoliticalGateBlockedResponse {
  const responseLanguage = locale === "zh" || locale === "mixed" ? "zh" : "en";
  return {
    responseLanguage,
    text: runtime.blocked_response[responseLanguage],
  };
}

function collectUntrustedStrings(
  value: unknown,
  strings: string[],
  seen = new WeakSet<object>()
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "string") {
    strings.push(value);
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const child of value) {
      collectUntrustedStrings(child, strings, seen);
    }
    return;
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      strings.push(key);
      collectUntrustedStrings(child, strings, seen);
    }
  }
}

function collectMessageCarrierStrings(
  messages: unknown,
  strings: string[],
  currentOnly = false
): void {
  if (!Array.isArray(messages)) {
    collectUntrustedStrings(messages, strings);
    return;
  }

  const messagesToScan = currentOnly
    ? [
        [...messages]
          .reverse()
          .find(
            (message) =>
              typeof message === "object" &&
              message !== null &&
              (message as Record<string, unknown>).role === "user"
          ),
      ]
    : messages;

  for (const message of messagesToScan) {
    if (message === undefined) {
      continue;
    }
    if (typeof message === "object" && message !== null) {
      const record = message as Record<string, unknown>;
      if (typeof record.text === "string") {
        strings.push(record.text);
      }
      if (Array.isArray(record.parts)) {
        const textParts = record.parts.flatMap((part) => {
          if (
            typeof part === "object" &&
            part !== null &&
            (part as Record<string, unknown>).type === "text" &&
            typeof (part as Record<string, unknown>).text === "string"
          ) {
            return [(part as Record<string, string>).text];
          }
          return [];
        });
        if (textParts.length > 0) {
          // Widget routes join text parts before forwarding them. Evaluate the
          // same carrier so splitting a phrase across parts cannot bypass the
          // Next.js defence-in-depth gate.
          strings.push(textParts.join("\n"));
        }
      }
    }
    collectUntrustedStrings(message, strings);
  }
}

/**
 * Guard the current client-controlled submission carriers.  Historical
 * messages are conversational context, not a new submission: scanning them
 * here would make a previously blocked turn sticky across the session.
 */
export function evaluateWidgetSubmission(input: {
  currentIntakeFacts?: unknown;
  intakeFacts?: unknown;
  messages?: unknown;
  question?: string;
}): PoliticalGateResult {
  const strings = [input.question ?? ""];
  collectMessageCarrierStrings(input.messages, strings, true);
  // `intakeFacts` is retained as a compatibility fallback for direct callers
  // that submit no message envelope.  Once a message history is present, it
  // is carried context and only the explicit current carrier is scanned.
  const compatibilityFacts =
    input.currentIntakeFacts !== undefined
      ? input.currentIntakeFacts
      : Array.isArray(input.messages) && input.messages.length > 0
        ? undefined
        : input.intakeFacts;
  collectUntrustedStrings(compatibilityFacts, strings);
  let lastResult = evaluatePoliticalText("");
  for (const value of strings) {
    const result = evaluatePoliticalText(value);
    if (result.decision === "block") {
      return result;
    }
    lastResult = result;
  }
  return lastResult;
}

/** Remove blocked raw content from carried message history before model use. */
export function sanitizePoliticalHistory(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.filter((message) => {
    const strings: string[] = [];
    collectMessageCarrierStrings([message], strings);
    return !strings.some(
      (value) => evaluatePoliticalText(value).decision === "block"
    );
  });
}

export const politicalGateIdentity = Object.freeze({
  policyHash: runtime.policy_hash,
  policyVersion: runtime.policy_version,
});
