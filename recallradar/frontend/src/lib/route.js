/**
 * Hash routes, so the app works on GitHub Pages without server rewrites.
 *   #/              -> home
 *   #/recall/27066  -> one recall
 */

export function parseHash(hash) {
  const m = /^#\/recall\/([^/?#]+)\/?$/.exec(hash ?? "");
  if (m) {
    try {
      return { view: "recall", id: decodeURIComponent(m[1]) };
    } catch {
      // A malformed %-escape falls through to home.
    }
  }
  return { view: "home" };
}

export function recallHref(id) {
  return `#/recall/${encodeURIComponent(id)}`;
}
