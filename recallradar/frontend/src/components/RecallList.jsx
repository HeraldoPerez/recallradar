import { useState } from "react";
import { formatDay } from "../lib/data.js";
import { recallHref } from "../lib/route.js";

const PAGE_SIZE = 25;

function RecallCard({ recall, keywords }) {
  return (
    <li className="card">
      <a className="card-link" href={recallHref(recall.id)} data-recall-id={recall.id}>
        {recall.title}
      </a>
      <p className="card-meta">
        <time dateTime={recall.date}>{formatDay(recall.date)}</time>
        {recall.remedyOptions?.length > 0 && <span>{recall.remedyOptions.join(" · ")}</span>}
      </p>
      {keywords?.length > 0 && (
        <ul className="chips chips-small" aria-label="Matched keywords">
          {keywords.map((keyword) => (
            <li key={keyword} className="chip chip-match">
              {keyword}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A list of recall cards, shown 25 at a time.
 * Give it a `key` that changes with the search, so paging restarts for new results.
 * @param {{ items: { recall: object, keywords?: string[] }[], label: string }} props
 */
export default function RecallList({ items, label }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const visible = items.slice(0, shown);
  const remaining = items.length - visible.length;

  return (
    <>
      <ul className="cards" aria-label={label}>
        {visible.map(({ recall, keywords }) => (
          <RecallCard key={recall.id} recall={recall} keywords={keywords} />
        ))}
      </ul>
      {remaining > 0 && (
        <button type="button" className="button more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Show {Math.min(remaining, PAGE_SIZE)} more ({remaining} left)
        </button>
      )}
    </>
  );
}
