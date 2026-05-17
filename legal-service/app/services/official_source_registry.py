from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse


@dataclass(frozen=True, slots=True)
class OfficialSource:
    domain: str
    authority: str
    source_type: str
    priority: int = 50
    topic_tags: tuple[str, ...] = ()
    seed_urls: tuple[str, ...] = ()
    sitemap_urls: tuple[str, ...] = ()


class OfficialSourceRegistry:
    """
    Central official-source registry for controlled live retrieval.

    The goal is not arbitrary internet search. The goal is comprehensive search
    over trusted official sources with auditable domains and topic seed URLs.
    """

    def __init__(self) -> None:
        self.sources: dict[str, OfficialSource] = {
            "immi.homeaffairs.gov.au": OfficialSource(
                domain="immi.homeaffairs.gov.au",
                authority="Department of Home Affairs",
                source_type="guidance",
                priority=10,
                topic_tags=("visa_guidance", "485", "student", "bridging", "conditions", "pic4020"),
                seed_urls=(
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-higher-education-work",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/meeting-the-temporary-graduate-visa-subclass-485-study-requirement",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-vocational-education-work",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/second-post-higher-education-work",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/replacement-stream",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/student-500",
                    "https://immi.homeaffairs.gov.au/entering-and-leaving-australia/travelling-and-your-visa/travel-on-a-bridging-visa",
                    "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/providing-accurate-information",
                    "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/see-your-visa-conditions",
                ),
                sitemap_urls=("https://immi.homeaffairs.gov.au/sitemap.xml",),
            ),
            "legislation.gov.au": OfficialSource(
                domain="legislation.gov.au",
                authority="Federal Register of Legislation",
                source_type="legislation",
                priority=20,
                topic_tags=("legislation", "migration_act", "migration_regulations", "485"),
                seed_urls=(
                    "https://www.legislation.gov.au/C1958A00062/latest/text",
                    "https://www.legislation.gov.au/F1996B03551/latest/text",
                ),
                sitemap_urls=("https://www.legislation.gov.au/sitemap.xml",),
            ),
            "www.legislation.gov.au": OfficialSource(
                domain="www.legislation.gov.au",
                authority="Federal Register of Legislation",
                source_type="legislation",
                priority=20,
                topic_tags=("legislation",),
                seed_urls=("https://www.legislation.gov.au/F1996B03551/latest/text",),
            ),
            "art.gov.au": OfficialSource(
                domain="art.gov.au",
                authority="Administrative Review Tribunal",
                source_type="procedure",
                priority=30,
                topic_tags=("review", "appeal", "tribunal", "procedure"),
                seed_urls=("https://www.art.gov.au/applying-review/immigration-and-citizenship",),
                sitemap_urls=("https://www.art.gov.au/sitemap.xml",),
            ),
            "www.art.gov.au": OfficialSource(
                domain="www.art.gov.au",
                authority="Administrative Review Tribunal",
                source_type="procedure",
                priority=30,
                topic_tags=("review", "appeal", "tribunal", "procedure"),
                seed_urls=("https://www.art.gov.au/applying-review/immigration-and-citizenship",),
            ),
            "fedcourt.gov.au": OfficialSource(
                domain="fedcourt.gov.au",
                authority="Federal Court of Australia",
                source_type="case_law",
                priority=40,
                topic_tags=("judicial_review", "case_law"),
                seed_urls=("https://www.fedcourt.gov.au/law-and-practice/guides/migration",),
            ),
            "www.fedcourt.gov.au": OfficialSource(
                domain="www.fedcourt.gov.au",
                authority="Federal Court of Australia",
                source_type="case_law",
                priority=40,
                topic_tags=("judicial_review", "case_law"),
                seed_urls=("https://www.fedcourt.gov.au/law-and-practice/guides/migration",),
            ),
            "fcfcoa.gov.au": OfficialSource(
                domain="fcfcoa.gov.au",
                authority="Federal Circuit and Family Court of Australia",
                source_type="case_law",
                priority=45,
                topic_tags=("judicial_review", "migration"),
                seed_urls=("https://www.fcfcoa.gov.au/gfl/migration",),
            ),
            "www.fcfcoa.gov.au": OfficialSource(
                domain="www.fcfcoa.gov.au",
                authority="Federal Circuit and Family Court of Australia",
                source_type="case_law",
                priority=45,
                topic_tags=("judicial_review", "migration"),
                seed_urls=("https://www.fcfcoa.gov.au/gfl/migration",),
            ),
            "cricos.education.gov.au": OfficialSource(
                domain="cricos.education.gov.au",
                authority="Commonwealth Register of Institutions and Courses for Overseas Students",
                source_type="register",
                priority=35,
                topic_tags=("cricos", "education", "course"),
                seed_urls=("https://cricos.education.gov.au/",),
            ),
        }

    @property
    def allowlist(self) -> dict[str, str]:
        return {domain: source.authority for domain, source in self.sources.items()}

    def is_allowed_url(self, url: str) -> bool:
        return self.hostname(url) in self.sources

    def source_for_url(self, url: str) -> OfficialSource | None:
        return self.sources.get(self.hostname(url))

    def hostname(self, url: str) -> str:
        host = urlparse(url).netloc.lower()
        if host.startswith("www.") and host[4:] in self.sources:
            return host[4:]
        return host

    def normalize_domains(self, domains: list[str] | None) -> list[str]:
        if not domains:
            return ["immi.homeaffairs.gov.au", "legislation.gov.au", "art.gov.au", "fedcourt.gov.au"]
        out: list[str] = []
        for item in domains:
            if not item:
                continue
            host = item.lower().strip().replace("https://", "").replace("http://", "").strip("/")
            if host.startswith("www.") and host[4:] in self.sources:
                host = host[4:]
            if host in self.sources and host not in out:
                out.append(host)
        return out or ["immi.homeaffairs.gov.au", "legislation.gov.au"]

    def seed_urls_for_query(self, *, question: str, operation_type: str | None, issue_type: str | None, known_facts: dict) -> list[str]:
        q = (question or "").lower()
        op = (operation_type or "").lower()
        facts = known_facts or {}
        urls: list[str] = []

        def add_many(items):
            for item in items:
                if item not in urls:
                    urls.append(item)

        focused = facts.get("focused_policy_issue")
        if isinstance(focused, dict):
            add_many(focused.get("preferred_urls") or [])

        if "485" in q or "temporary graduate" in q or op.startswith("485_") or str(facts.get("visa_subclass") or "") == "485":
            source = self.sources["immi.homeaffairs.gov.au"]
            if any(x in q for x in ["age", "years old", "still apply", "eligible", "july", "change", "current policy", "new rule"]):
                add_many([
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/changes",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-higher-education-work",
                ])
            if any(x in q for x in ["master", "masters", "bachelor", "phd", "degree", "higher education"]):
                add_many([
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-higher-education-work",
                    "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/meeting-the-temporary-graduate-visa-subclass-485-study-requirement",
                ])
            if any(x in q for x in ["diploma", "trade", "vocational", "skills assessment"]):
                add_many(["https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/post-vocational-education-work"])
            if any(x in q for x in ["regional", "second 485", "subsequent"]):
                add_many(["https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/second-post-higher-education-work"])
            if any(x in q for x in ["replacement", "covid", "disruption"]):
                add_many(["https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/temporary-graduate-485/replacement-stream"])
            add_many(source.seed_urls)

        if issue_type in {"review", "visa_refusal"} or any(x in q for x in ["review", "appeal", "tribunal", "deadline"]):
            add_many(self.sources["art.gov.au"].seed_urls)
            add_many(self.sources["legislation.gov.au"].seed_urls)

        if "condition" in q or "8501" in q:
            add_many([
                "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/check-visa-details-and-conditions/see-your-visa-conditions",
                "https://immi.homeaffairs.gov.au/help-support/meeting-our-requirements/health/adequate-health-insurance/visas-subject-condition-8501",
            ])

        if not urls:
            for domain in self.normalize_domains(None):
                add_many(self.sources[domain].seed_urls)
        return [url for url in urls if self.is_allowed_url(url)]
