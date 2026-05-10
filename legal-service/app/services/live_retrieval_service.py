from __future__ import annotations

import html
import io
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup
from pypdf import PdfReader

from app.schemas.state import LiveRetrievalResult, LiveSourceChunk
from app.services.official_source_registry import OfficialSourceRegistry
from app.services.operation_profiles import canonical_operation_type, infer_source_classes_from_parts


@dataclass(slots=True)
class _PolicyBlock:
    heading: str
    text: str
    relevance_score: float
    matched_terms: list[str] = field(default_factory=list)


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
    policy_blocks: list[_PolicyBlock] = field(default_factory=list)


class LiveRetrievalService:
    USER_AGENT = "ImmigrationAI/0.3 (+official-source-policy-retrieval)"
    DEFAULT_TIMEOUT = 22
    DEFAULT_MAX_URLS = 8
    DEFAULT_MAX_CHUNKS = 12
    MAX_CHARS_PER_CHUNK = 2400
    MIN_SUBSTANTIVE_CHARS = 260
    MIN_SUBSTANTIVE_WORDS = 35

    def __init__(self, registry: OfficialSourceRegistry | None = None) -> None:
        self.registry = registry or OfficialSourceRegistry()
        self.ALLOWLIST = self.registry.allowlist

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
        max_urls = max_urls or self.DEFAULT_MAX_URLS
        max_chunks = max_chunks or self.DEFAULT_MAX_CHUNKS
        domains = self.registry.normalize_domains(preferred_domains)
        focused_issue = known_facts.get("focused_policy_issue") if isinstance(known_facts.get("focused_policy_issue"), dict) else None

        candidates = self._candidate_urls(
            question=question,
            domains=domains,
            issue_type=issue_type,
            operation_type=operation_type,
            known_facts=known_facts,
            focused_issue=focused_issue,
        )[:max_urls]

        chunks: list[LiveSourceChunk] = []
        thin_chunks: list[LiveSourceChunk] = []
        fetched_urls: list[str] = []
        fetched_debug: list[dict[str, Any]] = []
        errors: list[dict[str, str]] = []

        for url in candidates:
            try:
                doc = self._fetch_and_extract(url, focused_issue=focused_issue)
                fetched_urls.append(url)
                doc_chunks = self._chunk_document(doc, focused_issue=focused_issue)
                doc_is_substantive = self._is_substantive_doc(doc)
                fetched_debug.append({
                    "url": url,
                    "title": doc.title,
                    "content_type": doc.content_type,
                    "text_chars": len(doc.text or ""),
                    "word_count": self._word_count(doc.text),
                    "policy_block_count": len(doc.policy_blocks),
                    "policy_blocks": [
                        {"heading": block.heading, "score": block.relevance_score, "matched_terms": block.matched_terms}
                        for block in doc.policy_blocks[:5]
                    ],
                    "substantive": doc_is_substantive,
                    "chunk_count": len(doc_chunks),
                })

                if doc_is_substantive:
                    chunks.extend(doc_chunks)
                else:
                    thin_chunks.extend(doc_chunks)
                if len(chunks) >= max_chunks:
                    chunks = chunks[:max_chunks]
                    break
            except Exception as exc:
                errors.append({"url": url, "error": str(exc)[:300]})

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
                "official_domains": domains,
                "candidate_urls": candidates,
                "focused_policy_issue": focused_issue,
                "fetched_documents": fetched_debug,
                "used_thin_fallback": used_thin_fallback,
                "errors": errors,
            },
        )

    def _candidate_urls(
        self,
        *,
        question: str,
        domains: list[str],
        issue_type: str | None,
        operation_type: str | None,
        known_facts: dict[str, Any],
        focused_issue: dict[str, Any] | None,
    ) -> list[str]:
        urls: list[str] = []

        def add(items):
            for item in items:
                if item and item not in urls and self.registry.is_allowed_url(item):
                    urls.append(item)

        if focused_issue:
            add(focused_issue.get("preferred_urls") or [])
        add(self.registry.seed_urls_for_query(question=question, operation_type=operation_type, issue_type=issue_type, known_facts=known_facts))

        focus_terms = self._focus_terms(question, focused_issue)
        for domain in domains:
            add(self._discover_from_sitemap(domain=domain, focus_terms=focus_terms, limit=6))

        return urls

    def _discover_from_sitemap(self, *, domain: str, focus_terms: list[str], limit: int) -> list[str]:
        source = self.registry.sources.get(domain)
        if not source or not source.sitemap_urls or not focus_terms:
            return []
        out: list[str] = []
        for sitemap_url in source.sitemap_urls[:2]:
            try:
                req = Request(sitemap_url, headers={"User-Agent": self.USER_AGENT})
                with urlopen(req, timeout=8) as resp:
                    raw = resp.read()
                root = ET.fromstring(raw)
                locs = [node.text or "" for node in root.iter() if node.tag.lower().endswith("loc")]
                for loc in locs:
                    lowered = loc.lower()
                    if any(term.replace(" ", "-") in lowered or term in lowered for term in focus_terms):
                        if self.registry.is_allowed_url(loc) and loc not in out:
                            out.append(loc)
                    if len(out) >= limit:
                        return out
            except Exception:
                continue
        return out

    def _fetch_and_extract(self, url: str, *, focused_issue: dict[str, Any] | None) -> _FetchedDocument:
        if not self.registry.is_allowed_url(url):
            raise ValueError(f"Domain not allowlisted: {self._hostname(url)}")
        source = self.registry.source_for_url(url)
        if source is None:
            raise ValueError(f"No official source registered for: {url}")

        req = Request(url, headers={"User-Agent": self.USER_AGENT})
        with urlopen(req, timeout=self.DEFAULT_TIMEOUT) as resp:
            raw = resp.read()
            content_type = (resp.headers.get("Content-Type") or "").lower()

        if "pdf" in content_type or url.lower().endswith(".pdf"):
            text = self._extract_pdf_text(raw)
            title = self._pdf_title_guess(text, url)
            blocks = self._extract_policy_blocks_from_text(text, focused_issue)
        else:
            text, title, blocks = self._extract_html_text(raw, url, focused_issue=focused_issue)

        return _FetchedDocument(
            url=url,
            authority=source.authority,
            source_type=source.source_type,
            bucket="live_official",
            sub_type="live_official",
            title=title or self._title_from_url(url),
            content_type=content_type,
            text=text,
            policy_blocks=blocks,
        )

    def _extract_html_text(self, raw: bytes, url: str, *, focused_issue: dict[str, Any] | None) -> tuple[str, str, list[_PolicyBlock]]:
        html_text = raw.decode("utf-8", errors="ignore")
        soup = BeautifulSoup(html_text, "html.parser")
        title = self._clean_text(soup.title.get_text(" ", strip=True)) if soup.title else self._title_from_url(url)

        meta_blocks = self._extract_meta_blocks(soup)
        raw_blocks = self._extract_policy_blocks_from_raw_html(html_text, focused_issue)
        structured_blocks = self._extract_structured_script_blocks(soup, focused_issue)

        for tag in soup(["script", "style", "noscript", "svg"]):
            tag.decompose()

        body_root = (
            soup.find("main")
            or soup.find(attrs={"role": "main"})
            or soup.find("article")
            or soup.find(id=re.compile(r"(main|content|page|body)", re.I))
            or soup.find(class_=re.compile(r"(main|content|page|body|article|rte|ms-rte)", re.I))
            or soup.body
            or soup
        )

        dom_blocks = self._extract_policy_blocks_from_dom(body_root, focused_issue)
        plain_blocks = self._collect_text_blocks(body_root)

        all_policy_blocks = self._dedupe_policy_blocks([*raw_blocks, *structured_blocks, *dom_blocks])
        all_policy_blocks.sort(key=lambda block: block.relevance_score, reverse=True)

        general_text_blocks = [title, *meta_blocks, *[block.text for block in all_policy_blocks], *plain_blocks]
        cleaned = self._dedupe_blocks(general_text_blocks)
        return "\n\n".join(cleaned), title, all_policy_blocks

    def _extract_policy_blocks_from_dom(self, root: Any, focused_issue: dict[str, Any] | None) -> list[_PolicyBlock]:
        if root is None:
            return []
        blocks: list[_PolicyBlock] = []
        current_heading = ""
        current_parts: list[str] = []

        def flush():
            nonlocal current_heading, current_parts
            if current_parts:
                text = self._clean_text("\n".join([current_heading, *current_parts]))
                score, matched = self._policy_relevance(text, focused_issue)
                if score > 0:
                    blocks.append(_PolicyBlock(heading=current_heading or self._guess_heading(text, ""), text=text, relevance_score=score, matched_terms=matched))
            current_parts = []

        for node in root.find_all(["h1", "h2", "h3", "h4", "h5", "p", "li", "td", "th", "caption", "summary", "div"]):
            txt = self._clean_text(node.get_text(" ", strip=True))
            if not txt or len(txt) < 8 or self._is_noise_block(txt):
                continue
            if node.name in {"h1", "h2", "h3", "h4", "h5"}:
                flush()
                current_heading = txt
                current_parts = []
            else:
                if current_heading or self._policy_relevance(txt, focused_issue)[0] > 0:
                    current_parts.append(txt)
        flush()
        return blocks

    def _extract_policy_blocks_from_raw_html(self, html_text: str, focused_issue: dict[str, Any] | None) -> list[_PolicyBlock]:
        plain = self._html_to_text(html_text)
        return self._extract_policy_blocks_from_text(plain, focused_issue)

    def _extract_policy_blocks_from_text(self, text: str, focused_issue: dict[str, Any] | None) -> list[_PolicyBlock]:
        text = self._clean_text(text)
        if not text:
            return []
        heading_patterns = [
            r"Post-Higher Education Work stream(?:\s*\([^)]+\))?",
            r"Post-Vocational Education Work stream(?:\s*\([^)]+\))?",
            r"Second Post-Higher Education Work stream",
            r"Replacement stream",
            r"Temporary Graduate visa study requirement",
            r"Visa conditions",
        ]
        matches = []
        for pat in heading_patterns:
            for m in re.finditer(pat, text, flags=re.I):
                matches.append((m.start(), m.group(0)))
        matches.sort()
        blocks: list[_PolicyBlock] = []
        for idx, (start, heading) in enumerate(matches):
            end = matches[idx + 1][0] if idx + 1 < len(matches) else min(len(text), start + 3500)
            block_text = text[start:end].strip()
            score, matched = self._policy_relevance(block_text, focused_issue)
            if score > 0:
                blocks.append(_PolicyBlock(heading=heading, text=block_text, relevance_score=score, matched_terms=matched))

        if not blocks:
            for keyword in self._focus_terms("", focused_issue):
                idx = text.lower().find(keyword.lower())
                if idx >= 0:
                    start = max(0, idx - 900)
                    end = min(len(text), idx + 2200)
                    block_text = text[start:end].strip()
                    score, matched = self._policy_relevance(block_text, focused_issue)
                    if score > 0:
                        blocks.append(_PolicyBlock(heading=self._guess_heading(block_text, "Focused official policy block"), text=block_text, relevance_score=score, matched_terms=matched))
        return self._dedupe_policy_blocks(blocks)

    def _extract_structured_script_blocks(self, soup: BeautifulSoup, focused_issue: dict[str, Any] | None) -> list[_PolicyBlock]:
        blocks: list[_PolicyBlock] = []
        for tag in soup.find_all("script"):
            script_type = (tag.get("type") or "").lower()
            if "json" not in script_type:
                continue
            raw = tag.string or tag.get_text(" ", strip=True) or ""
            try:
                parsed = json.loads(raw)
            except Exception:
                continue
            for text in self._strings_from_json(parsed):
                score, matched = self._policy_relevance(text, focused_issue)
                if score > 0:
                    blocks.append(_PolicyBlock(heading="Structured official page data", text=text, relevance_score=score, matched_terms=matched))
        return blocks

    def _chunk_document(self, doc: _FetchedDocument, *, focused_issue: dict[str, Any] | None) -> list[LiveSourceChunk]:
        chunks: list[LiveSourceChunk] = []
        idx = 1
        for block in doc.policy_blocks:
            chunks.append(self._make_chunk(doc, text=block.text, heading=block.heading, section_ref=f"policy_block_{idx}", policy_relevant=True, matched_terms=block.matched_terms, relevance_score=block.relevance_score))
            idx += 1

        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", doc.text) if p.strip()]
        buf = ""
        for para in paragraphs:
            if self._is_noise_block(para) or self._looks_like_script_noise(para):
                continue
            candidate = f"{buf}\n\n{para}".strip() if buf else para
            if len(candidate) <= self.MAX_CHARS_PER_CHUNK:
                buf = candidate
            else:
                if buf:
                    chunks.append(self._make_chunk(doc, text=buf, heading=self._guess_heading(buf, doc.title), section_ref=f"live_{idx}", policy_relevant=False, matched_terms=[], relevance_score=0.0))
                    idx += 1
                buf = para
        if buf:
            chunks.append(self._make_chunk(doc, text=buf, heading=self._guess_heading(buf, doc.title), section_ref=f"live_{idx}", policy_relevant=False, matched_terms=[], relevance_score=0.0))
        return chunks

    def _make_chunk(self, doc: _FetchedDocument, *, text: str, heading: str, section_ref: str, policy_relevant: bool, matched_terms: list[str], relevance_score: float) -> LiveSourceChunk:
        source_classes = infer_source_classes_from_parts(
            title=doc.title,
            authority=doc.authority,
            source_type=doc.source_type,
            bucket=doc.bucket,
            sub_type=doc.sub_type,
            section_ref=section_ref,
            heading=heading,
            text=text,
            metadata_json={"live": True, "policy_relevant": policy_relevant, "matched_terms": matched_terms},
        )
        return LiveSourceChunk(
            title=doc.title,
            authority=doc.authority,
            url=doc.url,
            source_type=doc.source_type,
            jurisdiction="Cth",
            bucket=doc.bucket,
            sub_type=doc.sub_type,
            section_ref=section_ref,
            heading=heading,
            text=text[: self.MAX_CHARS_PER_CHUNK],
            metadata_json={
                "live": True,
                "content_type": doc.content_type,
                "source_classes": source_classes,
                "policy_relevant": policy_relevant,
                "matched_terms": matched_terms,
                "policy_relevance_score": relevance_score,
                "substantive": self._is_substantive_text(text),
            },
        )

    def _policy_relevance(self, text: str, focused_issue: dict[str, Any] | None) -> tuple[float, list[str]]:
        lowered = (text or "").lower()
        if self._looks_like_script_noise(text):
            return 0.0, []
        terms = self._focus_terms("", focused_issue) or ["temporary graduate", "subclass 485", "review", "condition", "visa"]
        matched = [term for term in terms if term.lower() in lowered]
        score = float(len(matched))
        if "post-higher education work stream" in lowered or "post higher education work stream" in lowered:
            score += 5
            matched.append("post-higher education work stream")
        if "35 years of age or under" in lowered or "35 years old or younger" in lowered:
            score += 8
            matched.append("35 years age rule")
        if "at the time of application" in lowered:
            score += 2
            matched.append("time of application")
        if "masters (research)" in lowered or "doctoral degree" in lowered or "british national overseas" in lowered or "hong kong" in lowered:
            score += 3
            matched.append("exception terms")
        if "temporary graduate" in lowered or "subclass 485" in lowered:
            score += 1
        return score, list(dict.fromkeys(matched))

    def _focus_terms(self, question: str, focused_issue: dict[str, Any] | None) -> list[str]:
        terms: list[str] = []
        if isinstance(focused_issue, dict):
            terms.extend(focused_issue.get("required_terms_all") or [])
            terms.extend(focused_issue.get("required_terms_any") or [])
            for hint in focused_issue.get("live_query_hints") or []:
                terms.extend([p for p in re.findall(r"[A-Za-z0-9\-]+", hint.lower()) if len(p) >= 4])
        q = (question or "").lower()
        for term in ["temporary graduate", "subclass 485", "post-higher education", "post higher education", "35 years", "age", "masters", "research", "doctoral", "hong kong", "british national overseas"]:
            if term in q or term not in terms:
                terms.append(term)
        return list(dict.fromkeys([t.lower() for t in terms if t]))

    def _collect_text_blocks(self, root: Any) -> list[str]:
        if root is None:
            return []
        blocks: list[str] = []
        for node in root.find_all(["h1", "h2", "h3", "h4", "p", "li", "td", "th", "caption", "summary"]):
            txt = self._clean_text(node.get_text(" ", strip=True))
            if txt and len(txt) >= 12 and not self._is_noise_block(txt) and not self._looks_like_script_noise(txt):
                blocks.append(txt)
        return blocks

    def _extract_meta_blocks(self, soup: BeautifulSoup) -> list[str]:
        out: list[str] = []
        for tag in soup.find_all("meta"):
            name = (tag.get("name") or tag.get("property") or "").lower()
            if name in {"description", "og:description", "twitter:description", "og:title", "twitter:title", "keywords"}:
                txt = self._clean_text(str(tag.get("content") or ""))
                if txt:
                    out.append(txt)
        return out

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

    def _html_to_text(self, html_text: str) -> str:
        soup = BeautifulSoup(html_text, "html.parser")
        for tag in soup(["style", "noscript", "svg"]):
            tag.decompose()
        return self._clean_text(soup.get_text(" ", strip=True))

    def _strings_from_json(self, value: Any) -> list[str]:
        out: list[str] = []
        def visit(item: Any) -> None:
            if isinstance(item, str):
                txt = self._clean_text(item)
                if len(txt) >= 30:
                    out.append(txt)
            elif isinstance(item, dict):
                for child in item.values():
                    visit(child)
            elif isinstance(item, list):
                for child in item:
                    visit(child)
        visit(value)
        return out

    def _dedupe_policy_blocks(self, blocks: list[_PolicyBlock]) -> list[_PolicyBlock]:
        out: list[_PolicyBlock] = []
        seen: set[str] = set()
        for block in blocks:
            key = re.sub(r"\W+", "", block.text.lower())[:500]
            if key and key not in seen and not self._looks_like_script_noise(block.text):
                seen.add(key)
                out.append(block)
        return out

    def _dedupe_blocks(self, blocks: list[str]) -> list[str]:
        out: list[str] = []
        seen: set[str] = set()
        for block in blocks:
            txt = self._clean_text(block)
            if not txt or self._is_noise_block(txt) or self._looks_like_script_noise(txt):
                continue
            key = txt.lower()
            if key not in seen:
                seen.add(key)
                out.append(txt)
        return out

    def _is_substantive_doc(self, doc: _FetchedDocument) -> bool:
        if doc.policy_blocks:
            return True
        return self._is_substantive_text(doc.text)

    def _is_substantive_text(self, text: str | None) -> bool:
        return bool(text) and len(text) >= self.MIN_SUBSTANTIVE_CHARS and self._word_count(text) >= self.MIN_SUBSTANTIVE_WORDS and not self._looks_like_script_noise(text)

    def _looks_like_script_noise(self, text: str | None) -> bool:
        lowered = (text or "").lower()
        if any(term in lowered for term in ["msowebpartpageformname", "_sppagecontextinfo", "var g_", "function _", "cdata", "aspnetform"]):
            return True
        if lowered.count(" var ") >= 3 or lowered.count("function") >= 3:
            return True
        return False

    def _is_noise_block(self, text: str) -> bool:
        lowered = (text or "").lower()
        noise = ["skip to navigation", "popular searches", "your previous searches", "need a hand?", "immigration and citizenship website", "facebook", "twitter", "linkedin", "copyright", "privacy", "accessibility", "national security", "travel and crossing the border"]
        return any(term in lowered for term in noise) or len(text.strip()) < 12

    def _word_count(self, text: str | None) -> int:
        return len(re.findall(r"\b\w+\b", text or ""))

    def _clean_text(self, text: str) -> str:
        text = html.unescape(text or "")
        text = re.sub(r"\\u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), text)
        text = text.replace("\xa0", " ")
        text = re.sub(r"[\u200b\u200c\u200d\ufeff]+", "", text)
        text = re.sub(r"\s+", " ", text)
        return text.strip()

    def _guess_heading(self, text: str, fallback: str) -> str:
        parts = re.split(r"(?<=[.!?])\s+", text.strip())
        first = parts[0] if parts else ""
        return first[:180] if 4 <= len(first) <= 180 else fallback

    def _title_from_url(self, url: str) -> str:
        tail = urlparse(url).path.strip("/").split("/")[-1] or "official-source"
        return tail.replace("-", " ").replace("_", " ").title()

    def _pdf_title_guess(self, text: str, url: str) -> str:
        for line in text.splitlines()[:8]:
            line = line.strip()
            if 4 <= len(line) <= 140:
                return line
        return self._title_from_url(url)

    def _hostname(self, url: str) -> str:
        return self.registry.hostname(url)
