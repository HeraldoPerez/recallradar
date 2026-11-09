# Roadmap

Rough plan. Estimates are my guesses and will change.

## v0.1.0: first usable version
- [x] Fetch recalls from the CPSC API and save as JSON, with retries and checks so a bad response never replaces good data
- [x] Watchlist UI, saved in localStorage
- [x] Match recalls against the watchlist (whole words, plurals, hyphens, model numbers, UPCs)
- [x] Recall detail view with the hazard, remedy, photo and a link to the official notice
- [x] Browse and search all recent recalls
- [x] Tests for the fetcher and the matching, run by GitHub Actions
- [x] Workflow to refresh the data daily and deploy to GitHub Pages
- [ ] Turn on Pages, check the first scheduled runs, then tag v0.1.0 with release notes (~1h)

## v0.2.0: more sources and filters
- [ ] Hazard categories (fire, choking, fall, entrapment and so on) worked out from the hazard text, because the API's `HazardType` field is almost always empty. Then a filter by category (~5h)
- [ ] Mark matches that are new since your last visit (~2h)
- [ ] Add NHTSA vehicle recalls, with watchlist entries for a vehicle's make, model and year (~6h)
- [ ] Add FDA food recalls from openFDA (~4h)
- [ ] Highlight the matched words in the recall text (~2h)

## v0.3.0: phone app
- [ ] Installable as a PWA, and works offline with the last downloaded data (~4h)
- [ ] Split the data into a small index plus per-recall details. The first load is about 525 KB gzipped today (~3h)
- [ ] Export and import the watchlist (file or link) to move it between devices without an account (~2h)
- [ ] RSS feeds for all recalls and for each hazard category. A feed per watchlist would need a server that sees the keywords, which breaks the privacy promise, so the feeds are static (~3h)

## Later
- [ ] Notifications. Web push needs a server that stores a subscription, so first work out what can be done privately (~5h)
- [ ] Synonyms (pram and stroller, cot and crib, powerbank and power bank) (~2h)
- [ ] Watch by retailer, such as "sold at Walmart" (~2h)
- [ ] Component tests for the React UI (~3h)
- [ ] Accessibility check with a screen reader (~2h)
