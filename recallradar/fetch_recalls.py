"""Download recent CPSC recalls and save them as one compact JSON file for the app.

Usage:
    python fetch_recalls.py                  # last 730 days -> frontend/public/data/recalls.json
    python fetch_recalls.py --days 90 --out recalls.json

The CPSC Recalls API needs no key. Docs:
https://www.cpsc.gov/Recalls/CPSC-Recalls-Application-Program-Interface-API-Information
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

import httpx

API_URL = "https://www.saferproducts.gov/RestWebServices/Recall"
USER_AGENT = "RecallRadar (+https://github.com/Khalick/recallradar)"
DEFAULT_DAYS = 730
DEFAULT_OUT = Path(__file__).parent / "frontend" / "public" / "data" / "recalls.json"
SCHEMA_VERSION = 1

# The API's RemedyOptions field mostly holds these labels, but sometimes it holds
# a stray letter or a whole sentence. Only these are kept.
KNOWN_REMEDIES = {
    "refund": "Refund",
    "repair": "Repair",
    "replace": "Replace",
    "dispose": "Dispose",
    "inspect": "Inspect",
    "new instructions": "New Instructions",
    "label": "Label",
}

RETRY_STATUSES = {429, 500, 502, 503, 504}


class FetchError(RuntimeError):
    """The CPSC API couldn't be reached or returned something unusable."""

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


def _get_once(client: httpx.Client, params: dict[str, str]) -> list[dict[str, Any]]:
    try:
        response = client.get(API_URL, params=params)
    except httpx.TransportError as err:  # includes timeouts
        raise FetchError(f"couldn't reach the CPSC API: {err!r}", retryable=True) from err

    if response.status_code != 200:
        # 429 and 5xx can clear up on their own; other 4xx won't.
        raise FetchError(
            f"CPSC API returned HTTP {response.status_code}",
            retryable=response.status_code in RETRY_STATUSES,
        )
    try:
        data = response.json()
    except ValueError as err:
        raise FetchError("CPSC API sent a response that isn't JSON", retryable=True) from err
    if not isinstance(data, list):
        raise FetchError(f"expected a JSON list from the CPSC API, got {type(data).__name__}")
    return data


def fetch_raw(
    client: httpx.Client,
    since: date,
    *,
    attempts: int = 3,
    backoff: float = 2.0,
    sleep: Callable[[float], None] = time.sleep,
) -> list[dict[str, Any]]:
    """Return every recall announced on or after `since`, as the API sends it.

    Retries timeouts, network errors and 429/5xx responses, waiting longer each time.
    """
    params = {"format": "json", "RecallDateStart": since.isoformat()}
    for attempt in range(1, attempts + 1):
        try:
            return _get_once(client, params)
        except FetchError as err:
            if not err.retryable or attempt == attempts:
                raise
            sleep(backoff * attempt)
    raise AssertionError("unreachable")


def clean_text(value: Any) -> str:
    """Collapse runs of whitespace (including newlines and narrow no-break spaces) to one space."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())


def safe_url(value: Any) -> str | None:
    """Keep only http(s) links, so the app never renders a javascript: or data: link.

    Also repairs a typo seen in real CPSC data: "https:/www.cpsc.gov/..." (one slash).
    """
    text = clean_text(value)
    text = re.sub(r"^(https?):/(?=[^/])", r"\1://", text, flags=re.IGNORECASE)
    parts = urlsplit(text)
    if parts.scheme.lower() in ("http", "https") and parts.netloc:
        return text
    return None


def parse_day(value: Any) -> str | None:
    """'2026-11-05T00:00:00' -> '2026-11-05'. Returns None if it isn't a date."""
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.strip()).date().isoformat()
    except ValueError:
        return None


def _names(items: Any, key: str = "Name") -> list[str]:
    if not isinstance(items, list):
        return []
    out: list[str] = []
    for item in items:
        if isinstance(item, dict):
            text = clean_text(item.get(key))
            if text and text not in out:
                out.append(text)
    return out


def _sold_at(items: Any) -> str:
    """Retailer text, without the "Sold At:" label the app already shows.

    "Sold At: Home Depot..." -> "Home Depot..."; "Sold Online At: Amazon..." -> "Online: Amazon..."
    """
    text = " ".join(_names(items))
    return re.sub(
        r"^Sold (Online )?At:\s*",
        lambda m: "Online: " if m.group(1) else "",
        text,
        flags=re.IGNORECASE,
    )


def _remedy_options(items: Any) -> list[str]:
    out: list[str] = []
    for option in _names(items, "Option"):
        label = KNOWN_REMEDIES.get(option.lower())
        if label and label not in out:
            out.append(label)
    return out


def _first_image(items: Any) -> dict[str, str] | None:
    if not isinstance(items, list):
        return None
    for item in items:
        if isinstance(item, dict):
            url = safe_url(item.get("URL"))
            if url:
                return {"url": url, "caption": clean_text(item.get("Caption"))}
    return None


def normalize(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Turn one API record into the smaller shape the app uses.

    Returns None for records that are missing the basics (number, date, title, link).
    """
    if not isinstance(raw, dict):
        return None

    recall_number = clean_text(raw.get("RecallNumber"))
    recall_day = parse_day(raw.get("RecallDate"))
    title = clean_text(raw.get("Title"))
    url = safe_url(raw.get("URL"))
    if not (recall_number and recall_day and title and url):
        return None

    products = [p for p in raw.get("Products") or [] if isinstance(p, dict)]
    product = products[0] if products else {}

    companies: list[str] = []
    for field in ("Manufacturers", "Importers", "Distributors"):
        for name in _names(raw.get(field)):
            if name not in companies:
                companies.append(name)

    upcs = _names(raw.get("ProductUPCs"), "UPC")

    return {
        "id": recall_number,
        "date": recall_day,
        "updated": parse_day(raw.get("LastPublishDate")) or recall_day,
        "title": title,
        "url": url,
        "product": clean_text(product.get("Name")),
        "model": clean_text(product.get("Model")),
        "category": clean_text(product.get("Type")),
        "units": clean_text(product.get("NumberOfUnits")),
        "description": clean_text(raw.get("Description")),
        "hazard": " ".join(_names(raw.get("Hazards"))),
        "remedy": " ".join(_names(raw.get("Remedies"))),
        "remedyOptions": _remedy_options(raw.get("RemedyOptions")),
        "injuries": " ".join(_names(raw.get("Injuries"))),
        "soldAt": _sold_at(raw.get("Retailers")),
        "companies": companies,
        "countries": _names(raw.get("ManufacturerCountries"), "Country"),
        "upcs": upcs,
        "image": _first_image(raw.get("Images")),
        "contact": clean_text(raw.get("ConsumerContact")),
    }


def build_dataset(
    raw_recalls: list[Any],
    *,
    since: date,
    generated_at: datetime,
) -> tuple[dict[str, Any], int]:
    """Normalize, de-duplicate and sort the recalls (newest first).

    Returns the dataset and how many records were skipped as unusable.
    """
    by_id: dict[str, dict[str, Any]] = {}
    skipped = 0
    for raw in raw_recalls:
        recall = normalize(raw)
        if recall is None:
            skipped += 1
            continue
        existing = by_id.get(recall["id"])
        # If the API ever repeats a recall, keep the most recently published version.
        if existing is None or recall["updated"] >= existing["updated"]:
            by_id[recall["id"]] = recall

    recalls = sorted(by_id.values(), key=lambda r: (r["date"], r["id"]), reverse=True)
    dataset = {
        "schemaVersion": SCHEMA_VERSION,
        "source": "U.S. Consumer Product Safety Commission Recalls API",
        "sourceUrl": API_URL,
        "generatedAt": generated_at.astimezone(timezone.utc).isoformat(timespec="seconds"),
        "since": since.isoformat(),
        "count": len(recalls),
        "recalls": recalls,
    }
    return dataset, skipped


def write_json(path: Path, data: dict[str, Any]) -> int:
    """Write the file atomically, so a failed run never leaves a half-written file.

    Returns the number of bytes written.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(payload)
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise
    return len(payload)


def parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--days",
        type=int,
        default=DEFAULT_DAYS,
        help=f"how many days of recalls to keep (default {DEFAULT_DAYS})",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="where to write the JSON (default frontend/public/data/recalls.json)",
    )
    parser.add_argument(
        "--min-count",
        type=int,
        default=1,
        help="fail instead of writing if fewer recalls than this come back (default 1)",
    )
    args = parser.parse_args(argv)
    if args.days < 1:
        parser.error("--days must be at least 1")
    return args


def main(
    argv: list[str] | None = None,
    *,
    client: httpx.Client | None = None,
    today: date | None = None,
    now: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
) -> int:
    args = parse_args(argv)
    since = (today or date.today()) - timedelta(days=args.days)

    owns_client = client is None
    if client is None:
        client = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
            timeout=httpx.Timeout(60.0, connect=10.0),
            follow_redirects=True,
        )
    try:
        raw = fetch_raw(client, since)
    except FetchError as err:
        print(f"error: {err}", file=sys.stderr)
        return 1
    finally:
        if owns_client:
            client.close()

    dataset, skipped = build_dataset(raw, since=since, generated_at=now())
    if dataset["count"] < args.min_count:
        print(
            f"error: only {dataset['count']} usable recalls since {since} "
            f"(expected at least {args.min_count}); not overwriting {args.out}",
            file=sys.stderr,
        )
        return 1

    size = write_json(args.out, dataset)
    note = f", skipped {skipped} incomplete" if skipped else ""
    print(f"Saved {dataset['count']} recalls since {since}{note} to {args.out} ({size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
