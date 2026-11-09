import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDay, loadRecalls, safeHref } from "../src/lib/data.js";
import { parseHash, recallHref } from "../src/lib/route.js";

function fakeFetch(body, { status = 200 } = {}) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => (typeof body === "string" ? JSON.parse(body) : body),
    };
  };
  impl.calls = calls;
  return impl;
}

const GOOD = {
  schemaVersion: 1,
  generatedAt: "2026-11-09T06:00:00+00:00",
  since: "2024-11-09",
  count: 2,
  recalls: [
    { id: "27902", date: "2026-10-09", title: "Hearthglow Recalls Space Heaters" },
    { id: "27901", date: "2026-10-02", title: "Brightwell Kids Recalls Strollers" },
  ],
};

describe("loadRecalls", () => {
  it("returns the recalls and metadata", async () => {
    const fetch = fakeFetch(GOOD);
    const data = await loadRecalls("data/recalls.json", fetch);
    assert.equal(data.recalls.length, 2);
    assert.equal(data.generatedAt, "2026-11-09T06:00:00+00:00");
    assert.equal(data.since, "2024-11-09");
    assert.deepEqual(fetch.calls, [{ url: "data/recalls.json", options: { cache: "no-cache" } }]);
  });

  it("drops records that are missing the basics", async () => {
    const body = { ...GOOD, recalls: [...GOOD.recalls, { id: 5 }, null, "x"] };
    const data = await loadRecalls("x", fakeFetch(body));
    assert.equal(data.recalls.length, 2);
  });

  it("explains a missing file", async () => {
    await assert.rejects(loadRecalls("x", fakeFetch({}, { status: 404 })), /HTTP 404/);
  });

  it("explains a network failure", async () => {
    const failing = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(loadRecalls("x", failing), /Couldn't reach the server/);
  });

  it("rejects a damaged file", async () => {
    await assert.rejects(loadRecalls("x", fakeFetch("{oops")), /damaged/);
  });

  it("rejects a file from a different schema version", async () => {
    await assert.rejects(loadRecalls("x", fakeFetch({ ...GOOD, schemaVersion: 2 })), /format/);
    await assert.rejects(loadRecalls("x", fakeFetch({ recalls: "nope" })), /format/);
  });
});

describe("safeHref", () => {
  it("allows http and https links", () => {
    assert.equal(safeHref("https://www.cpsc.gov/Recalls/1"), "https://www.cpsc.gov/Recalls/1");
    assert.equal(safeHref("http://example.com/"), "http://example.com/");
  });
  it("blocks everything else", () => {
    assert.equal(safeHref("javascript:alert(1)"), null);
    assert.equal(safeHref("data:text/html,hi"), null);
    assert.equal(safeHref("/relative"), null);
    assert.equal(safeHref(undefined), null);
  });
});

describe("formatDay", () => {
  it("formats a calendar day without shifting it", () => {
    assert.equal(formatDay("2026-11-05", "en-US"), "Nov 5, 2026");
    assert.equal(formatDay("2026-01-01T00:00:00", "en-US"), "Jan 1, 2026");
  });
  it("returns an empty string for bad input", () => {
    assert.equal(formatDay("soon", "en-US"), "");
    assert.equal(formatDay(null, "en-US"), "");
  });
});

describe("routes", () => {
  it("parses recall routes", () => {
    assert.deepEqual(parseHash("#/recall/27066"), { view: "recall", id: "27066" });
    assert.deepEqual(parseHash("#/recall/27066/"), { view: "recall", id: "27066" });
  });
  it("falls back to home", () => {
    for (const hash of ["", "#", "#/", "#/recall/", "#/other/1", "#/recall/%E0%A4%A"]) {
      assert.deepEqual(parseHash(hash), { view: "home" }, hash);
    }
  });
  it("round-trips ids through links", () => {
    assert.deepEqual(parseHash(recallHref("a/b c")), { view: "recall", id: "a/b c" });
  });
});
