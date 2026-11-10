# RecallRadar

A recall watchlist. Add the things you own or sell (a stroller brand, "space heater", a model number) and RecallRadar shows every U.S. Consumer Product Safety Commission (CPSC) recall that matches, with the hazard, the remedy and a link to the official notice.

The CPSC already publishes every recall. RecallRadar is a way to watch for the things you own without checking the site every week. Your watchlist stays in your browser: no account, no server, no tracking.

## Status

Early, but the main loop works. The fetcher downloads two years of CPSC recalls (about 960), and the app lets you build a watchlist, see the recalls that match and open each one in full. It isn't deployed yet. The GitHub Actions workflow that refreshes the data daily and publishes to GitHub Pages is written and goes live with v0.1.0. What's done and what's next is in [ROADMAP.md](ROADMAP.md).

## How it works

```
GitHub Actions, daily:  CPSC Recalls API -> fetch_recalls.py -> recalls.json -> Vite build -> GitHub Pages

In your browser:        load recalls.json -> match it against your watchlist (kept in localStorage)
```

- `fetch_recalls.py` asks the CPSC Recalls API (no key needed) for every recall from the last 730 days, cleans up the records and writes one compact JSON file, about 2.3 MB (525 KB gzipped). It retries when the API is slow or down, and won't overwrite the last good file if the response looks wrong.
- The React app loads that file and does all the matching in the browser.

## Privacy

Your watchlist never leaves your browser. It's saved in `localStorage` on your device and matched there. There's no account, no analytics and no server that sees it. The only outside requests are for the recall data file and, when you open a recall, its photo from cpsc.gov.

## How matching works

A keyword matches a recall when all of its words appear in the recall's title, product name, description or UPCs.

- Whole words only: `car` matches "Car Seat" but not "carbon monoxide".
- Simple plurals count: `heater` matches "Space Heaters" and `battery` matches "batteries".
- Case and accents don't matter.
- Hyphens are flexible: `e-bike` matches "E-Bikes" and "ebike", and `bw200` matches model "BW-200". The parts of a hyphenated keyword have to be next to each other, so `e-bike` doesn't match a motorcycle with model "TF450-E" that mentions a "bike" somewhere else.

## Running it locally

Needs Python 3.10+ and Node 22.12+.

```bash


# 1. Fetch the recall data (takes about 10 seconds)
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python fetch_recalls.py            # writes frontend/public/data/recalls.json

# 2. Run the app
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

`python fetch_recalls.py --help` lists the options (`--days`, `--out`, `--min-count`).

## Tests

```bash
pip install -r requirements-dev.txt
pytest                             # fetcher

cd frontend
npm test                           # matching, watchlist, data loading, routes
```

Neither suite needs a network connection. The fetcher tests use made-up recalls in the same shape as the real API, including the problems found in real data (see below). GitHub Actions runs both suites on every push and pull request.

## Deploying

`.github/workflows/deploy.yml` refreshes the data and publishes the app to GitHub Pages every day, on every push to `main`, and on demand from the Actions tab. To turn it on, go to **Settings → Pages** and set **Source** to **GitHub Actions**. If the CPSC API is down, the run fails and the previous version stays live.

GitHub pauses scheduled workflows in repositories that have had no activity for 60 days, so the daily refresh needs a commit now and then.

## Notes on the CPSC data

Found in the real API responses since November 2024, and how the fetcher deals with them:

- `HazardType` is empty in 972 of 974 recalls, so hazard categories will have to come from the hazard text (on the roadmap).
- The product `Type` is empty in about 88% of recalls and `Model` is always empty. Model numbers are in the description, which is why matching searches it.
- `RemedyOptions` sometimes holds a stray letter or a whole sentence. Only the known labels (Refund, Repair, Replace and so on) are kept.
- At least one recall link has a typo (`https:/www.cpsc.gov/...`). The fetcher repairs it instead of dropping the recall.
- Retailer text starts with "Sold At:" or "Sold Online At:". The fetcher trims that, because the app shows its own label.

## Project layout

```
fetch_recalls.py          CPSC fetcher (Python, httpx)
tests/                    fetcher tests and made-up fixtures
frontend/                 React app (Vite)
  src/lib/match.js        watchlist matching
  src/lib/watchlist.js    saving the watchlist in localStorage
  src/lib/data.js         loading recalls.json
  src/components/         watchlist editor, recall list, recall detail
  tests/                  tests for src/lib (Node's built-in test runner)
.github/workflows/        CI, and the daily refresh and deploy
```

## Built with

Python and httpx for the fetcher. React 19 and Vite 8 for the app, with no other runtime dependencies.

## Data

Recall data comes from the U.S. Consumer Product Safety Commission's public Recalls API. RecallRadar isn't affiliated with or endorsed by the CPSC. Always follow the official recall notice.

## License

MIT, see [LICENSE](LICENSE).
