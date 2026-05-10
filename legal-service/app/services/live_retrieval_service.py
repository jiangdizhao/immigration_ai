from __future__ import annotations

import html
import io
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup
from pypdf import PdfReader

from app.schemas.state import LiveRetrievalResult, LiveSourceChunk
from app.services.operation_profiles import canonical_operation_type, infer_source_classes_from_parts


@dataclass(slots=True)
class _FetchedDocument:
    url: str
    authority: str
    source_type: str
    bucket: str
    sub_type: str
    title: str
    content_type: str
    text: str


class LiveRetrievalService:
    """
    Controlled live official-source fallback.

    This version keeps the allowlisted, deterministic design, but improves two
    weak points that affected 485 policy-sensitive questions:

    1. candidate URL targeting:
       - 485 stream/current-rule pages are prioritised according to the question.
       - policy-change / stream pages can be fetched before broad overview pages.

    2. HTML extraction:
       - extracts visible text, meta descriptions, structured JSON, and relevant
         script-embedded text snippets.
       - avoids returning title-only live chunks as if they were enough evidence.
    """

    USER_AGENT = "ImmigrationAI/0.2 (+controlled-live-retrieval)"
    DEFAULT_TIMEOUT = 20
    DEFAULT_MAX_URLS = 6
    DEFAULT_MAX_CHUNKS = 10
    MAX_CHARS_PER_CHUNK = 2200
    MIN_SUBSTANTIVE_CHARS = 280
    MIN_SUBSTANTIVE_WORDS = 35

    ALLOWLIST = {
        "legislation.gov.au": "Federal Register of Legislation",
        "immi.homeaffairs.gov.au": "Department of Home Affairs",
        "art.gov.au": "Administrative Review Tribunal",
        "www.art.gov.au": "Administrative Review Tribunal",
        "fedcourt.gov.au": "Federal Court of Australia",
        "www.fedcourt.gov.au": "Federal Court of Australia",
    }

    DOMAIN_CATALOG: dict[str, dict[str, list[str]]] = {
        "immi.homeaffairs.gov.au": {
            "student": [
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500/genuine-student-requirement",
                "https://immi.homeaffairs.gov.au/check-twice-submit-once/student-visa",
            ],
            "485": [
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-higher-education-work",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/meeting-the-temporary-graduate-visa-subclass-485-study-requirement",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-vocational-education-work",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/second-post-higher-education-work",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/replacement-stream",
            ],
            "485_higher_education": [
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-higher-education-work",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/meeting-the-temporary-graduate-visa-subclass-485-study-requirement",
            ],
            "485_vocational": [
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-vocational-education-work",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/meeting-the-temporary-graduate-visa-subclass-485-study-requirement",
            ],
            "485_replacement": [
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/replacement-stream",
            ],
            "485_regional": [
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/second-post-higher-education-work",
            ],
            "bridging": [
                "https://immi.homeaffairs.gov.au/entering-and-leaving-australia/travelling-and-your-visa/travel-on-a-bridging-visa",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/bridging-visa-b-020",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/bridging-visa-a-010",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/bridging-visa-c-030",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/bridging-visa-e-050-051",
            ],
            "pic4020": [
                "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/providing-accurate-information",
            ],
            "conditions": [
                "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/see-your-visa-conditions",
                "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/adequate-health-insurance/visas-subject-condition-8501",
            ],
            "conditions_8501": [
                "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/adequate-health-insurance/visas-subject-condition-8501",
            ],
        },
        "art.gov.au": {
            "review": [
                "https://www.art.gov.au/applying-review/immigration-and-citizenship",
            ],
            "procedure": [
                "https://www.art.gov.au/applying-review/immigration-and-citizenship",
            ],
        },
        "legislation.gov.au": {
            "migration": [
                "https://www.legislation.gov.au/C1958A00062/latest/text",
                "https://www.legislation.gov.au/F1996B03551/latest/text",
            ],
            "review": [
                "https://www.legislation.gov.au/C1958A00062/latest/text",
                "https://www.legislation.gov.au/F1996B03551/latest/text",
            ],
            "485": [
                "https://www.legislation.gov.au/F1996B03551/latest/text",
            ],
        },
        "fedcourt.gov.au": {
            "review": [
                "https://www.fedcourt.gov.au/law-and-practice/guides/migration",
                "https://www.fedcourt.gov.au/digital-law-library/judgments/latest",
            ],
            "judicial_review": [
                "https://www.fedcourt.gov.au/law-and-practice/guides/migration",
                "https://www.fedcourt.gov.au/digital-law-library/judgments/latest",
            ],
        },
    }

    def retrieve(
        self,
        *,
        question: str,
        preferred_domains: list[str] | None = None,
        issue_type: str | None = None,
        operation_type: str | None = None,
        known_facts: dict[str, Any] | None = None,
        max_urls: int | None = None,
        max_chunks: int | None = None,
    ) -> LiveRetrievalResult:
        known_facts = known_facts or {}
        operation_type = canonical_operation_type(operation_type)
        policy_sensitive_485 = self._is_485_policy_sensitive(question, operation_type, issue_type, known_facts)

        max_urls = max_urls or self.DEFAULT_MAX_URLS
        max_chunks = max_chunks or self.DEFAULT_MAX_CHUNKS
        if policy_sensitive_485:
            max_urls = max(max_urls, 6)
            max_chunks = max(max_chunks, 10)

        domains = self._normalize_domains(preferred_domains)
        candidates = self._candidate_urls(
            question=question,
            domains=domains,
            issue_type=issue_type,
            operation_type=operation_type,
            known_facts=known_facts,
        )
        candidates = candidates[:max_urls]

        chunks: list[LiveSourceChunk] = []
        thin_chunks: list[LiveSourceChunk] = []
        fetched_urls: list[str] = []
        errors: list[dict[str, str]] = []
        fetched_debug: list[dict[str, Any]] = []

        for url in candidates:
            try:
                doc = self._fetch_and_extract(url)
                fetched_urls.append(url)

                doc_is_substantive = self._is_substantive_doc(doc)
                doc_chunks = self._chunk_document(doc)
                fetched_debug.append(
                    {
                        "url": url,
                        "title": doc.title,
                        "content_type": doc.content_type,
                        "text_chars": len(doc.text or ""),
                        "word_count": self._word_count(doc.text),
                        "substantive": doc_is_substantive,
                        "chunk_count": len(doc_chunks),
                    }
                )

                if doc_is_substantive:
                    chunks.extend(doc_chunks)
                else:
                    thin_chunks.extend(doc_chunks)

                if len(chunks) >= max_chunks:
                    chunks = chunks[:max_chunks]
                    break
            except Exception as exc:  # pragma: no cover - defensive
                errors.append({"url": url, "error": str(exc)[:300]})

        # If all fetched pages were thin, return the thin chunks but make the
        # extraction weakness visible in debug. This avoids silent "no live fetch"
        # behavior while preventing title-only pages from looking like strong evidence.
        used_thin_fallback = False
        if not chunks and thin_chunks:
            chunks = thin_chunks[:max_chunks]
            used_thin_fallback = True

        return LiveRetrievalResult(
            used_live_fetch=bool(fetched_urls),
            domains_used=sorted({self._hostname(url) for url in fetched_urls}),
            fetched_url_count=len(fetched_urls),
            chunks=chunks[:max_chunks],
            debug={
                "question": question,
                "issue_type": issue_type,
                "operation_type": operation_type,
                "candidate_urls": candidates,
                "policy_sensitive_485": policy_sensitive_485,
                "focused_query_hints": self._focused_query_hints(question, operation_type, known_facts),
                "fetched_documents": fetched_debug,
                "used_thin_fallback": used_thin_fallback,
                "errors": errors,
            },
        )

    # ------------------------------------------------------------------
    # Candidate generation
    # ------------------------------------------------------------------
    def _candidate_urls(
        self,
        *,
        question: str,
        domains: list[str],
        issue_type: str | None,
        operation_type: str | None,
        known_facts: dict[str, Any],
    ) -> list[str]:
        q = question.lower()
        urls: list[str] = []
        tags: list[str] = []
        operation_type = canonical_operation_type(operation_type)

        if operation_type in {"review_rights", "review_deadline"}:
            tags.extend(["review", "procedure", "migration"])
        if operation_type == "student_refusal_next_steps" or issue_type in {"student_visa", "visa_refusal"} or known_facts.get("visa_type") == "student":
            tags.append("student")
        if operation_type == "bridging_travel" or "bridging" in q:
            tags.append("bridging")

        if self._is_485_question(q=q, operation_type=operation_type, issue_type=issue_type, known_facts=known_facts):
            tags.append("485")
            if any(term in q for term in ["master", "masters", "bachelor", "phd", "degree", "higher education"]):
                tags.insert(0, "485_higher_education")
            if any(term in q for term in ["diploma", "trade", "associate degree", "vocational", "skills assessment"]):
                tags.insert(0, "485_vocational")
            if any(term in q for term in ["regional", "second 485", "second temporary graduate"]):
                tags.insert(0, "485_regional")
            if any(term in q for term in ["replacement", "covid", "disruption"]):
                tags.insert(0, "485_replacement")

        if operation_type == "pic4020_risk" or "4020" in q or "misleading" in q or "incorrect information" in q:
            tags.append("pic4020")
        condition_no = self._extract_condition_number(question)
        if operation_type == "visa_condition_explainer" or "condition" in q or condition_no:
            tags.append("conditions")
            if condition_no == "8501":
                tags.append("conditions_8501")
        if "judicial" in q or "fedcourt" in q:
            tags.append("judicial_review")

        if not tags:
            tags = ["migration"]

        # Question-specific focused URLs go before generic catalog URLs.
        for url in self._focused_485_urls(question, operation_type, known_facts):
            urls.append(url)

        for domain in domains:
            catalog = self.DOMAIN_CATALOG.get(domain, {})
            for tag in tags:
                urls.extend(catalog.get(tag, []))

        # dedupe while preserving order and allowlist
        deduped: list[str] = []
        seen: set[str] = set()
        for url in urls:
            if url in seen:
                continue
            if self._hostname(url) not in self.ALLOWLIST:
                continue
            seen.add(url)
            deduped.append(url)
        return deduped

    def _focused_485_urls(self, question: str, operation_type: str | None, known_facts: dict[str, Any]) -> list[str]:
        q = (question or "").lower()
        if not self._is_485_question(q=q, operation_type=operation_type, issue_type=None, known_facts=known_facts):
            return []

        urls: list[str] = []
        changes = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes"
        post_higher = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-higher-education-work"
        study = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/meeting-the-temporary-graduate-visa-subclass-485-study-requirement"
        vocational = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-vocational-education-work"
        second = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/second-post-higher-education-work"
        replacement = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/replacement-stream"
        overview = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485"

        # Current/reform-sensitive queries get the changes page first.
        if any(term in q for term in ["age", "years old", "still apply", "eligible", "eligibility", "july", "change", "changed", "new rule", "transitional", "exception", "covid"]):
            urls.append(changes)

        if any(term in q for term in ["master", "masters", "bachelor", "phd", "degree", "higher education"]):
            urls.extend([post_higher, study, changes])
        elif any(term in q for term in ["diploma", "trade", "associate degree", "vocational", "skills assessment"]):
            urls.extend([vocational, study, changes])
        elif any(term in q for term in ["regional", "second 485", "second temporary graduate"]):
            urls.extend([second, changes])
        elif any(term in q for term in ["replacement", "covid", "disruption"]):
            urls.extend([replacement, changes])
        else:
            urls.extend([changes, overview, study])

        urls.append(overview)
        return urls

    def _focused_query_hints(self, question: str, operation_type: str | None, known_facts: dict[str, Any]) -> list[str]:
        q = (question or "").lower()
        if not self._is_485_question(q=q, operation_type=operation_type, issue_type=None, known_facts=known_facts):
            return []
        hints = [
            "Temporary Graduate visa Subclass 485 current eligibility rules",
            "Changes to Temporary Graduate visa program from 1 July 2024",
        ]
        if re.search(r"\b\d{2}\b|age|years old", q):
            hints.append("Subclass 485 age limit Post-Higher Education Work stream")
        if any(term in q for term in ["master", "masters", "bachelor", "phd", "degree"]):
            hints.append("Subclass 485 Post-Higher Education Work stream degree qualification")
        if "covid" in q or "replacement" in q:
            hints.append("Subclass 485 replacement stream COVID disruption")
        return hints

    def _is_485_question(
        self,
        *,
        q: str,
        operation_type: str | None,
        issue_type: str | None,
        known_facts: dict[str, Any],
    ) -> bool:
        return (
            bool(operation_type and operation_type.startswith("485_"))
            or "485" in q
            or "temporary graduate" in q
            or str(known_facts.get("visa_subclass") or "") == "485"
            or str(known_facts.get("visa_type") or "") == "temporary_graduate"
            or (issue_type or "") == "temporary_graduate_visa"
        )

    def _is_485_policy_sensitive(self, question: str, operation_type: str | None, issue_type: str | None, known_facts: dict[str, Any]) -> bool:
        q = (question or "").lower()
        if not self._is_485_question(q=q, operation_type=operation_type, issue_type=issue_type, known_facts=known_facts):
            return False
        return any(
            term in q
            for term in [
                "can i apply", "still apply", "eligible", "eligibility", "requirements", "stream",
                "age", "years old", "master", "bachelor", "diploma", "covid", "replacement",
                "exception", "transitional", "new rule", "changed",
            ]
        ) or any(key in known_facts for key in ["age", "qualification_level", "replacement_reason", "regional_study_location"])

    def _extract_condition_number(self, text: str) -> str | None:
        match = re.search(r"(?:visa\s+)?condition\s*(\d{4})\b", text or "", flags=re.I)
        return match.group(1) if match else None

    def _normalize_domains(self, domains: list[str] | None) -> list[str]:
        if not domains:
            return [
                "immi.homeaffairs.gov.au",
                "art.gov.au",
                "legislation.gov.au",
            ]

        normalized: list[str] = []
        for item in domains:
            if not item:
                continue
            host = item.lower().strip()
            host = host.replace("https://", "").replace("http://", "").strip("/")
            if host.startswith("www.") and host[4:] in self.ALLOWLIST:
                host = host[4:]
            if host in self.ALLOWLIST and host not in normalized:
                normalized.append(host)
        return normalized or [
            "immi.homeaffairs.gov.au",
            "art.gov.au",
            "legislation.gov.au",
        ]

    # ------------------------------------------------------------------
    # Fetch / parse
    # ------------------------------------------------------------------
    def _fetch_and_extract(self, url: str) -> _FetchedDocument:
        host = self._hostname(url)
        if host not in self.ALLOWLIST:
            raise ValueError(f"Domain not allowlisted: {host}")

        req = Request(url, headers={"User-Agent": self.USER_AGENT})
        with urlopen(req, timeout=self.DEFAULT_TIMEOUT) as resp:
            raw = resp.read()
            content_type = (resp.headers.get("Content-Type") or "").lower()

        if "pdf" in content_type or url.lower().endswith(".pdf"):
            text = self._extract_pdf_text(raw)
            title = self._pdf_title_guess(text, url)
        else:
            text, title = self._extract_html_text(raw, url)

        return _FetchedDocument(
            url=url,
            authority=self.ALLOWLIST[host],
            source_type="guidance" if host != "legislation.gov.au" else "legislation",
            bucket="live_official",
            sub_type="live_case" if host == "fedcourt.gov.au" else "live_official",
            title=title,
            content_type=content_type,
            text=text,
        )

    def _extract_html_text(self, raw: bytes, url: str) -> tuple[str, str]:
        html_text = raw.decode("utf-8", errors="ignore")
        soup = BeautifulSoup(html_text, "html.parser")

        title = ""
        if soup.title:
            title = self._clean_text(soup.title.get_text(" ", strip=True))

        meta_blocks = self._extract_meta_blocks(soup)
        script_blocks = self._extract_script_text_hints(soup, url)

        # Remove noisy executable/style elements after harvesting script hints.
        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        main = (
            soup.find("main")
            or soup.find(attrs={"role": "main"})
            or soup.find("article")
            or soup.find(id=re.compile(r"(main|content|body|page)", re.I))
            or soup.find(class_=re.compile(r"(main|content|body|page|rte|article)", re.I))
            or soup.body
            or soup
        )

        blocks = self._collect_text_blocks(main)
        # If main selection is too thin, fall back to whole body. Some official
        # pages put relevant content outside <main> or inside unusual containers.
        if self._word_count("\n".join(blocks)) < self.MIN_SUBSTANTIVE_WORDS and soup.body:
            blocks.extend(self._collect_text_blocks(soup.body))

        whole_text = self._clean_text(main.get_text(" ", strip=True)) if main else ""
        if whole_text and len(whole_text) > len(" ".join(blocks)):
            blocks.append(whole_text)

        all_blocks = []
        if title:
            all_blocks.append(title)
        all_blocks.extend(meta_blocks)
        all_blocks.extend(blocks)
        all_blocks.extend(script_blocks)

        cleaned_blocks = self._dedupe_blocks(all_blocks)
        text = "\n\n".join(cleaned_blocks)
        if not title:
            title = self._title_from_url(url)
        return text, title

    def _extract_meta_blocks(self, soup: BeautifulSoup) -> list[str]:
        out: list[str] = []
        for tag in soup.find_all("meta"):
            name = (tag.get("name") or tag.get("property") or "").lower()
            if name in {"description", "og:description", "twitter:description", "og:title", "twitter:title", "keywords"}:
                content = self._clean_text(str(tag.get("content") or ""))
                if content:
                    out.append(content)
        return out

    def _collect_text_blocks(self, root: Any) -> list[str]:
        blocks: list[str] = []
        if root is None:
            return blocks

        tags = ["h1", "h2", "h3", "h4", "h5", "p", "li", "td", "th", "caption", "summary", "details", "table"]
        for node in root.find_all(tags):
            text = self._clean_text(node.get_text(" ", strip=True))
            if len(text) < 12:
                continue
            if self._is_noise_block(text):
                continue
            blocks.append(text)
        return blocks

    def _extract_script_text_hints(self, soup: BeautifulSoup, url: str) -> list[str]:
        hints: list[str] = []
        keywords = [
            "temporary graduate", "subclass 485", "post-higher", "post higher",
            "age", "35 years", "july 2024", "cricos", "student visa", "replacement",
            "regional", "minister",
        ]

        for tag in soup.find_all("script"):
            raw = tag.string or tag.get_text(" ", strip=True) or ""
            if not raw:
                continue
            raw_unescaped = self._clean_text(raw)
            lowered = raw_unescaped.lower()
            if not any(keyword in lowered for keyword in keywords):
                continue

            script_type = (tag.get("type") or "").lower()
            if "json" in script_type:
                parsed = self._safe_json_loads(raw)
                if parsed is not None:
                    hints.extend(self._strings_from_json(parsed, keywords=keywords))
                    continue

            hints.extend(self._near_keyword_snippets(raw_unescaped, keywords=keywords))

        return hints

    def _safe_json_loads(self, raw: str) -> Any | None:
        try:
            return json.loads(raw)
        except Exception:
            return None

    def _strings_from_json(self, value: Any, *, keywords: list[str]) -> list[str]:
        out: list[str] = []

        def visit(item: Any) -> None:
            if isinstance(item, str):
                text = self._clean_text(item)
                if len(text) >= 20 and any(keyword in text.lower() for keyword in keywords):
                    out.append(text)
            elif isinstance(item, dict):
                for child in item.values():
                    visit(child)
            elif isinstance(item, list):
                for child in item:
                    visit(child)

        visit(value)
        return out

    def _near_keyword_snippets(self, text: str, *, keywords: list[str]) -> list[str]:
        snippets: list[str] = []
        lowered = text.lower()
        for keyword in keywords:
            start = 0
            while True:
                idx = lowered.find(keyword, start)
                if idx == -1:
                    break
                left = max(0, idx - 700)
                right = min(len(text), idx + 1200)
                snippet = self._clean_script_snippet(text[left:right])
                if len(snippet) >= 40:
                    snippets.append(snippet)
                start = idx + len(keyword)
                if len(snippets) >= 12:
                    return snippets
        return snippets

    def _clean_script_snippet(self, text: str) -> str:
        text = html.unescape(text)
        text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
        text = text.replace("\\n", " ").replace("\\r", " ").replace("\\t", " ")
        text = re.sub(r"[{}\\[\\]\"'=<>;]+", " ", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _extract_pdf_text(self, raw: bytes) -> str:
        reader = PdfReader(io.BytesIO(raw))
        pages: list[str] = []
        for page in reader.pages:
            try:
                txt = page.extract_text() or ""
            except Exception:
                txt = ""
            txt = self._clean_text(txt)
            if txt:
                pages.append(txt)
        return "\n\n".join(pages)

    # ------------------------------------------------------------------
    # Chunking
    # ------------------------------------------------------------------
    def _chunk_document(self, doc: _FetchedDocument) -> list[LiveSourceChunk]:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", doc.text) if p.strip()]
        chunks: list[str] = []
        buf = ""
        for para in paragraphs:
            candidate = f"{buf}\n\n{para}".strip() if buf else para
            if len(candidate) <= self.MAX_CHARS_PER_CHUNK:
                buf = candidate
            else:
                if buf:
                    chunks.append(buf)
                if len(para) <= self.MAX_CHARS_PER_CHUNK:
                    buf = para
                else:
                    for i in range(0, len(para), self.MAX_CHARS_PER_CHUNK):
                        part = para[i : i + self.MAX_CHARS_PER_CHUNK].strip()
                        if part:
                            chunks.append(part)
                    buf = ""
        if buf:
            chunks.append(buf)

        if not chunks and doc.text:
            chunks = [doc.text[: self.MAX_CHARS_PER_CHUNK]]

        out: list[LiveSourceChunk] = []
        for idx, text in enumerate(chunks, start=1):
            heading = self._guess_heading(text, doc.title)
            source_classes = infer_source_classes_from_parts(
                title=doc.title,
                authority=doc.authority,
                source_type=doc.source_type,
                bucket=doc.bucket,
                sub_type=doc.sub_type,
                section_ref=f"live_{idx}",
                heading=heading,
                text=text,
                metadata_json={"live": True, "content_type": doc.content_type},
            )
            out.append(
                LiveSourceChunk(
                    title=doc.title,
                    authority=doc.authority,
                    url=doc.url,
                    source_type=doc.source_type,
                    jurisdiction="Cth",
                    bucket=doc.bucket,
                    sub_type=doc.sub_type,
                    section_ref=f"live_{idx}",
                    heading=heading,
                    text=text,
                    metadata_json={
                        "live": True,
                        "content_type": doc.content_type,
                        "source_classes": source_classes,
                        "substantive": self._is_substantive_text(text),
                    },
                )
            )
        return out

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _hostname(self, url: str) -> str:
        host = urlparse(url).netloc.lower()
        if host.startswith("www.") and host[4:] in self.ALLOWLIST:
            return host[4:]
        return host

    def _title_from_url(self, url: str) -> str:
        path = urlparse(url).path.strip("/")
        tail = path.split("/")[-1] if path else "official-source"
        tail = tail.replace("-", " ").replace("_", " ")
        return tail.title()

    def _pdf_title_guess(self, text: str, url: str) -> str:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        for line in lines[:8]:
            if 4 <= len(line) <= 140:
                return line
        return self._title_from_url(url)

    def _guess_heading(self, text: str, title: str) -> str:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        if lines:
            head = lines[0]
            if 4 <= len(head) <= 180:
                return head
        return title

    def _clean_text(self, text: str) -> str:
        text = html.unescape(text or "")
        text = text.replace("\xa0", " ")
        text = re.sub(r"[\u200b\u200c\u200d\ufeff]+", "", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _dedupe_blocks(self, blocks: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for block in blocks:
            text = self._clean_text(block)
            if not text or self._is_noise_block(text):
                continue
            key = text.lower()
            if key in seen:
                continue
            # Skip blocks contained within a previous larger block.
            if any(key and key in prev.lower() for prev in out if len(prev) > len(text) + 30):
                continue
            seen.add(key)
            out.append(text)
        return out

    def _is_noise_block(self, text: str) -> bool:
        lowered = text.lower()
        noise_terms = [
            "skip to navigation", "skip to main content", "share this page", "print this page",
            "facebook", "twitter", "linkedin", "home affairs portfolio", "copyright",
            "privacy", "disclaimer", "accessibility", "chat available", "press alt",
        ]
        if any(term in lowered for term in noise_terms):
            return True
        if len(text) < 12:
            return True
        return False

    def _word_count(self, text: str | None) -> int:
        return len(re.findall(r"\b\w+\b", text or ""))

    def _is_substantive_doc(self, doc: _FetchedDocument) -> bool:
        return self._is_substantive_text(doc.text)

    def _is_substantive_text(self, text: str | None) -> bool:
        text = text or ""
        if len(text) < self.MIN_SUBSTANTIVE_CHARS:
            return False
        if self._word_count(text) < self.MIN_SUBSTANTIVE_WORDS:
            return False
        # Many failed Home Affairs fetches are effectively title-only plus glyphs.
        normalized = re.sub(r"\W+", "", text).lower()
        if len(normalized) < 120:
            return False
        return True
