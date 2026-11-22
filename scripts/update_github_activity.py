"""Snapshot W-Rookie's public GitHub profile contribution calendar."""

from __future__ import annotations

import json
import re
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "github-activity.json"
URL = "https://github.com/users/W-Rookie/contributions"


class ContributionCalendar(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.days: dict[str, int] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "td":
            return
        values = dict(attrs)
        if "ContributionCalendar-day" not in (values.get("class") or "").split():
            return
        date = values.get("data-date") or ""
        level = values.get("data-level") or ""
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) and level in {"0", "1", "2", "3", "4"}:
            self.days[date] = int(level)


def main() -> None:
    try:
        request = urllib.request.Request(URL, headers={
            "User-Agent": "W-Rookie-Security-Log/1.0 (+https://w-rookie.github.io/)",
            "Accept": "text/html",
        })
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read(500_001)
        if len(body) > 500_000:
            raise ValueError("Contribution response too large")
        html = body.decode("utf-8")
        calendar = ContributionCalendar()
        calendar.feed(html)
        if len(calendar.days) < 300:
            raise ValueError("Contribution calendar is incomplete")
        total_match = re.search(r'id="js-contribution-activity-description"[^>]*>\s*([\d,]+)\s+contributions?', html)
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "profile_url": "https://github.com/W-Rookie",
            "total_contributions": int(total_match.group(1).replace(",", "")) if total_match else None,
            "days": [{"date": date, "level": level} for date, level in sorted(calendar.days.items())],
        }
        OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {len(calendar.days)} contribution days")
    except (OSError, UnicodeError, ValueError) as error:
        if not OUTPUT.exists():
            raise
        print(f"Keeping previous contribution calendar: {error}")


if __name__ == "__main__":
    main()
