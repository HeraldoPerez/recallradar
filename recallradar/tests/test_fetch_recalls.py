import json
from datetime import date, datetime, timezone
from pathlib import Path

import httpx
import pytest

import fetch_recalls as fr

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "cpsc_sample.json").read_text("utf-8"))
SINCE = date(2024, 11, 9)
NOW = datetime(2026, 11, 9, 6, 0, tzinfo=timezone.utc)


def mock_client(handler):
    return httpx.Client(transport=httpx.MockTransport(handler))


def by_number(number):
    return next(r for r in FIXTURE if r["RecallNumber"] == number)


# ---------------------------------------------------------------- small helpers


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("  Sold At:\nToy stores  nationwide ", "Sold At: Toy stores nationwide"),
        ("fire hazard", "fire hazard"),
        (None, ""),
        (42, ""),
    ],
)
def test_clean_text(value, expected):
    assert fr.clean_text(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("https://www.cpsc.gov/x", "https://www.cpsc.gov/x"),
        ("HTTP://example.com", "HTTP://example.com"),
        # Real CPSC data sometimes has a single slash after the scheme.
        ("https:/www.cpsc.gov/Recalls/2026/x", "https://www.cpsc.gov/Recalls/2026/x"),
        ("https:///evil", None),
        ("javascript:alert(1)", None),
        ("data:text/html,hi", None),
        ("", None),
        (None, None),
    ],
)
def test_safe_url(value, expected):
    assert fr.safe_url(value) == expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2026-11-05T00:00:00", "2026-11-05"),
        ("2026-11-05", "2026-11-05"),
        ("not a date", None),
        (None, None),
    ],
)
def test_parse_day(value, expected):
    assert fr.parse_day(value) == expected


# ---------------------------------------------------------------- normalize


def test_normalize_full_record():
    recall = fr.normalize(by_number("27901") | {"LastPublishDate": "2026-10-02T00:00:00"})
    assert recall == {
        "id": "27901",
        "date": "2026-10-02",
        "updated": "2026-10-02",
        "title": "Brightwell Kids Recalls Trailblazer Strollers Due to Fall Hazard",
        "url": "https://www.cpsc.gov/Recalls/2027/Brightwell-Kids-Recalls-Trailblazer-Strollers-Due-to-Fall-Hazard",
        "product": "Brightwell Kids Trailblazer Strollers",
        "model": "BW-200",
        "category": "Strollers",
        "units": "About 12,000",
        "description": (
            "This recall involves Brightwell Kids Trailblazer strollers with model number BW-200. "
            "The model number is printed on a label under the seat."
        ),
        "hazard": "The seat can detach from the frame, posing a fall hazard to children.",
        "remedy": (
            "Consumers should stop using the recalled strollers immediately and contact "
            "Brightwell Kids for a full refund."
        ),
        "remedyOptions": ["Refund"],
        "injuries": "The firm has received three reports of the seat detaching. No injuries have been reported.",
        "soldAt": (
            "Toy stores nationwide and online at brightwell.example.com "
            "from January 2025 through August 2026 for about $250."
        ),
        "companies": ["Brightwell Kids LLC, of Columbus, Ohio"],
        "countries": ["Vietnam"],
        "upcs": ["000111222333"],
        "image": {
            "url": "https://www.cpsc.gov/s3fs-public/example-stroller-front.png",
            "caption": "Recalled Trailblazer stroller",
        },
        "contact": (
            "Brightwell Kids toll-free at 800-555-0101 from 9 a.m. to 5 p.m. ET Monday through Friday, "
            "or email at recall@brightwell.example.com."
        ),
    }


def test_normalize_handles_missing_product_and_messy_lists():
    recall = fr.normalize(by_number("27902"))
    assert recall["product"] == ""
    assert recall["model"] == ""
    assert recall["units"] == ""
    # The javascript: image is skipped and the next safe one is used.
    assert recall["image"]["url"] == "https://www.cpsc.gov/s3fs-public/example-heater.png"
    # Junk and repeated remedy options are dropped.
    assert recall["remedyOptions"] == ["Replace"]
    # Several remedies are joined; the same company listed twice appears once.
    assert recall["remedy"] == "Consumers should stop using the heaters. Contact Hearthglow for a free replacement."
    assert recall["companies"] == ["Hearthglow Inc., of Austin, Texas"]
    assert recall["injuries"] == ""
    assert recall["soldAt"] == ""


@pytest.mark.parametrize(
    "broken",
    [
        {"Title": ""},
        {"RecallNumber": None},
        {"RecallDate": "not a date"},
        {"URL": "javascript:alert(1)"},
    ],
)
def test_normalize_rejects_incomplete_records(broken):
    assert fr.normalize(by_number("27850") | broken) is None


def test_normalize_rejects_non_objects():
    assert fr.normalize("nope") is None
    assert fr.normalize(None) is None


@pytest.mark.parametrize(
    ("retailer", "expected"),
    [
        ("Sold At:\nHardware stores nationwide", "Hardware stores nationwide"),
        ("Sold Online At: Amazon.com from May 2026", "Online: Amazon.com from May 2026"),
        ("sold at: lowercase too", "lowercase too"),
        ("Online exclusively at http://example.com", "Online exclusively at http://example.com"),
    ],
)
def test_normalize_drops_the_sold_at_label(retailer, expected):
    raw = by_number("27850") | {"Retailers": [{"Name": retailer, "CompanyID": ""}]}
    assert fr.normalize(raw)["soldAt"] == expected


def test_normalize_uses_recall_date_when_last_publish_date_missing():
    recall = fr.normalize(by_number("27850") | {"LastPublishDate": None})
    assert recall["updated"] == "2026-09-18"


# ---------------------------------------------------------------- build_dataset


def test_build_dataset_sorts_dedupes_and_counts_skipped():
    dataset, skipped = fr.build_dataset(FIXTURE, since=SINCE, generated_at=NOW)

    assert skipped == 2  # the untitled record and the broken date
    assert dataset["count"] == 3
    assert [r["id"] for r in dataset["recalls"]] == ["27902", "27901", "27850"]
    assert dataset["since"] == "2024-11-09"
    assert dataset["generatedAt"] == "2026-11-09T06:00:00+00:00"
    assert dataset["schemaVersion"] == fr.SCHEMA_VERSION

    # The repeated recall keeps its most recently published version.
    stroller = dataset["recalls"][1]
    assert stroller["title"].endswith("(updated)")
    assert stroller["updated"] == "2026-10-04"


def test_build_dataset_keeps_newer_version_regardless_of_order():
    dataset, _ = fr.build_dataset(list(reversed(FIXTURE)), since=SINCE, generated_at=NOW)
    stroller = next(r for r in dataset["recalls"] if r["id"] == "27901")
    assert stroller["updated"] == "2026-10-04"


def test_build_dataset_empty():
    dataset, skipped = fr.build_dataset([], since=SINCE, generated_at=NOW)
    assert dataset["count"] == 0
    assert dataset["recalls"] == []
    assert skipped == 0


# ---------------------------------------------------------------- fetch_raw


def test_fetch_raw_sends_the_right_query():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json=FIXTURE)

    with mock_client(handler) as client:
        data = fr.fetch_raw(client, SINCE)

    assert data == FIXTURE
    assert len(seen) == 1
    assert str(seen[0].url).startswith(fr.API_URL)
    assert dict(seen[0].url.params) == {"format": "json", "RecallDateStart": "2024-11-09"}


def test_fetch_raw_retries_server_errors_then_succeeds():
    responses = iter([httpx.Response(503), httpx.Response(200, json=[])])
    sleeps = []

    with mock_client(lambda request: next(responses)) as client:
        assert fr.fetch_raw(client, SINCE, sleep=sleeps.append) == []

    assert sleeps == [2.0]


def test_fetch_raw_gives_up_after_repeated_timeouts():
    calls = []
    sleeps = []

    def handler(request):
        calls.append(request)
        raise httpx.ReadTimeout("too slow", request=request)

    with mock_client(handler) as client, pytest.raises(fr.FetchError, match="couldn't reach"):
        fr.fetch_raw(client, SINCE, sleep=sleeps.append)

    assert len(calls) == 3
    assert sleeps == [2.0, 4.0]


def test_fetch_raw_does_not_retry_client_errors():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(404)

    with mock_client(handler) as client, pytest.raises(fr.FetchError, match="HTTP 404"):
        fr.fetch_raw(client, SINCE, sleep=lambda s: None)

    assert len(calls) == 1


def test_fetch_raw_retries_responses_that_are_not_json():
    responses = iter([httpx.Response(200, text="<html>maintenance</html>"), httpx.Response(200, json=FIXTURE)])
    with mock_client(lambda request: next(responses)) as client:
        assert fr.fetch_raw(client, SINCE, sleep=lambda s: None) == FIXTURE


def test_fetch_raw_rejects_unexpected_shape():
    with mock_client(lambda request: httpx.Response(200, json={"error": "x"})) as client:
        with pytest.raises(fr.FetchError, match="expected a JSON list"):
            fr.fetch_raw(client, SINCE, sleep=lambda s: None)


# ---------------------------------------------------------------- write_json and main


def test_write_json_creates_folders_and_leaves_no_temp_files(tmp_path):
    out = tmp_path / "nested" / "recalls.json"
    size = fr.write_json(out, {"hello": "wörld"})

    assert json.loads(out.read_text("utf-8")) == {"hello": "wörld"}
    assert size == out.stat().st_size
    assert [p.name for p in out.parent.iterdir()] == ["recalls.json"]


def run_main(tmp_path, handler, *extra_args):
    out = tmp_path / "recalls.json"
    with mock_client(handler) as client:
        code = fr.main(
            ["--out", str(out), *extra_args],
            client=client,
            today=date(2026, 11, 9),
            now=lambda: NOW,
        )
    return code, out


def test_main_writes_the_dataset(tmp_path, capsys):
    requested = []

    def handler(request):
        requested.append(request.url.params["RecallDateStart"])
        return httpx.Response(200, json=FIXTURE)

    code, out = run_main(tmp_path, handler, "--days", "30")

    assert code == 0
    assert requested == ["2026-10-10"]
    data = json.loads(out.read_text("utf-8"))
    assert data["count"] == 3
    assert data["since"] == "2026-10-10"
    assert "Saved 3 recalls since 2026-10-10, skipped 2 incomplete" in capsys.readouterr().out


def test_main_keeps_the_old_file_when_the_api_fails(tmp_path, capsys):
    out = tmp_path / "recalls.json"
    out.write_text('{"old": true}', "utf-8")

    code, _ = run_main(tmp_path, lambda request: httpx.Response(404))

    assert code == 1
    assert out.read_text("utf-8") == '{"old": true}'
    assert "HTTP 404" in capsys.readouterr().err


def test_main_refuses_to_write_an_empty_dataset(tmp_path, capsys):
    code, out = run_main(tmp_path, lambda request: httpx.Response(200, json=[]))

    assert code == 1
    assert not out.exists()
    assert "only 0 usable recalls" in capsys.readouterr().err


def test_main_rejects_bad_days(tmp_path):
    with pytest.raises(SystemExit) as exc:
        fr.main(["--days", "0", "--out", str(tmp_path / "x.json")])
    assert exc.value.code == 2
