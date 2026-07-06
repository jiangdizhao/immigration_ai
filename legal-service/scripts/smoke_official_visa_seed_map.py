from __future__ import annotations

from app.services.official_source_registry import OfficialSourceRegistry

registry = OfficialSourceRegistry()
entries = registry._seed_map_entries()
assert len(entries) >= 80, len(entries)
for code in ["400", "482", "407", "408", "403", "417", "462", "600", "601", "651"]:
    urls = registry.seed_urls_for_subclasses([code])
    assert urls, (code, urls)
    assert all(registry.is_allowed_url(url) for url in urls), urls
print("OK: official visa source seed map smoke passed")
