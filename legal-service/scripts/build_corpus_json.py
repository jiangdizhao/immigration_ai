from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

from bs4 import BeautifulSoup
from pypdf import PdfReader

ACQUIRED_DIR = Path(__file__).resolve().parent.parent / "data" / "acquired"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"
DEFAULT_JURISDICTION = "Cth"
DEFAULT_LANGUAGE = "en"


@dataclass(slots=True)
class DocSpec:
    path: Path
    bucket: str


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "source"


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()


def norm_whitespace(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def infer_authority(path: Path, bucket: str) -> str:
    s = str(path).lower()
    if "art" in s or "tribunal" in s:
        return "Administrative Review Tribunal"
    if "migration act" in s or "migration regulations" in s or bucket == "legislation":
        return "Federal Register of Legislation"
    return "Department of Home Affairs"


def infer_source_type(bucket: str) -> str:
    return "legislation" if bucket == "legislation" else "guidance"


def infer_doc_version(path: Path) -> str | None:
    m = re.search(r"(C\d{4}[A-Z]\d+|F\d{4}[A-Z]\d+|C\d{4}C\d+|F\d{4}L\d+)", path.name)
    return m.group(1) if m else None


def infer_title(path: Path) -> str:
    return path.stem.strip() or path.name


def infer_url(path: Path) -> str:
    return f"local://{quote(path.as_posix())}"


def read_pdf_sections(path: Path) -> list[dict]:
    reader = PdfReader(str(path))
    sections: list[dict] = []

    for idx, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""

        text = norm_whitespace(text)
        if not text:
            continue

        lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
        heading = lines[0][:300] if lines else f"Page {idx}"

        sections.append(
            {
                "section_ref": f"page_{idx}",
                "heading": heading,
                "text": text,
            }
        )
    return sections


DROP_TAGS = {
    "script", "style", "noscript", "svg", "form", "button", "nav", "footer",
    "header", "aside"
}

BAD_TEXT_PATTERNS = [
    r"^\s*home\s*$",
    r"^\s*menu\s*$",
    r"^\s*search\s*$",
    r"^\s*skip to",
]

BAD_FILE_NAMES = {
    "homeaffairs-nuancechat.html",
    "posttoserver.min.html",
}


def looks_like_helper_html(path: Path) -> bool:
    name = path.name.lower()
    if name in BAD_FILE_NAMES:
        return True
    if "_files" in path.as_posix().lower():
        return True
    return False


def html_main_content(soup: BeautifulSoup):
    selectors = [
        "main",
        "[role='main']",
        "#main-content",
        ".main-content",
        "#content",
        ".content",
        "article",
        "body",
    ]
    for selector in selectors:
        node = soup.select_one(selector)
        if node is not None:
            return node
    return soup


def is_meaningful_text(text: str) -> bool:
    if not text:
        return False
    low = text.lower().strip()

    if len(low) < 40:
        return False

    bad_exact = {
        "home",
        "menu",
        "search",
        "popular searches",
        "your previous searches",
    }
    if low in bad_exact:
        return False

    if low.startswith("skip to"):
        return False

    return True


def split_long_text(text: str, max_chars: int = 2200) -> list[str]:
    text = norm_whitespace(text)
    if len(text) <= max_chars:
        return [text] if text else []

    parts = re.split(r"\n\s*\n", text)
    chunks = []
    buf = ""

    for part in parts:
        candidate = (buf + "\n\n" + part).strip() if buf else part
        if len(candidate) <= max_chars:
            buf = candidate
        else:
            if buf:
                chunks.append(buf)
            if len(part) <= max_chars:
                buf = part
            else:
                # hard split for very long blocks
                for i in range(0, len(part), max_chars):
                    chunks.append(part[i:i + max_chars].strip())
                buf = ""

    if buf:
        chunks.append(buf)

    return [c for c in chunks if c.strip()]


def read_html_sections(path: Path) -> list[dict]:
    if looks_like_helper_html(path):
        return []

    html = path.read_text(encoding="utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup.find_all(DROP_TAGS):
        tag.decompose()

    main = html_main_content(soup)

    for tag in main.select("[aria-hidden='true'], .sr-only, .visually-hidden"):
        tag.decompose()

    title = None
    if soup.title and soup.title.get_text(strip=True):
        title = norm_whitespace(soup.title.get_text(" ", strip=True))
    title = title or infer_title(path)

    sections: list[dict] = []

    # -------- Strategy 1: heading-based extraction --------
    headings = main.find_all(re.compile(r"^h[1-6]$"))
    for heading in headings:
        heading_text = norm_whitespace(heading.get_text(" ", strip=True))
        if not heading_text:
            continue

        texts = []
        node = heading.find_next_sibling()
        while node and not (getattr(node, "name", "") and re.fullmatch(r"h[1-6]", node.name or "")):
            txt = norm_whitespace(node.get_text(" ", strip=True))
            if is_meaningful_text(txt):
                texts.append(txt)
            node = node.find_next_sibling()

        merged = "\n\n".join(dict.fromkeys(texts))
        for j, chunk in enumerate(split_long_text(merged), start=1):
            sections.append(
                {
                    "section_ref": f"{slugify(heading_text)}_{j}",
                    "heading": heading_text[:300],
                    "text": chunk,
                }
            )

    # -------- Strategy 2: broad block extraction --------
    if not sections:
        block_candidates = main.find_all(["section", "div"])
        seen = set()

        for idx, el in enumerate(block_candidates, start=1):
            txt = norm_whitespace(el.get_text(" ", strip=True))
            if not is_meaningful_text(txt):
                continue
            if len(txt) < 120:
                continue
            if txt in seen:
                continue
            seen.add(txt)

            # avoid giant duplicated shell blocks
            if len(txt) > 30000:
                continue

            heading = None
            h = el.find(re.compile(r"^h[1-6]$"))
            if h:
                heading = norm_whitespace(h.get_text(" ", strip=True))
            heading = heading or title or f"Block {idx}"

            for j, chunk in enumerate(split_long_text(txt), start=1):
                sections.append(
                    {
                        "section_ref": f"{slugify(heading)}_{idx}_{j}",
                        "heading": heading[:300],
                        "text": chunk,
                    }
                )

    # -------- Strategy 3: last-resort whole-page text extraction --------
    if not sections:
        full_text = norm_whitespace(main.get_text("\n", strip=True))
        if is_meaningful_text(full_text):
            for j, chunk in enumerate(split_long_text(full_text, max_chars=2500), start=1):
                sections.append(
                    {
                        "section_ref": f"{slugify(title)}_{j}",
                        "heading": title[:300],
                        "text": chunk,
                    }
                )

    # -------- Final cleanup --------
    cleaned = []
    seen_text = set()

    for sec in sections:
        txt = norm_whitespace(sec["text"])
        if not is_meaningful_text(txt):
            continue
        if txt in seen_text:
            continue
        seen_text.add(txt)

        cleaned.append(
            {
                "section_ref": sec["section_ref"],
                "heading": sec["heading"],
                "text": txt,
            }
        )

    return cleaned


def build_payload(path: Path, bucket: str) -> dict:
    source_type = infer_source_type(bucket)
    authority = infer_authority(path, bucket)
    title = infer_title(path)
    document_version = infer_doc_version(path)

    if path.suffix.lower() == ".pdf":
        sections = read_pdf_sections(path)
        file_format = "pdf"
    else:
        sections = read_html_sections(path)
        file_format = "html"

    if not sections:
        raise ValueError(f"No extractable sections found in {path}")

    full_text = "\n\n".join(section["text"] for section in sections)
    content_hash = sha256_text(full_text)

    sub_type = "procedure" if bucket == "procedure" else bucket
    if re.search(r"\bform\b", title, flags=re.I):
        sub_type = "form"

    return {
        "title": title,
        "source_type": source_type,
        "authority": authority,
        "jurisdiction": DEFAULT_JURISDICTION,
        "citation_text": title,
        "url": infer_url(path),
        "document_version": document_version,
        "language": DEFAULT_LANGUAGE,
        "status": "active",
        "metadata_json": {
            "source_filename": path.name,
            "source_path": str(path),
            "bucket": bucket,
            "sub_type": sub_type,
            "content_hash": content_hash,
            "parsed_at": datetime.now(timezone.utc).isoformat(),
            "file_format": file_format,
        },
        "sections": sections,
    }


def iter_input_docs() -> Iterable[DocSpec]:
    specs: list[DocSpec] = []
    for bucket in ("legislation", "guidance", "procedure"):
        bucket_dir = ACQUIRED_DIR / bucket
        if not bucket_dir.exists():
            continue

        for path in sorted(bucket_dir.rglob("*")):
            if path.is_dir():
                continue
            if path.suffix.lower() not in {".pdf", ".html", ".htm"}:
                continue
            if path.suffix.lower() in {".html", ".htm"} and looks_like_helper_html(path):
                continue
            specs.append(DocSpec(path=path, bucket=bucket))
    return specs


def output_path_for(spec: DocSpec) -> Path:
    out_bucket = "legislation" if spec.bucket == "legislation" else "guidance"
    rel = spec.path.relative_to(ACQUIRED_DIR / spec.bucket)
    return (OUTPUT_DIR / out_bucket / rel).with_suffix(".json")


def main() -> None:
    specs = list(iter_input_docs())
    if not specs:
        print(f"No input docs found under {ACQUIRED_DIR}")
        return

    built = 0
    failed = 0

    for spec in specs:
        out_path = output_path_for(spec)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            payload = build_payload(spec.path, spec.bucket)
            out_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"[ok] {spec.path} -> {out_path}")
            built += 1
        except Exception as exc:
            print(f"[error] {spec.path}: {exc}")
            failed += 1

    print("\nBuild summary")
    print(f"  built={built}")
    print(f"  failed={failed}")


if __name__ == "__main__":
    main()