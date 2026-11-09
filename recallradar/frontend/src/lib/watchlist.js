/**
 * The watchlist: a short list of keywords kept in the browser's localStorage.
 * Nothing here is ever sent anywhere.
 */
import { normalizeText } from "./match.js";

export const STORAGE_KEY = "recallradar:watchlist";
export const MAX_KEYWORDS = 50;
export const MAX_KEYWORD_LENGTH = 60;

/** localStorage, or null where it's blocked (some private modes throw on access). */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Collapse spaces and trim. Returns "" if nothing searchable is left. */
export function cleanKeyword(raw) {
  if (typeof raw !== "string") return "";
  const text = raw.split(/\s+/).join(" ").trim().slice(0, MAX_KEYWORD_LENGTH).trim();
  return normalizeText(text) ? text : "";
}

function sameKeyword(a, b) {
  return normalizeText(a) === normalizeText(b);
}

/**
 * Add a keyword. Returns the new list, or the old list with an error message.
 * @returns {{ list: string[], error?: string }}
 */
export function addKeyword(list, raw) {
  const keyword = cleanKeyword(raw);
  if (!keyword) return { list, error: "Type a product, brand or word to watch for." };
  if (list.some((k) => sameKeyword(k, keyword))) {
    return { list, error: `"${keyword}" is already on your watchlist.` };
  }
  if (list.length >= MAX_KEYWORDS) {
    return { list, error: `Your watchlist is full (${MAX_KEYWORDS} keywords). Remove one first.` };
  }
  return { list: [...list, keyword] };
}

export function removeKeyword(list, keyword) {
  return list.filter((k) => k !== keyword);
}

/** Read the saved watchlist. Bad or missing data gives an empty list instead of an error. */
export function loadWatchlist(storage = browserStorage()) {
  let saved;
  try {
    saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(saved)) return [];

  let list = [];
  for (const item of saved) {
    list = addKeyword(list, item).list;
  }
  return list;
}

/** Save the watchlist. Returns false if the browser wouldn't store it. */
export function saveWatchlist(list, storage = browserStorage()) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
