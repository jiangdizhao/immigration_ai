# Public Content Policy

**Status:** Phase 11 governing product-content policy  
**Date:** 2026-09-19  
**Applies to:** Public-facing Phase 11 pages and components in `jiangdizhao/immigration_ai`

## 1. Purpose

Phase 11 is being implemented before all real law-firm, lawyer, commercial and contact information is available.

This policy prevents temporary UI development from silently converting invented details into apparent production facts.

The core rule is:

> **Unknown content may be represented for structure, but it must not masquerade as verified reality.**

When a task needs a subjective or factual decision that is not resolved by repository authority, the coding agent must follow the classification below and ask the project owner when required.

## 2. Content classes

### A. VERIFIED CONTENT

Content may be treated as production fact only when it is supported by at least one approved authority:

- explicit project-owner confirmation;
- explicit lawyer/law-firm confirmation;
- existing canonical repository configuration/data whose production meaning is established;
- an authoritative official source when the content is legal/regulatory in nature.

Examples:

- an explicitly confirmed real law-firm phone number;
- an explicitly confirmed lawyer name and professional title;
- current official statutory/policy facts supported through the approved source system.

Verified content should still preserve legal provenance where relevant.

### B. APPROVED PLACEHOLDER CONTENT

Temporary content may be used to make a page/component structurally reviewable when the real information is not yet available.

Requirements:

- it must be obviously identified as placeholder/demo/awaiting confirmation;
- it must be easy to replace from one central content model or data structure;
- it must not resemble an unqualified real-world credential or commercial claim;
- it must not be used as legal authority;
- it must not become a hidden fallback for production facts.

Examples:

- `示例律师 / Demo lawyer`;
- `资料待确认 / Profile pending confirmation`;
- generic silhouette/avatar artwork;
- a lawyer-card skeleton containing placeholder specialty labels clearly marked as mock;
- prototype-only service copy that makes no guarantee.

### C. SAFE GENERIC PRODUCT COPY

The coding agent may draft ordinary, non-claiming interface copy when it is needed for implementation and is consistent with accepted product decisions.

Examples:

- “开始 AI 初步咨询”
- “了解我们的服务”
- “需要时连接专业律师”
- “准备咨询信息”

This freedom does **not** extend to legal conclusions, lawyer credentials, prices, guarantees, outcome claims or factual business coordinates.

### D. REQUIRES OWNER / LAWYER CONFIRMATION

Do not independently finalize content such as:

- final company/platform brand;
- real lawyer names or photos;
- practising-certificate details;
- professional qualifications;
- exact areas of specialisation represented as factual credentials;
- years of experience;
- awards or memberships;
- real office address;
- phone, email or WeChat;
- consultation fees or packages;
- response-time/SLA commitments;
- success rates or success counts;
- real testimonials;
- claims about “best”, “leading”, “specialist” or similar comparative status;
- privilege/confidentiality promises used as marketing wording;
- final legal disclaimer wording if it materially changes legal/commercial meaning.

If one of these becomes necessary for the active task, stop and ask the project owner unless an explicit placeholder form has already been approved.

## 3. Forbidden generated claims

The coding agent must never fabricate and present as true:

- lawyer qualifications;
- practising certificate status or number;
- migration-agent registration status/number;
- years in practice;
- case counts;
- approval/success rates;
- client testimonials;
- legal victories;
- awards/rankings;
- fees;
- office coordinates;
- phone/email/WeChat;
- guaranteed outcomes;
- guaranteed processing times;
- guaranteed lawyer response times;
- claims of official partnership/endorsement;
- statements that AI output is lawyer advice.

## 4. Current Phase 11 approved temporary choices

Until superseded:

- placeholder brand: **Sovereign Nexus Legal**;
- product positioning: Australian immigration + study service platform first;
- AI: first-contact/intake and analysis support, not the sole product;
- six provisional service families are approved for navigation/content structure;
- lawyer/team cards are allowed only with explicit placeholder/mock identity;
- no invented public phone/address/WeChat/email;
- contact surfaces should use consultation/action CTAs;
- V4 is a strong design reference but not a factual content authority.

See `docs/agent-memory/DECISIONS.md`.

## 5. Six provisional service families

The approved first-pass public catalogue is:

1. **留学与学生签证 / Study & Student Visa**
2. **技术移民与雇主担保 / Skilled Migration & Employer Sponsorship**
3. **配偶与家庭类 / Partner & Family**
4. **签证拒签与 ART 复审 / Visa Refusal & ART Review**
5. **永居与公民相关服务 / Permanent Residence & Citizenship-related Services**
6. **复杂案件与个案策略咨询 / Complex Matters & Case Strategy**

These labels are product-navigation categories. They do not state that every sub-service is currently offered, and they do not guarantee eligibility, outcome or availability.

If implementation needs detailed sub-services whose real scope is uncertain, use restrained generic copy or ask the project owner.

## 6. Lawyer profile placeholder policy

If lawyer cards are rendered before real profiles exist:

- use labels such as `示例律师`, `资料待确认`, `Demo profile`, or `Profile pending confirmation`;
- use generic placeholder avatars;
- do not use a real person's likeness without supplied/approved assets;
- avoid realistic invented certificate numbers, awards, years of experience or outcome statistics;
- isolate profile data from component layout so real data can replace it later without UI reconstruction.

A development-only mock profile can contain obviously synthetic layout filler, but the rendered page must make the placeholder status clear.

## 7. Contact policy

Until confirmed contact data is supplied:

Allowed:

- “预约咨询”
- “开始 AI 咨询”
- “联系律师”
- routing to existing site workflows

Not allowed:

- invented phone number;
- invented street address;
- invented email;
- invented WeChat;
- invented office hours;
- invented consultation fee.

## 8. Legal and provenance content

Public marketing/service pages must not collapse these categories:

```text
Official / Original Law != AI Analysis != Lawyer Advice
```

If a public page introduces legal/policy material, the later Policy Intelligence rules and approved evidence/provenance architecture apply.

Do not use placeholder legal rules.

## 9. Coding-agent stop rule

When uncertain:

1. Check `AGENTS.md`, Phase 11 architecture, `DECISIONS.md`, this policy and the active Task Packet.
2. If the issue is merely an implementation detail with no product/legal/commercial consequence, make the smallest maintainable technical choice.
3. If the issue concerns a real-world fact or materially subjective product choice, do not silently decide it.
4. If a placeholder is sufficient and explicitly permitted, use a clearly marked replaceable placeholder.
5. Otherwise stop and ask the project owner.

When asking, report:

- what information is missing;
- where it appears in the UI;
- why repository authority does not resolve it;
- 2–3 options if useful;
- the technical consequence of each;
- a recommended technical option if one exists.
