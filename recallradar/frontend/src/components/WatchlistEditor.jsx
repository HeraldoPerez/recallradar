import { useState } from "react";
import { MAX_KEYWORD_LENGTH } from "../lib/watchlist.js";

// Each of these matched several recalls in the last two years of CPSC data.
const SUGGESTIONS = ["stroller", "crib", "high chair", "heater", "e-bike", "power bank"];

/**
 * Add and remove watchlist keywords.
 * @param {{
 *   watchlist: string[],
 *   counts: Map<string, number> | null,
 *   onAdd: (keyword: string) => string | undefined,  // returns an error message, if any
 *   onRemove: (keyword: string) => void,
 *   saveFailed: boolean,
 * }} props
 */
export default function WatchlistEditor({ watchlist, counts, onAdd, onRemove, saveFailed }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  function add(keyword) {
    const problem = onAdd(keyword);
    setError(problem ?? "");
    if (!problem) setDraft("");
  }

  return (
    <section className="panel" aria-labelledby="watchlist-heading">
      <h2 id="watchlist-heading">Your watchlist</h2>
      <p className="muted">
        Add products, brands or model numbers you own or sell. Saved in this browser only, with no account.
      </p>

      <form
        className="add-form"
        onSubmit={(event) => {
          event.preventDefault();
          add(draft);
        }}
      >
        <label htmlFor="new-keyword" className="visually-hidden">
          Product, brand or model number
        </label>
        <input
          id="new-keyword"
          type="text"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError("");
          }}
          maxLength={MAX_KEYWORD_LENGTH}
          placeholder="e.g. space heater"
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "keyword-error" : undefined}
        />
        <button type="submit" className="button primary">
          Add
        </button>
      </form>
      {error && (
        <p id="keyword-error" className="form-error" role="alert">
          {error}
        </p>
      )}

      {watchlist.length > 0 ? (
        <ul className="chips" aria-label="Keywords on your watchlist">
          {watchlist.map((keyword) => {
            const count = counts?.get(keyword);
            return (
              <li key={keyword} className="chip">
                <span>{keyword}</span>
                {count !== undefined && (
                  <span className="chip-count" title={`${count} matching recalls`}>
                    <span className="visually-hidden">, {count} matching recalls</span>
                    <span aria-hidden="true">{count}</span>
                  </span>
                )}
                <button type="button" className="chip-remove" onClick={() => onRemove(keyword)}>
                  <span aria-hidden="true">×</span>
                  <span className="visually-hidden">Remove {keyword}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="suggestions">
          <span className="muted">Try:</span>
          {SUGGESTIONS.map((keyword) => (
            <button key={keyword} type="button" className="chip chip-suggestion" onClick={() => add(keyword)}>
              + {keyword}
            </button>
          ))}
        </div>
      )}

      {saveFailed && (
        <p className="notice" role="status">
          This browser isn't letting RecallRadar save your watchlist, so it will be gone when you close the page.
        </p>
      )}
    </section>
  );
}
