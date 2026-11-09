import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_KEYWORD_LENGTH,
  MAX_KEYWORDS,
  STORAGE_KEY,
  addKeyword,
  cleanKeyword,
  loadWatchlist,
  removeKeyword,
  saveWatchlist,
} from "../src/lib/watchlist.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    data,
  };
}

describe("cleanKeyword", () => {
  it("collapses spaces and trims", () => {
    assert.equal(cleanKeyword("  space \n  heater "), "space heater");
  });
  it("rejects keywords with nothing searchable", () => {
    assert.equal(cleanKeyword(" -- "), "");
    assert.equal(cleanKeyword(undefined), "");
  });
  it("caps the length", () => {
    assert.equal(cleanKeyword("a".repeat(100)).length, MAX_KEYWORD_LENGTH);
  });
});

describe("addKeyword", () => {
  it("adds a cleaned keyword", () => {
    assert.deepEqual(addKeyword(["crib"], "  Space  Heater "), { list: ["crib", "Space Heater"] });
  });
  it("refuses duplicates, ignoring case and punctuation", () => {
    const result = addKeyword(["E-Bike"], "e bike");
    assert.deepEqual(result.list, ["E-Bike"]);
    assert.match(result.error, /already on your watchlist/);
  });
  it("refuses empty input", () => {
    assert.match(addKeyword([], "   ").error, /Type a product/);
  });
  it("refuses when full", () => {
    const full = Array.from({ length: MAX_KEYWORDS }, (_, i) => `item ${i}`);
    const result = addKeyword(full, "one more");
    assert.equal(result.list, full);
    assert.match(result.error, /full/);
  });
});

describe("removeKeyword", () => {
  it("removes only that keyword", () => {
    assert.deepEqual(removeKeyword(["crib", "stroller"], "crib"), ["stroller"]);
  });
});

describe("loadWatchlist / saveWatchlist", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    assert.equal(saveWatchlist(["crib", "space heater"], storage), true);
    assert.equal(storage.data.get(STORAGE_KEY), '["crib","space heater"]');
    assert.deepEqual(loadWatchlist(storage), ["crib", "space heater"]);
  });

  it("starts empty when nothing is saved", () => {
    assert.deepEqual(loadWatchlist(memoryStorage()), []);
  });

  it("ignores damaged or unexpected data", () => {
    assert.deepEqual(loadWatchlist(memoryStorage({ [STORAGE_KEY]: "{not json" })), []);
    assert.deepEqual(loadWatchlist(memoryStorage({ [STORAGE_KEY]: '{"a":1}' })), []);
  });

  it("drops bad entries and duplicates from saved data", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '["crib", 5, "", "CRIB", null, "stroller"]' });
    assert.deepEqual(loadWatchlist(storage), ["crib", "stroller"]);
  });

  it("works when storage is unavailable", () => {
    assert.deepEqual(loadWatchlist(null), []);
    assert.equal(saveWatchlist(["crib"], null), false);
  });

  it("reports when the browser refuses to save", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    assert.equal(saveWatchlist(["crib"], storage), false);
  });
});
