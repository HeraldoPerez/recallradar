/** Loading and formatting the recall data produced by fetch_recalls.py. */

export const SUPPORTED_SCHEMA = 1;

/** Only http(s) links with a host are rendered. Anything else returns null. */
export function safeHref(url) {
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && parsed.host ? parsed.href : null;
  } catch {
    return null;
  }
}

function isRecall(item) {
  return (
    item !== null &&
    typeof item === "object" &&
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.date === "string"
  );
}

/**
 * Fetch and check recalls.json.
 * @param {string} url
 * @param {typeof fetch} fetchImpl
 */
export async function loadRecalls(url, fetchImpl = globalThis.fetch) {
  let response;
  try {
    // "no-cache" still uses the browser cache, but checks for a newer daily file first.
    response = await fetchImpl(url, { cache: "no-cache" });
  } catch {
    throw new Error("Couldn't reach the server to load recall data. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new Error(`Couldn't load recall data (HTTP ${response.status}).`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The recall data file is damaged.");
  }
  if (!data || !Array.isArray(data.recalls) || data.schemaVersion !== SUPPORTED_SCHEMA) {
    throw new Error("The recall data file is in a format this version of the app doesn't understand.");
  }

  return {
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : null,
    since: typeof data.since === "string" ? data.since : null,
    recalls: data.recalls.filter(isRecall),
  };
}

/**
 * "2026-11-05" -> "Nov 5, 2026" in the reader's locale. The day is read as a local
 * date, so it never shifts by one in time zones west of UTC.
 */
export function formatDay(day, locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  if (!m) return "";
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(date);
}
