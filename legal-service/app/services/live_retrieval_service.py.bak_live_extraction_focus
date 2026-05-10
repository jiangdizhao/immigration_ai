from __future__ import annotations

import io
import json
import re
from dataclasses import dataclass
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

    v1 design goals:
    - no open-web crawling
    - no search-engine dependency
    - strict allowlist of trusted domains
    - deterministic candidate URL generation from operation/question
    - fetch a *small* number of pages and return ephemeral chunks
    """

    USER_AGENT = "ImmigrationAI/0.1 (+controlled-live-retrieval)"
    DEFAULT_TIMEOUT = 20
    DEFAULT_MAX_URLS = 4
    DEFAULT_MAX_CHUNKS = 8
    MAX_CHARS_PER_CHUNK = 2200

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
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/meeting-the-temporary-graduate-visa-subclass-485-study-requirement",
                "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
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
        max_urls = max_urls or self.DEFAULT_MAX_URLS
        max_chunks = max_chunks or self.DEFAULT_MAX_CHUNKS
        known_facts = known_facts or {}
        operation_type = canonical_operation_type(operation_type)

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
        fetched_urls: list[str] = []
        errors: list[dict[str, str]] = []

        for url in candidates:
            try:
                doc = self._fetch_and_extract(url)
                fetched_urls.append(url)
                chunks.extend(self._chunk_document(doc))
                if len(chunks) >= max_chunks:
                    chunks = chunks[:max_chunks]
                    break
            except Exception as exc:  # pragma: no cover - defensive
                errors.append({"url": url, "error": str(exc)[:300]})

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
        if operation_type == "485_eligibility_overview" or known_facts.get("visa_subclass") == "485" or "485" in q:
            tags.append("485")
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

        for domain in domains:
            catalog = self.DOMAIN_CATALOG.get(domain, {})
            for tag in tags:
                urls.extend(catalog.get(tag, []))

        # dedupe while preserving order
        deduped: list[str] = []
        seen: set[str] = set()
        for url in urls:
            if url in seen:
                continue
            seen.add(url)
            deduped.append(url)
        return deduped

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
        html = raw.decode("utf-8", errors="ignore")
        soup = BeautifulSoup(html, "html.parser")

        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        title = ""
        if soup.title:
            title = self._clean_text(soup.title.get_text(" ", strip=True))

        main = (
            soup.find("main")
            or soup.find(attrs={"role": "main"})
            or soup.find("article")
            or soup.body
            or soup
        )

        blocks: list[str] = []
        seen: set[str] = set()
        for node in main.find_all(["h1", "h2", "h3", "h4", "p", "li", "table"]):
            text = self._clean_text(node.get_text(" ", strip=True))
            if len(text) < 30:
                continue
            if text in seen:
                continue
            seen.add(text)
            blocks.append(text)

        if not blocks:
            whole_text = self._clean_text(main.get_text(" ", strip=True))
            blocks = [whole_text] if whole_text else []

        text = "\n\n".join(blocks)
        if not title:
            title = self._title_from_url(url)
        return text, title

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
                        "source_classes": infer_source_classes_from_parts(
                            title=doc.title,
                            authority=doc.authority,
                            source_type=doc.source_type,
                            bucket=doc.bucket,
                            sub_type=doc.sub_type,
                            section_ref=f"live_{idx}",
                            heading=heading,
                            text=text,
                            metadata_json={"live": True, "content_type": doc.content_type},
                        ),
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
        text = text.replace("\xa0", " ")
        text = re.sub(r"\s+", " ", text)
        return text.strip()
