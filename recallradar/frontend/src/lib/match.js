/**
 * Watchlist matching.
 *
 * A keyword matches a recall when every word of the keyword appears somewhere in
 * the recall's title, product name, model, category, description or UPCs.
 *
 * Words are compared whole, after lowercasing, removing accents and folding simple
 * plurals. So "space heater" matches "Space Heaters", "battery" matches "batteries",
 * but "car" doesn't match "carbon". Hyphenated words also match when typed without
 * the hyphen: "ebike" matches "e-bike" and "bw200" matches "BW-200".
 */

const SEARCH_FIELDS = ["title", "product", "model", "category", "description"];

/** Lowercase and strip accents, keeping punctuation (used to split words later). */
function fold(value) {
  return value.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lowercase, strip accents and turn anything that isn't a letter or digit into a single space. */
export function normalizeText(value) {
  if (typeof value !== "string") return "";
  return fold(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Fold a word to a rough singular, so plural and singular forms compare equal.
 * Both the recall text and the keyword go through this, so the result only has
 * to be consistent, not a real English word ("battery" and "batteries" -> "batteri").
 */
export function stem(word) {
  let w = word;
  if (w.length > 4 && w.endsWith("ies")) w = w.slice(0, -3) + "i";
  else if (w.length > 4 && /(ss|x|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !/(ss|us|is)$/.test(w)) w = w.slice(0, -1);

  if (w.length > 3 && w.endsWith("y")) w = w.slice(0, -1) + "i";
  else if (w.length > 3 && w.endsWith("ie")) w = w.slice(0, -1);
  return w;
}

/**
 * Split text into chunks (runs without spaces), each with its word parts and the
 * parts joined together. "e-bike" -> { parts: ["e", "bike"], joined: "ebike" }.
 */
function chunks(text) {
  const out = [];
  for (const chunk of fold(text).split(/\s+/)) {
    const parts = chunk
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map(stem);
    if (parts.length === 0) continue;
    out.push({ parts, joined: parts.length > 1 ? stem(parts.join("")) : parts[0] });
  }
  return out;
}

const indexCache = new WeakMap();

/**
 * What a recall can be matched on, cached per recall object:
 *   words:  every folded word, plus hyphenated words joined ("ebike", "bw200")
 *   phrase: the folded words in order, space-separated, to check that the parts of a
 *           hyphenated keyword appear side by side ("| e bike |"), not just anywhere.
 */
export function recallIndex(recall) {
  let index = indexCache.get(recall);
  if (index) return index;

  const words = new Set();
  const sequences = [];
  const texts = SEARCH_FIELDS.map((field) => recall[field]);
  if (Array.isArray(recall.upcs)) texts.push(...recall.upcs);
  for (const text of texts) {
    if (typeof text !== "string") continue;
    const sequence = [];
    for (const { parts, joined } of chunks(text)) {
      for (const part of parts) words.add(part);
      words.add(joined);
      sequence.push(...parts);
    }
    sequences.push(sequence.join(" "));
  }
  // "|" can't appear in a folded word, so phrases never run across two fields.
  index = { words, phrase: ` ${sequences.join(" | ")} ` };
  indexCache.set(recall, index);
  return index;
}

/**
 * Prepare a keyword for matching. Returns null if it has no letters or digits.
 * @param {string} keyword
 */
export function parseKeyword(keyword) {
  const parsed = typeof keyword === "string" ? chunks(keyword) : [];
  return parsed.length > 0 ? { keyword, chunks: parsed } : null;
}

/**
 * Whether a parsed keyword matches a recall. Separate words can appear anywhere;
 * the parts of one hyphenated word must appear together, or joined.
 */
export function keywordMatches(parsed, recall) {
  const { words, phrase } = recallIndex(recall);
  return parsed.chunks.every(({ parts, joined }) =>
    parts.length === 1 ? words.has(joined) : words.has(joined) || phrase.includes(` ${parts.join(" ")} `),
  );
}

/**
 * Find the recalls that match at least one keyword, keeping the recalls' order.
 * @param {object[]} recalls
 * @param {string[]} keywords
 * @returns {{ matches: { recall: object, keywords: string[] }[], counts: Map<string, number> }}
 *   `keywords` lists which keywords matched each recall; `counts` is matches per keyword.
 */
export function matchRecalls(recalls, keywords) {
  const parsed = keywords.map(parseKeyword).filter(Boolean);
  const counts = new Map(keywords.map((k) => [k, 0]));
  const matches = [];
  if (parsed.length === 0) return { matches, counts };

  for (const recall of recalls) {
    const hit = parsed.filter((p) => keywordMatches(p, recall)).map((p) => p.keyword);
    if (hit.length > 0) {
      matches.push({ recall, keywords: hit });
      for (const k of hit) counts.set(k, counts.get(k) + 1);
    }
  }
  return { matches, counts };
}

/** Filter recalls by a free-text search, with the same rules as the watchlist. */
export function searchRecalls(recalls, query) {
  const parsed = parseKeyword(query);
  if (!parsed) return recalls;
  return recalls.filter((recall) => keywordMatches(parsed, recall));
}
