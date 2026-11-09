import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchRecalls, normalizeText, parseKeyword, searchRecalls, stem } from "../src/lib/match.js";

// Made-up recalls in the shape fetch_recalls.py writes (only the searchable fields).
const heater = {
  id: "1",
  title: "Hearthglow Recalls Space Heaters Due to Fire and Burn Hazards",
  product: "Hearthglow Ceramic Space Heaters",
  model: "",
  category: "Portable Heaters",
  description: "This recall involves Hearthglow ceramic space heaters, model HG-1500.",
  upcs: ["000111222333"],
};
const ebike = {
  id: "2",
  title: "Voltway Recalls E-Bike Batteries Due to Fire Hazard",
  product: "Voltway E-Bike Batteries",
  model: "",
  category: "",
  description: "Lithium-ion batteries sold with Voltway e-bikes.",
  upcs: [],
};
const carbon = {
  id: "3",
  title: "Northfield Recalls Carbon Monoxide Alarms Due to Failure to Alert",
  product: "Northfield CO Alarms",
  model: "",
  category: "",
  description: "The alarms can fail to alert consumers to carbon monoxide.",
  upcs: [],
};
const hoodie = {
  id: "4",
  title: "Pinecone Kids Recalls Children's Hoodies Due to Strangulation Hazard",
  product: "Pinecone Kids Hoodies",
  model: "",
  category: "",
  description: "Children's hoodie sweatshirts with drawstrings at the neck. Crème and navy.",
  upcs: [],
};
const RECALLS = [heater, ebike, carbon, hoodie];

function ids(list) {
  return list.map((r) => (r.recall ?? r).id);
}

describe("normalizeText", () => {
  it("lowercases, strips accents and punctuation", () => {
    assert.equal(normalizeText("  Crème-Brûlée  TORCH!! "), "creme brulee torch");
  });
  it("returns an empty string for non-strings", () => {
    assert.equal(normalizeText(undefined), "");
    assert.equal(normalizeText(42), "");
  });
});

describe("stem", () => {
  const pairs = [
    ["heaters", "heater"],
    ["batteries", "battery"],
    ["hoodies", "hoodie"],
    ["glasses", "glass"],
    ["boxes", "box"],
    ["horses", "horse"],
    ["toys", "toy"],
    ["babies", "baby"],
  ];
  for (const [plural, singular] of pairs) {
    it(`folds "${plural}" and "${singular}" to the same word`, () => {
      assert.equal(stem(plural), stem(singular));
    });
  }
  it("leaves short and non-plural words alone", () => {
    assert.equal(stem("gas"), "gas");
    assert.equal(stem("bus"), "bus");
    assert.equal(stem("dress"), "dress");
    assert.equal(stem("chassis"), "chassis");
  });
});

describe("parseKeyword", () => {
  it("returns null for keywords with nothing searchable", () => {
    assert.equal(parseKeyword("  -- !! "), null);
    assert.equal(parseKeyword(""), null);
    assert.equal(parseKeyword(null), null);
  });
});

describe("matchRecalls", () => {
  it("matches every word of a keyword, in any form", () => {
    const { matches } = matchRecalls(RECALLS, ["Space Heater"]);
    assert.deepEqual(ids(matches), ["1"]);
  });

  it("needs all the words, not just one", () => {
    assert.deepEqual(ids(matchRecalls(RECALLS, ["space blanket"]).matches), []);
  });

  it("matches whole words only", () => {
    // "car" must not match "carbon".
    assert.deepEqual(ids(matchRecalls(RECALLS, ["car"]).matches), []);
    assert.deepEqual(ids(matchRecalls(RECALLS, ["carbon monoxide"]).matches), ["3"]);
  });

  it("matches singular keywords against plural text and back", () => {
    assert.deepEqual(ids(matchRecalls(RECALLS, ["battery"]).matches), ["2"]);
    assert.deepEqual(ids(matchRecalls(RECALLS, ["hoodie"]).matches), ["4"]);
    assert.deepEqual(ids(matchRecalls(RECALLS, ["alarm"]).matches), ["3"]);
  });

  it("treats hyphenated words and joined words the same", () => {
    assert.deepEqual(ids(matchRecalls(RECALLS, ["ebike"]).matches), ["2"]);
    assert.deepEqual(ids(matchRecalls(RECALLS, ["e-bike"]).matches), ["2"]);
    assert.deepEqual(ids(matchRecalls(RECALLS, ["lithium ion"]).matches), ["2"]);
  });

  it("needs the parts of a hyphenated keyword side by side", () => {
    // Found in real data: "e-bike" matched a motorcycle recall with model "TF450-E" and the word "bike" elsewhere.
    const dirtBike = {
      id: "5",
      title: "Ridgeline Recalls Competition Dirt Bikes Due to Crash Hazard",
      product: "Ridgeline Dirt Bikes",
      description: "Affected models are RX-C and RX-E.",
    };
    assert.deepEqual(ids(matchRecalls([dirtBike, ebike], ["e-bike"]).matches), ["2"]);
    assert.deepEqual(ids(matchRecalls([dirtBike], ["RX-E"]).matches), ["5"]);
  });

  it("matches hyphenated keywords against the joined word too", () => {
    const joined = { id: "6", title: "Zoomly Recalls Folding Ebikes Due to Fall Hazard" };
    assert.deepEqual(ids(matchRecalls([joined], ["e-bike"]).matches), ["6"]);
    assert.deepEqual(ids(matchRecalls([joined], ["e bike"]).matches), []);
  });

  it("doesn't join phrases across fields", () => {
    const split = { id: "7", title: "Recall of Model E", product: "Bike Racks" };
    assert.deepEqual(ids(matchRecalls([split], ["e-bike"]).matches), []);
    assert.deepEqual(ids(matchRecalls([split], ["e bike"]).matches), ["7"]);
  });

  it("matches model numbers with or without punctuation", () => {
    assert.deepEqual(ids(matchRecalls(RECALLS, ["HG-1500"]).matches), ["1"]);
    assert.deepEqual(ids(matchRecalls(RECALLS, ["hg1500"]).matches), ["1"]);
  });

  it("matches UPCs", () => {
    assert.deepEqual(ids(matchRecalls(RECALLS, ["000111222333"]).matches), ["1"]);
  });

  it("ignores accents", () => {
    assert.deepEqual(ids(matchRecalls(RECALLS, ["creme"]).matches), ["4"]);
  });

  it("lists which keywords matched each recall and counts per keyword", () => {
    const { matches, counts } = matchRecalls(RECALLS, ["fire", "voltway", "stroller"]);
    assert.deepEqual(
      matches.map((m) => [m.recall.id, m.keywords]),
      [
        ["1", ["fire"]],
        ["2", ["fire", "voltway"]],
      ],
    );
    assert.deepEqual(
      [...counts],
      [
        ["fire", 2],
        ["voltway", 1],
        ["stroller", 0],
      ],
    );
  });

  it("keeps the order the recalls came in", () => {
    const { matches } = matchRecalls([hoodie, carbon, heater], ["recalls"]);
    assert.deepEqual(ids(matches), ["4", "3", "1"]);
  });

  it("returns nothing for an empty watchlist", () => {
    const { matches, counts } = matchRecalls(RECALLS, []);
    assert.deepEqual(matches, []);
    assert.equal(counts.size, 0);
  });

  it("skips keywords that have nothing searchable", () => {
    const { matches, counts } = matchRecalls(RECALLS, ["!!!", "hoodie"]);
    assert.deepEqual(ids(matches), ["4"]);
    assert.equal(counts.get("!!!"), 0);
  });

  it("copes with missing fields", () => {
    const sparse = { id: "9", title: "Space Heater Recall" };
    assert.deepEqual(ids(matchRecalls([sparse], ["space heaters"]).matches), ["9"]);
  });
});

describe("searchRecalls", () => {
  it("filters with the same rules", () => {
    assert.deepEqual(ids(searchRecalls(RECALLS, "fire hazard")), ["1", "2"]);
  });
  it("returns everything for an empty query", () => {
    assert.equal(searchRecalls(RECALLS, "   ").length, RECALLS.length);
  });
});
