#!/usr/bin/env python3
"""Migrate the two selected Tistory categories into the static Notes archive."""

from __future__ import annotations

import html
import json
import math
import mimetypes
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import Request, urlopen

from lxml import etree
from lxml import html as lxml_html


ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "posts"
MEDIA_DIR = ROOT / "assets" / "posts"
BASE_URL = "https://w-key.tistory.com"
USER_AGENT = "Mozilla/5.0 (compatible; W-RookieBlogMigration/1.0)"

CATEGORIES = (
    {
        "source": "Web Hacking Practice/취약점 진단",
        "path": "Web Hacking Practice/취약점 진단",
        "slug": "vulnerability-assessment",
        "name": "Vulnerability Assessment",
        "short": "ASSESSMENT",
    },
    {
        "source": "Web Hacking Practice/웹 모의해킹",
        "path": "Web Hacking Practice/웹 모의해킹",
        "slug": "web-penetration-testing",
        "name": "Web Penetration Testing",
        "short": "PENETRATION TEST",
    },
)


@dataclass
class Post:
    entry_id: int
    category_slug: str
    category_name: str
    category_short: str
    title: str = ""
    date: str = ""
    description: str = ""
    body_html: str = ""
    search_text: str = ""
    read_minutes: int = 1

    @property
    def filename(self) -> str:
        return f"note-{self.entry_id}.html"


class ProtectedPost(RuntimeError):
    """Raised when Tistory intentionally withholds a password-protected body."""


def fetch(url: str, *, binary: bool = False, referer: str | None = None) -> bytes | str:
    headers = {"User-Agent": USER_AGENT, "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.7"}
    if referer:
        headers["Referer"] = referer
    request = Request(url, headers=headers)
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urlopen(request, timeout=45) as response:
                payload = response.read()
                return payload if binary else payload.decode("utf-8", errors="replace")
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url}: {last_error}")


def category_url(path: str, page: int) -> str:
    encoded = "/".join(quote(part) for part in path.split("/"))
    return f"{BASE_URL}/category/{encoded}?page={page}"


def collect_post_ids(category: dict[str, str]) -> list[int]:
    ids: list[int] = []
    for page in range(1, 10):
        document = lxml_html.fromstring(fetch(category_url(category["path"], page)))
        page_ids: list[int] = []
        for href in document.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " post ")]/a[contains(concat(" ", normalize-space(@class), " "), " link ")]/@href'):
            match = re.fullmatch(r"/(\d+)", href)
            if match:
                page_ids.append(int(match.group(1)))
        page_ids = list(dict.fromkeys(page_ids))
        if not page_ids:
            break
        for entry_id in page_ids:
            if entry_id not in ids:
                ids.append(entry_id)
        if len(page_ids) < 10:
            break
    return ids


def meta_content(document: etree._Element, *, prop: str | None = None, name: str | None = None) -> str:
    if prop:
        values = document.xpath(f'//meta[@property="{prop}"]/@content')
    else:
        values = document.xpath(f'//meta[@name="{name}"]/@content')
    return values[0].strip() if values else ""


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def summary_from(document: etree._Element, body: etree._Element) -> str:
    description = meta_content(document, prop="og:description") or meta_content(document, name="description")
    if not description:
        description = clean_text(" ".join(body.itertext()))
    description = clean_text(description)
    if len(description) > 150:
        description = description[:147].rstrip() + "…"
    return description


def published_date(document: etree._Element) -> str:
    value = meta_content(document, prop="article:published_time")
    if value:
        try:
            return datetime.fromisoformat(value).date().isoformat()
        except ValueError:
            pass
    values = document.xpath('//time[contains(concat(" ", normalize-space(@class), " "), " date ")]/text()')
    if values:
        match = re.search(r"(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})", values[0])
        if match:
            return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}-{int(match.group(3)):02d}"
    return "1970-01-01"


def extension_for(url: str, content_type: str | None = None) -> str:
    suffix = Path(urlsplit(url).path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"}:
        return suffix
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";", 1)[0].strip())
        if guessed:
            return guessed
    return ".bin"


def download_image(url: str, target_stem: Path, referer: str) -> Path:
    existing = sorted(target_stem.parent.glob(f"{target_stem.name}.*"))
    if existing:
        return existing[0]
    request = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Referer": referer,
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urlopen(request, timeout=60) as response:
                payload = response.read()
                content_type = response.headers.get("Content-Type", "")
                suffix = extension_for(url, content_type)
                target = target_stem.with_suffix(suffix)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
                return target
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if attempt < 3:
                time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"Failed image {url}: {last_error}")


def transform_body(body: etree._Element, post: Post, known_ids: set[int], warnings: list[str]) -> str:
    for node in body.xpath('.//script|.//style|.//*[starts-with(@on, "on")]'):
        if isinstance(node, etree._Element) and node.tag in {"script", "style"}:
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
        elif isinstance(node, etree._Element):
            for attr in list(node.attrib):
                if attr.lower().startswith("on"):
                    del node.attrib[attr]

    post_media_dir = MEDIA_DIR / str(post.entry_id)

    image_number = 0
    for image in body.xpath(".//img[@src]"):
        source = urljoin(BASE_URL, image.get("src", ""))
        if not source.startswith(("http://", "https://")):
            continue
        image_number += 1
        try:
            target = download_image(source, post_media_dir / f"image-{image_number:02d}", f"{BASE_URL}/{post.entry_id}")
            image.set("src", f"../assets/posts/{post.entry_id}/{target.name}")
        except RuntimeError as error:
            warnings.append(str(error))
            image.set("src", source)
        image.attrib.pop("srcset", None)
        image.attrib.pop("onerror", None)
        image.set("loading", "lazy")
        if not image.get("alt"):
            parent_span = image.getparent()
            image.set("alt", (parent_span.get("data-alt", "") if parent_span is not None else "").strip())

    for anchor in body.xpath(".//a[@href]"):
        href = anchor.get("href", "")
        internal = re.match(r"^(?:https?://w-key\.tistory\.com)?/(\d+)(?:[/?#].*)?$", href)
        if internal and int(internal.group(1)) in known_ids:
            anchor.set("href", f"note-{int(internal.group(1))}.html")
        elif href.startswith("/"):
            anchor.set("href", urljoin(BASE_URL, href))
        if anchor.get("href", "").startswith(("http://", "https://")):
            anchor.set("target", "_blank")
            anchor.set("rel", "noreferrer")

    for pre in list(body.xpath(".//pre")):
        parent = pre.getparent()
        if parent is None or parent.get("class") == "code-block":
            continue
        wrapper = etree.Element("div", {"class": "code-block"})
        parent.replace(pre, wrapper)
        wrapper.append(pre)

    for element in body.iter():
        for attr in list(element.attrib):
            if attr.startswith("data-") or attr in {"contenteditable", "draggable"}:
                del element.attrib[attr]

    return "".join(
        etree.tostring(child, encoding="unicode", method="html") for child in body
    ).strip()


def parse_post(post: Post, known_ids: set[int], warnings: list[str]) -> Post:
    source_url = f"{BASE_URL}/{post.entry_id}"
    document = lxml_html.fromstring(fetch(source_url))
    entry_info_match = re.search(r"window\.T\.entryInfo\s*=\s*(\{.*?\});", etree.tostring(document, encoding="unicode", method="html"))
    if not entry_info_match:
        raise RuntimeError(f"Missing category metadata for {source_url}")
    entry_info = json.loads(entry_info_match.group(1))
    expected = next(item["source"] for item in CATEGORIES if item["slug"] == post.category_slug)
    if entry_info.get("categoryLabel") != expected:
        raise RuntimeError(f"Category mismatch for {source_url}: {entry_info.get('categoryLabel')!r}")

    bodies = document.xpath('//div[contains(concat(" ", normalize-space(@class), " "), " tt_article_useless_p_margin ")]')
    if not bodies:
        if document.xpath('//section[@id="protected"]'):
            raise ProtectedPost(f"Password-protected source post: {source_url}")
        raise RuntimeError(f"Missing article body for {source_url}")
    body = bodies[0]
    post.title = meta_content(document, prop="og:title") or meta_content(document, name="title")
    post.date = published_date(document)
    post.description = summary_from(document, body)
    full_text = clean_text(" ".join(body.itertext()))
    post.search_text = clean_text(f"{post.title} {post.description} {full_text[:1200]}")
    post.read_minutes = max(1, math.ceil(len(full_text) / 700))
    post.body_html = transform_body(body, post, known_ids, warnings)
    return post


def escape_attr(value: str) -> str:
    return html.escape(value, quote=True)


def display_date(value: str) -> str:
    return value.replace("-", ".")


def post_page(post: Post, index: int, next_post: Post | None) -> str:
    next_markup = ""
    if next_post:
        next_markup = (
            '<div class="next-note"><span>NEXT NOTE</span>'
            f'<a href="{escape_attr(next_post.filename)}">{html.escape(next_post.title)} →</a></div>'
        )
    return f'''<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="{escape_attr(post.description)}"><meta name="theme-color" content="#08090b"><title>{html.escape(post.title)} — W-Rookie</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><script src="../assets/theme-init.js"></script><link rel="stylesheet" href="../assets/styles.css"><script src="../assets/app.js" defer></script>
</head>
<body><div class="noise" aria-hidden="true"></div><div class="article-progress" aria-hidden="true"></div>
  <header class="site-header"><a class="brand" href="../index.html"><span class="brand-mark"><i></i></span><span><strong>W-ROOKIE</strong><small>SECURITY LOG</small></span></a><button class="theme-toggle" type="button" aria-label="화이트 모드로 변경"><span class="theme-toggle-icon" aria-hidden="true">☀</span><span class="theme-toggle-label">LIGHT</span></button><button class="menu-toggle" type="button" aria-label="메뉴 열기" aria-expanded="false"><span></span><span></span></button><nav class="main-nav"><a href="../index.html">HOME</a><a href="../index.html#projects">PROJECTS</a><a href="../index.html#ctf">CTF</a><a class="active" href="../index.html#notes">NOTES</a><a href="../index.html#about">ABOUT</a><a class="nav-github" href="https://github.com/W-Rookie" target="_blank" rel="noreferrer">GITHUB ↗</a></nav></header>
  <main class="article-shell"><aside class="article-aside"><div class="article-aside-inner"><p>NOTE {index:02d}<br>{html.escape(post.category_name.upper())}</p><a href="../index.html#notes">← 모든 기록</a></div></aside><article>
    <header class="article-head"><div class="article-meta"><span>{html.escape(post.category_name.upper())}</span><time datetime="{post.date}">{display_date(post.date)}</time><span>{post.read_minutes} MIN READ</span></div><h1>{html.escape(post.title)}</h1><p>{html.escape(post.description)}</p></header>
    <div class="article-content tistory-content">{post.body_html}{next_markup}</div>
  </article></main><footer class="site-footer"><p>© 2026 W-ROOKIE.</p><a href="#">BACK TO TOP ↑</a></footer>
</body></html>
'''


def card_markup(post: Post, index: int) -> str:
    return f'''        <article class="post-card reveal" data-category="{post.category_slug}" data-search="{escape_attr(post.search_text)}">
          <a href="posts/{post.filename}" aria-label="{escape_attr(post.title)}">
            <div class="card-top"><span class="tag">{html.escape(post.category_short)}</span><time datetime="{post.date}">{display_date(post.date)}</time></div>
            <div class="card-copy">
              <p class="card-index">{index:02d} / MIGRATED NOTE</p>
              <h3>{html.escape(post.title)}</h3>
              <p>{html.escape(post.description)}</p>
              <span class="read-more">READ NOTE <b>↗</b></span>
            </div>
          </a>
        </article>'''


def notes_section(posts: list[Post]) -> str:
    counts = {category["slug"]: sum(post.category_slug == category["slug"] for post in posts) for category in CATEGORIES}
    cards = "\n\n".join(card_markup(post, index) for index, post in enumerate(posts, 1))
    return f'''    <section class="notes-section" id="notes">
      <div class="section-heading reveal">
        <div>
          <p class="eyebrow"><span></span> WEB SECURITY NOTES</p>
          <h2>취약점 진단 · 모의해킹</h2>
        </div>
        <p>취약점 진단과 웹 모의해킹 기록을<br>두 개의 전문 카테고리로 정리했습니다.</p>
      </div>

      <div class="notes-toolbar reveal">
        <div class="filters" role="group" aria-label="글 분류">
          <button class="filter active" type="button" data-filter="all">ALL <sup>{len(posts):02d}</sup></button>
          <button class="filter" type="button" data-filter="vulnerability-assessment">VULNERABILITY ASSESSMENT <sup>{counts['vulnerability-assessment']:02d}</sup></button>
          <button class="filter" type="button" data-filter="web-penetration-testing">WEB PENETRATION TESTING <sup>{counts['web-penetration-testing']:02d}</sup></button>
        </div>
        <label class="search-box">
          <span class="sr-only">글 검색</span>
          <input id="post-search" type="search" placeholder="기록 검색..." autocomplete="off">
          <kbd>/</kbd>
        </label>
      </div>

      <div class="post-grid" id="post-grid">
{cards}
      </div>
      <p class="empty-state" id="empty-state" hidden>일치하는 기록이 없습니다.</p>
    </section>

'''


def update_index(posts: list[Post]) -> None:
    index_path = ROOT / "index.html"
    source = index_path.read_text(encoding="utf-8")
    start = source.index('    <section class="notes-section" id="notes">')
    end = source.index('    <section class="about-section" id="about">', start)
    index_path.write_text(source[:start] + notes_section(posts) + source[end:], encoding="utf-8")


def main() -> int:
    all_posts: list[Post] = []
    for category in CATEGORIES:
        ids = collect_post_ids(category)
        print(f"{category['name']}: found {len(ids)} posts", flush=True)
        for entry_id in ids:
            all_posts.append(
                Post(
                    entry_id=entry_id,
                    category_slug=category["slug"],
                    category_name=category["name"],
                    category_short=category["short"],
                )
            )

    if len(all_posts) != 54:
        raise RuntimeError(f"Expected 54 selected posts, found {len(all_posts)}")
    known_ids = {post.entry_id for post in all_posts}
    warnings: list[str] = []
    migrated_posts: list[Post] = []
    protected_posts: list[Post] = []

    for number, post in enumerate(all_posts, 1):
        print(f"[{number:02d}/{len(all_posts)}] migrating {BASE_URL}/{post.entry_id}", flush=True)
        try:
            migrated_posts.append(parse_post(post, known_ids, warnings))
        except ProtectedPost as error:
            protected_posts.append(post)
            print(f"  skipped: {error}", flush=True)

    all_posts = migrated_posts
    migrated_ids = {post.entry_id for post in all_posts}
    for post in all_posts:
        for protected_id in known_ids - migrated_ids:
            post.body_html = post.body_html.replace(
                f'href="note-{protected_id}.html"',
                f'href="{BASE_URL}/{protected_id}" target="_blank" rel="noreferrer"',
            )
    all_posts.sort(key=lambda item: (item.date, item.entry_id), reverse=True)
    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    expected_files = {post.filename for post in all_posts}
    for stale_page in POSTS_DIR.glob("note-*.html"):
        if stale_page.name not in expected_files:
            stale_page.unlink()
    for index, post in enumerate(all_posts, 1):
        next_post = all_posts[index] if index < len(all_posts) else None
        (POSTS_DIR / post.filename).write_text(post_page(post, index, next_post), encoding="utf-8")

    update_index(all_posts)

    manifest = [
        {
            "id": post.entry_id,
            "title": post.title,
            "date": post.date,
            "category": post.category_name,
            "file": f"posts/{post.filename}",
        }
        for post in all_posts
    ]
    (ROOT / "assets" / "posts.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    if warnings:
        print(f"Completed with {len(warnings)} image warning(s):", file=sys.stderr)
        for warning in warnings:
            print(f"- {warning}", file=sys.stderr)
        return 2
    print(f"Completed: {len(all_posts)} public posts migrated; {len(protected_posts)} protected post skipped", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
