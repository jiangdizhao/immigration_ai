/**
 * Phase 12 Stage 3 R1 — pure serialization between the editorial form state and
 * the durable human-revision content contract.
 *
 * Kept free of React and of `server-only` imports so it can be unit-tested as
 * the exact code the workspace component uses. The rules it enforces:
 *
 * - every persisted source reference is loaded and saved (up to the contract
 *   maximum of 8); saving can never silently drop a previously stored
 *   reference;
 * - bilingual content must be genuinely provided in both languages — nothing is
 *   auto-copied from Chinese to English or vice versa;
 * - over-limit or incomplete input is reported as a visible error instead of
 *   being silently truncated;
 * - dates are author-stated and nullable; the form never infers one.
 */

export const EDITORIAL_FORM_NARRATIVE_MAX = 8;
export const EDITORIAL_FORM_SOURCE_REFERENCE_MAX = 8;

export type EditorialBilingual = { "zh-CN": string; en: string };

export type EditorialFormNarrative = {
  id: string;
  text: EditorialBilingual;
};

export type EditorialFormSourceReference = {
  authority: string;
  title: string;
  url: string;
  date: string;
  citation: string;
};

export type EditorialHumanContent = {
  schemaVersion: "policy-intelligence.human-revision.v1";
  title: EditorialBilingual;
  overview: EditorialBilingual;
  keyChanges: EditorialFormNarrative[];
  affectedGroups: EditorialFormNarrative[];
  implications: EditorialFormNarrative[];
  recommendedActions: EditorialFormNarrative[];
  body: EditorialBilingual | null;
  commentary: EditorialBilingual | null;
  attribution: string;
  sourceStatus: string;
  sourceReferences: {
    authority: string;
    title: string;
    url: string;
    date: string | null;
    citation: string | null;
  }[];
  officialSourceDate: string | null;
  commencementDate: string | null;
  reviewedAsOfDate: string | null;
};

export type EditorialFormState = {
  slug: string;
  titleZh: string;
  titleEn: string;
  overviewZh: string;
  overviewEn: string;
  changes: string;
  affectedGroups: string;
  implications: string;
  actions: string;
  bodyZh: string;
  bodyEn: string;
  commentaryZh: string;
  commentaryEn: string;
  attribution: string;
  sourceStatus: string;
  officialSourceDate: string;
  commencementDate: string;
  reviewedAsOfDate: string;
  references: EditorialFormSourceReference[];
  overrideReason: string;
};

export type EditorialFormIssue = {
  /** Form field or section the issue belongs to (for inline display). */
  field: string;
  /** Deterministic, user-displayable bilingual message. */
  message: string;
};

export function emptyEditorialForm(): EditorialFormState {
  return {
    slug: "",
    titleZh: "",
    titleEn: "",
    overviewZh: "",
    overviewEn: "",
    changes: "",
    affectedGroups: "",
    implications: "",
    actions: "",
    bodyZh: "",
    bodyEn: "",
    commentaryZh: "",
    commentaryEn: "",
    attribution: "",
    sourceStatus: "announced",
    officialSourceDate: "",
    commencementDate: "",
    reviewedAsOfDate: "",
    references: [],
    overrideReason: "",
  };
}

function emptyReference(): EditorialFormSourceReference {
  return { authority: "", title: "", url: "", date: "", citation: "" };
}

export function addEditorialFormReference(
  form: EditorialFormState
): EditorialFormState {
  return { ...form, references: [...form.references, emptyReference()] };
}

export function removeEditorialFormReference(
  form: EditorialFormState,
  index: number
): EditorialFormState {
  return {
    ...form,
    references: form.references.filter((_, position) => position !== index),
  };
}

export function updateEditorialFormReference(
  form: EditorialFormState,
  index: number,
  patch: Partial<EditorialFormSourceReference>
): EditorialFormState {
  return {
    ...form,
    references: form.references.map((reference, position) =>
      position === index ? { ...reference, ...patch } : reference
    ),
  };
}

/**
 * Deterministic narrative id derived from the bilingual text. A retried save of
 * unchanged text therefore keeps the same id, so a round trip through the form
 * does not invent new ids for existing entries. Duplicate texts in one section
 * intentionally collide and surface as a visible duplicate-entry error.
 */
export function narrativeIdFor(
  prefix: string,
  text: EditorialBilingual
): string {
  const combined = `${text["zh-CN"]}\u241F${text.en}`;
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < combined.length; index += 1) {
    hash ^= combined.charCodeAt(index);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return `${prefix}-${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Parses one narrative textarea. Each line is `中文 | English` and both parts
 * are required. Nothing is truncated: an over-limit list or a line with a
 * missing language produces an explicit error and the save is refused.
 */
export function parseNarrativeLines(
  value: string,
  options: { prefix: string; field: string }
): {
  units: EditorialFormNarrative[];
  issues: EditorialFormIssue[];
} {
  const issues: EditorialFormIssue[] = [];
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length > EDITORIAL_FORM_NARRATIVE_MAX) {
    issues.push({
      field: options.field,
      message: `最多 ${EDITORIAL_FORM_NARRATIVE_MAX} 条，当前 ${lines.length} 条；请删除多余条目后保存 / At most ${EDITORIAL_FORM_NARRATIVE_MAX} entries (currently ${lines.length}); remove the extra entries before saving`,
    });
    return { units: [], issues };
  }
  const units: EditorialFormNarrative[] = [];
  const seen = new Map<string, number>();
  lines.forEach((line, index) => {
    const separator = line.indexOf("|");
    const zh = (separator >= 0 ? line.slice(0, separator) : line).trim();
    const en = (separator >= 0 ? line.slice(separator + 1) : "").trim();
    if (!zh || !en) {
      issues.push({
        field: options.field,
        message: `第 ${index + 1} 行必须同时提供中文与英文（格式：中文 | English）/ Line ${index + 1} needs both Chinese and English (format: 中文 | English)`,
      });
      return;
    }
    const id = narrativeIdFor(options.prefix, { "zh-CN": zh, en });
    const duplicate = seen.get(id);
    if (duplicate !== undefined) {
      issues.push({
        field: options.field,
        message: `第 ${index + 1} 行与第 ${duplicate} 行内容重复，无法生成唯一标识 / Line ${index + 1} duplicates line ${duplicate}`,
      });
      return;
    }
    seen.set(id, index + 1);
    units.push({ id, text: { "zh-CN": zh, en } });
  });
  return { units, issues };
}

export function formatNarrativeLines(
  units: readonly { text: { "zh-CN": string; en: string } }[] | undefined
): string {
  return (units ?? [])
    .map((unit) => `${unit.text["zh-CN"]} | ${unit.text.en}`)
    .join("\n");
}

function parseOptionalDate(
  value: string,
  field: string,
  issues: EditorialFormIssue[]
): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(trimmed)) {
    issues.push({
      field,
      message: "日期格式必须为 YYYY-MM-DD / Date must use YYYY-MM-DD",
    });
    return null;
  }
  const [year, month, day] = trimmed.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    issues.push({
      field,
      message: "日期无效 / Invalid calendar date",
    });
    return null;
  }
  return trimmed;
}

function parseBilingualField(
  zh: string,
  en: string,
  field: string,
  label: string,
  issues: EditorialFormIssue[]
): EditorialBilingual | null {
  const zhText = zh.trim();
  const enText = en.trim();
  if (!zhText && !enText) {
    return null;
  }
  if (!zhText) {
    issues.push({
      field: `${field}Zh`,
      message: `${label}：缺少中文内容 / ${label}: Chinese text is required`,
    });
  }
  if (!enText) {
    issues.push({
      field: `${field}En`,
      message: `${label}：缺少英文内容 / ${label}: English text is required`,
    });
  }
  if (!zhText || !enText) {
    return null;
  }
  return { "zh-CN": zhText, en: enText };
}

/**
 * Serializes the form into the durable content contract, reporting every
 * problem instead of silently repairing, truncating or translating anything.
 */
export function contentFromEditorialForm(
  form: EditorialFormState
):
  | { status: "ok"; content: EditorialHumanContent }
  | { status: "error"; issues: EditorialFormIssue[] } {
  const issues: EditorialFormIssue[] = [];
  const title = parseBilingualField(
    form.titleZh,
    form.titleEn,
    "title",
    "标题 Title",
    issues
  );
  const overview = parseBilingualField(
    form.overviewZh,
    form.overviewEn,
    "overview",
    "摘要 Summary",
    issues
  );
  const attribution = form.attribution.trim();
  if (attribution.length < 2) {
    issues.push({
      field: "attribution",
      message: "必须填写作者署名 / An author attribution is required",
    });
  }
  const changes = parseNarrativeLines(form.changes, {
    prefix: "change",
    field: "changes",
  });
  const groups = parseNarrativeLines(form.affectedGroups, {
    prefix: "group",
    field: "affectedGroups",
  });
  const implications = parseNarrativeLines(form.implications, {
    prefix: "implication",
    field: "implications",
  });
  const actions = parseNarrativeLines(form.actions, {
    prefix: "action",
    field: "recommendedActions",
  });
  issues.push(
    ...changes.issues,
    ...groups.issues,
    ...implications.issues,
    ...actions.issues
  );
  const body = parseBilingualField(
    form.bodyZh,
    form.bodyEn,
    "body",
    "正文 Body",
    issues
  );
  const commentary = parseBilingualField(
    form.commentaryZh,
    form.commentaryEn,
    "commentary",
    "评论 Commentary",
    issues
  );

  if (form.references.length > EDITORIAL_FORM_SOURCE_REFERENCE_MAX) {
    issues.push({
      field: "references",
      message: `官方来源引用最多 ${EDITORIAL_FORM_SOURCE_REFERENCE_MAX} 条 / At most ${EDITORIAL_FORM_SOURCE_REFERENCE_MAX} official references`,
    });
  }
  const references: EditorialHumanContent["sourceReferences"] = [];
  form.references.forEach((reference, index) => {
    const authority = reference.authority.trim();
    const referenceTitle = reference.title.trim();
    const url = reference.url.trim();
    const citation = reference.citation.trim();
    const hasAny =
      authority || referenceTitle || url || reference.date.trim() || citation;
    if (!hasAny) {
      return;
    }
    if (!authority || !referenceTitle || !url) {
      issues.push({
        field: "references",
        message: `第 ${index + 1} 条引用必须同时填写机构、标题与 HTTPS 链接 / Reference ${index + 1} needs authority, title and an HTTPS URL`,
      });
      return;
    }
    if (!/^https:\/\//u.test(url)) {
      issues.push({
        field: "references",
        message: `第 ${index + 1} 条引用的链接必须是 HTTPS / Reference ${index + 1} must use an HTTPS URL`,
      });
      return;
    }
    references.push({
      authority,
      title: referenceTitle,
      url,
      date: parseOptionalDate(reference.date, "references", issues),
      citation: citation || null,
    });
  });

  const officialSourceDate = parseOptionalDate(
    form.officialSourceDate,
    "officialSourceDate",
    issues
  );
  const commencementDate = parseOptionalDate(
    form.commencementDate,
    "commencementDate",
    issues
  );
  const reviewedAsOfDate = parseOptionalDate(
    form.reviewedAsOfDate,
    "reviewedAsOfDate",
    issues
  );

  if (!title || !overview) {
    issues.push({
      field: "title",
      message:
        "标题与摘要必须同时提供中文和英文 / Title and summary both need Chinese and English text",
    });
  }
  if (issues.length > 0 || !title || !overview) {
    return { status: "error", issues };
  }
  return {
    status: "ok",
    content: {
      schemaVersion: "policy-intelligence.human-revision.v1",
      title,
      overview,
      keyChanges: changes.units,
      affectedGroups: groups.units,
      implications: implications.units,
      recommendedActions: actions.units,
      body,
      commentary,
      attribution,
      sourceStatus: form.sourceStatus,
      sourceReferences: references,
      officialSourceDate,
      commencementDate,
      reviewedAsOfDate,
    },
  };
}

/** Loads every stored field — including all references and dates — into the form. */
export function formFromHumanContent(
  content: EditorialHumanContent
): EditorialFormState {
  return {
    ...emptyEditorialForm(),
    titleZh: content.title["zh-CN"],
    titleEn: content.title.en,
    overviewZh: content.overview["zh-CN"],
    overviewEn: content.overview.en,
    changes: formatNarrativeLines(content.keyChanges),
    affectedGroups: formatNarrativeLines(content.affectedGroups),
    implications: formatNarrativeLines(content.implications),
    actions: formatNarrativeLines(content.recommendedActions),
    bodyZh: content.body?.["zh-CN"] ?? "",
    bodyEn: content.body?.en ?? "",
    commentaryZh: content.commentary?.["zh-CN"] ?? "",
    commentaryEn: content.commentary?.en ?? "",
    attribution: content.attribution,
    sourceStatus: content.sourceStatus,
    officialSourceDate: content.officialSourceDate ?? "",
    commencementDate: content.commencementDate ?? "",
    reviewedAsOfDate: content.reviewedAsOfDate ?? "",
    references: content.sourceReferences.map((reference) => ({
      authority: reference.authority,
      title: reference.title,
      url: reference.url,
      date: reference.date ?? "",
      citation: reference.citation ?? "",
    })),
    overrideReason: "",
  };
}

export type EditorialFormSeed = {
  title: EditorialBilingual;
  overview: EditorialBilingual;
  keyChanges: { id: string; text: EditorialBilingual }[];
  affectedGroups: { id: string; text: EditorialBilingual }[];
  implications: { id: string; text: EditorialBilingual }[];
  recommendedActions: { id: string; text: EditorialBilingual }[];
  sourceStatus: string;
  officialSource: {
    authority: string;
    title: string;
    url: string;
    date: string | null;
  } | null;
};

/**
 * Seeds the override editor. A partially seeded form is intentional: the
 * missing bilingual fields are reported by `contentFromEditorialForm`, which is
 * what forces a lawyer to author the text rather than inherit machine
 * translation. Seed text itself comes from stored content (AI analysis or
 * official-source facts), never from a hidden auto-translation step.
 */
export function formFromEditorialSeed(
  seed: EditorialFormSeed | null,
  fallbackAttribution: string
): EditorialFormState {
  const base = {
    ...emptyEditorialForm(),
    attribution: fallbackAttribution,
  };
  if (!seed) {
    return base;
  }
  return {
    ...base,
    titleZh: seed.title["zh-CN"],
    titleEn: seed.title.en,
    overviewZh: seed.overview["zh-CN"],
    overviewEn: seed.overview.en,
    changes: formatNarrativeLines(seed.keyChanges),
    affectedGroups: formatNarrativeLines(seed.affectedGroups),
    implications: formatNarrativeLines(seed.implications),
    actions: formatNarrativeLines(seed.recommendedActions),
    sourceStatus: seed.sourceStatus,
    references: seed.officialSource
      ? [
          {
            authority: seed.officialSource.authority,
            title: seed.officialSource.title,
            url: seed.officialSource.url,
            date: seed.officialSource.date ?? "",
            citation: "",
          },
        ]
      : [],
  };
}
