# Changelog

Notable changes go here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

- Project started.
- `fetch_recalls.py` downloads the last two years of CPSC recalls and writes `frontend/public/data/recalls.json`. It retries timeouts and 429/5xx responses, writes the file atomically, and exits with an error instead of overwriting good data when the API fails or returns too few recalls.
- The fetcher cleans up the API data: collapses whitespace, keeps only known remedy labels and http(s) links, repairs `https:/` link typos, removes duplicate recalls and trims the "Sold At:" label.
- React app: a watchlist saved in localStorage, the recalls that match it with a count per keyword, search across all recalls, and a detail page with the hazard, remedy, photo and a link to the official notice. Works on phones, follows the system dark mode, and supports keyboard and screen reader use.
- Watchlist matching on whole words, with simple plurals, accents, hyphenated words and model numbers handled.
- Tests for the fetcher (pytest) and the app logic (Node test runner), with made-up fixture data.
- GitHub Actions: CI on every push and pull request, and a daily data refresh with a GitHub Pages deploy.
