import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import RecallDetail from "./components/RecallDetail.jsx";
import RecallList from "./components/RecallList.jsx";
import WatchlistEditor from "./components/WatchlistEditor.jsx";
import { formatDay, loadRecalls } from "./lib/data.js";
import { matchRecalls, searchRecalls } from "./lib/match.js";
import { parseHash } from "./lib/route.js";
import { addKeyword, loadWatchlist, removeKeyword, saveWatchlist } from "./lib/watchlist.js";

const DATA_URL = `${import.meta.env.BASE_URL}data/recalls.json`;
const REPO_URL = "https://github.com/Khalick/recallradar";

function pluralize(n, one, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** The current hash route, plus where the list was scrolled when the user left it. */
function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  const routeRef = useRef(route);
  const listScroll = useRef(0);
  const openedFromList = useRef(null);

  useEffect(() => {
    function onHashChange() {
      const next = parseHash(window.location.hash);
      if (routeRef.current.view === "home" && next.view === "recall") {
        listScroll.current = window.scrollY;
        openedFromList.current = next.id;
      }
      routeRef.current = next;
      setRoute(next);
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return { route, listScroll, openedFromList };
}

export default function App() {
  const { route, listScroll, openedFromList } = useHashRoute();
  const [load, setLoad] = useState({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());
  const [saveFailed, setSaveFailed] = useState(false);
  const [tab, setTab] = useState(() => (watchlist.length > 0 ? "matches" : "latest"));
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    loadRecalls(DATA_URL).then(
      (data) => !cancelled && setLoad({ status: "ready", data }),
      (error) => !cancelled && setLoad({ status: "error", error }),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const recalls = load.status === "ready" ? load.data.recalls : null;
  const byId = useMemo(() => new Map((recalls ?? []).map((r) => [r.id, r])), [recalls]);
  const { matches, counts } = useMemo(() => matchRecalls(recalls ?? [], watchlist), [recalls, watchlist]);
  const matchedById = useMemo(() => new Map(matches.map((m) => [m.recall.id, m.keywords])), [matches]);
  const latest = useMemo(
    () => searchRecalls(recalls ?? [], deferredQuery).map((recall) => ({ recall })),
    [recalls, deferredQuery],
  );

  // Going into a recall starts at the top; coming back restores the list position and focus.
  useLayoutEffect(() => {
    if (route.view === "recall") {
      window.scrollTo(0, 0);
    } else if (openedFromList.current) {
      window.scrollTo(0, listScroll.current);
      const link = document.querySelector(`[data-recall-id="${CSS.escape(openedFromList.current)}"]`);
      link?.focus({ preventScroll: true });
      openedFromList.current = null;
    }
  }, [route, listScroll, openedFromList]);

  function updateWatchlist(next) {
    setWatchlist(next);
    setSaveFailed(!saveWatchlist(next));
  }

  function handleAdd(raw) {
    const { list, error } = addKeyword(watchlist, raw);
    if (error) return error;
    updateWatchlist(list);
    setTab("matches");
    return undefined;
  }

  function goBack() {
    if (openedFromList.current) window.history.back();
    else window.location.hash = "#/";
  }

  let content;
  if (load.status === "loading") {
    content = (
      <p className="status" role="status">
        Loading recalls…
      </p>
    );
  } else if (load.status === "error") {
    content = (
      <div className="panel" role="alert">
        <h2>Couldn't load recalls</h2>
        <p>{load.error.message}</p>
        {import.meta.env.DEV && (
          <p className="muted">
            Running locally? Create the data file first with <code>python fetch_recalls.py</code> in the project folder.
          </p>
        )}
        <button type="button" className="button" onClick={() => setAttempt((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  } else {
    const { since, generatedAt } = load.data;
    // The home view stays mounted (just hidden) while a recall is open, so the search,
    // "show more" paging and scroll position are all still there on the way back.
    content = (
      <>
        {route.view === "recall" && (
          <RecallDetail
            recall={byId.get(route.id)}
            id={route.id}
            since={since}
            matched={matchedById.get(route.id) ?? []}
            onBack={goBack}
          />
        )}
        <div hidden={route.view === "recall"}>
          <WatchlistEditor
            watchlist={watchlist}
            counts={counts}
            onAdd={handleAdd}
            onRemove={(keyword) => updateWatchlist(removeKeyword(watchlist, keyword))}
            saveFailed={saveFailed}
          />

          <div className="tabs" role="group" aria-label="Which recalls to show">
            <button type="button" className="tab" aria-pressed={tab === "matches"} onClick={() => setTab("matches")}>
              Your matches <span className="tab-count">{matches.length}</span>
            </button>
            <button type="button" className="tab" aria-pressed={tab === "latest"} onClick={() => setTab("latest")}>
              All recalls <span className="tab-count">{recalls.length.toLocaleString()}</span>
            </button>
          </div>

          {tab === "matches" ? (
            <section aria-label="Your matches">
              {watchlist.length === 0 ? (
                <p className="empty">Add something to your watchlist to see recalls that match it.</p>
              ) : matches.length === 0 ? (
                <p className="empty">
                  No recalls since {formatDay(since)} match your watchlist. That's good news. The data is refreshed
                  every day, so check back.
                </p>
              ) : (
                <>
                  <p className="result-count" role="status">
                    {pluralize(matches.length, "recall")} match your watchlist, newest first.
                  </p>
                  <RecallList key={watchlist.join("\n")} items={matches} label="Recalls matching your watchlist" />
                </>
              )}
            </section>
          ) : (
            <section aria-label="All recalls">
              <label htmlFor="search" className="visually-hidden">
                Search all recalls
              </label>
              <input
                id="search"
                type="search"
                className="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search all recalls"
                autoComplete="off"
              />
              <p className="result-count" role="status">
                {deferredQuery.trim()
                  ? `${pluralize(latest.length, "recall")} found.`
                  : `Every recall announced since ${formatDay(since)}, newest first.`}
              </p>
              <RecallList key={deferredQuery} items={latest} label="All recalls" />
            </section>
          )}

          {generatedAt && (
            <p className="muted small updated">Data from the CPSC, last refreshed {formatDay(generatedAt)}.</p>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="app">
      {/* Focus #main directly: following "#main" would change the hash route. */}
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#/">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          RecallRadar
        </a>
        <p className="tagline">Know when something you own is recalled.</p>
      </header>

      <main id="main" tabIndex={-1}>
        {content}
      </main>

      <footer className="site-footer">
        <p>
          Recall data from the U.S. Consumer Product Safety Commission, refreshed daily. Your watchlist is stored only
          in this browser and never sent anywhere. Opening a recall loads its photo from cpsc.gov.
        </p>
        <p>
          RecallRadar isn't affiliated with the CPSC. ·{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            Source on GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
