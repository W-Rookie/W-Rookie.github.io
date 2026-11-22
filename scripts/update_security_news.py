"""Build the small, link-only news index used by the GitHub Pages site."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "news-feed.json"
SOURCES = {
    "dailysecu": ("https://www.dailysecu.com/rss/allArticle.xml", {"dailysecu.com", "www.dailysecu.com"}),
    "boannews": ("https://www.boannews.com/rss/allArticle.xml", {"boannews.com", "www.boannews.com"}),
    "kisa": ("https://www.boho.or.kr/kr/rss.do?bbsId=B0000133", {"boho.or.kr", "www.boho.or.kr"}),
}
TOPIC_WORDS = ("해킹", "취약", "침해", "랜섬", "악성", "피싱", "유출", "사이버", "공격", "패치", "인증", "백도어", "디도스", "DDoS", "정보탈취", "제로데이", "정보보호", "보안점검", "보안담당")


def safe_url(raw: str, hosts: set[str]) -> str | None:
    url = urllib.parse.urlsplit(raw.strip())
    if url.scheme not in {"http", "https"} or url.hostname not in hosts:
        return None
    return urllib.parse.urlunsplit(("https", url.netloc, url.path, url.query, ""))


def parse_date(raw: str) -> str | None:
    raw = raw.strip()
    if len(raw) == 10 and raw[4:5] == "-" and raw[7:8] == "-":
        try:
            datetime.fromisoformat(raw)
            return raw
        except ValueError:
            return None
    try:
        date = parsedate_to_datetime(raw)
    except (ValueError, TypeError):
        try:
            date = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=ZoneInfo("Asia/Seoul"))
    return date.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def field(item: ET.Element, name: str) -> str:
    node = item.find(name)
    return "".join(node.itertext()).strip() if node is not None else ""


def load_source(source: str, feed_url: str, hosts: set[str]) -> list[dict[str, str]]:
    request = urllib.request.Request(feed_url, headers={
        "User-Agent": "W-Rookie-Security-News/1.0 (+https://w-rookie.github.io/)",
        "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError("RSS feed too large")
    root = ET.fromstring(data)
    articles = []
    for item in root.findall(".//item")[:30]:
        title = " ".join(field(item, "title").split())[:250]
        if source != "kisa" and not any(word.casefold() in title.casefold() for word in TOPIC_WORDS):
            continue
        url = safe_url(urllib.parse.urljoin(feed_url, field(item, "link")), hosts)
        date = parse_date(field(item, "pubDate") or field(item, "{http://purl.org/dc/elements/1.1/}date"))
        if title and url and date:
            articles.append({"source": source, "title": title, "url": url, "published": date})
    if not articles:
        raise ValueError("No usable RSS items")
    return articles[:12]


def main() -> None:
    previous = json.loads(OUTPUT.read_text(encoding="utf-8")) if OUTPUT.exists() else {"articles": []}
    retained = previous.get("articles", [])
    fetched = []
    success = 0
    for name, (url, hosts) in SOURCES.items():
        try:
            items = load_source(name, url, hosts)
            success += 1
            fetched.extend(items)
            print(f"{name}: {len(items)} items")
        except (OSError, ValueError, ET.ParseError) as exc:
            print(f"{name}: unavailable ({type(exc).__name__}: {exc})")
            fetched.extend(item for item in retained if item.get("source") == name)
    if not success:
        raise RuntimeError("All RSS sources unavailable; keeping the previous feed")
    unique = {item["url"]: item for item in fetched}
    ordered = sorted(unique.values(), key=lambda item: item["published"], reverse=True)[:30]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "articles": ordered,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(ordered)} articles")


if __name__ == "__main__":
    main()
