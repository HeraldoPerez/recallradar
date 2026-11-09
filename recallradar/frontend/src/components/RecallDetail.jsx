import { useEffect, useRef } from "react";
import { formatDay, safeHref } from "../lib/data.js";

function Fact({ label, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{Array.isArray(children) ? children.join("; ") : children}</dd>
    </div>
  );
}

/**
 * One recall in full.
 * @param {{ recall: object | undefined, id: string, since: string | null, matched: string[], onBack: () => void }} props
 */
export default function RecallDetail({ recall, id, since, matched, onBack }) {
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [id]);

  if (!recall) {
    return (
      <article className="detail">
        <button type="button" className="back" onClick={onBack}>
          ← Back
        </button>
        <h1 ref={headingRef} tabIndex={-1}>
          Recall not found
        </h1>
        <p>
          Recall {id} isn't in RecallRadar's data
          {since ? `, which covers recalls announced since ${formatDay(since)}` : ""}. You can look it up on{" "}
          <a href="https://www.cpsc.gov/Recalls" target="_blank" rel="noopener noreferrer">
            cpsc.gov/Recalls
          </a>
          .
        </p>
      </article>
    );
  }

  const noticeHref = safeHref(recall.url);
  const imageSrc = safeHref(recall.image?.url);

  return (
    <article className="detail">
      <button type="button" className="back" onClick={onBack}>
        ← Back
      </button>

      <p className="eyebrow">
        Recall {recall.id} · <time dateTime={recall.date}>{formatDay(recall.date)}</time>
        {recall.updated && recall.updated !== recall.date && <> · updated {formatDay(recall.updated)}</>}
      </p>
      <h1 ref={headingRef} tabIndex={-1}>
        {recall.title}
      </h1>

      {matched.length > 0 && (
        <p className="matched-line">
          On your watchlist:{" "}
          {matched.map((keyword) => (
            <span key={keyword} className="chip chip-match">
              {keyword}
            </span>
          ))}
        </p>
      )}

      <div className="detail-grid">
        {imageSrc && (
          <figure className="photo">
            <img
              src={imageSrc}
              alt={recall.image.caption || recall.product || "Recalled product"}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            {recall.image.caption && <figcaption>{recall.image.caption}</figcaption>}
          </figure>
        )}

        <div className="callouts">
          {recall.hazard && (
            <section className="callout callout-hazard" aria-labelledby="hazard-heading">
              <h2 id="hazard-heading">Hazard</h2>
              <p>{recall.hazard}</p>
            </section>
          )}
          <section className="callout callout-remedy" aria-labelledby="remedy-heading">
            <h2 id="remedy-heading">What to do</h2>
            {recall.remedyOptions?.length > 0 && (
              <ul className="badges" aria-label="Remedy">
                {recall.remedyOptions.map((option) => (
                  <li key={option} className="badge">
                    {option}
                  </li>
                ))}
              </ul>
            )}
            {recall.remedy && <p>{recall.remedy}</p>}
            {recall.contact && (
              <p>
                <strong>Contact:</strong> {recall.contact}
              </p>
            )}
          </section>
        </div>
      </div>

      <dl className="facts">
        <Fact label="Product">{recall.product}</Fact>
        <Fact label="Model">{recall.model}</Fact>
        <Fact label="Units">{recall.units}</Fact>
        <Fact label="Sold at">{recall.soldAt}</Fact>
        <Fact label="Incidents">{recall.injuries}</Fact>
        <Fact label="Company">{recall.companies}</Fact>
        <Fact label="Made in">{recall.countries}</Fact>
        <Fact label="UPC">{recall.upcs}</Fact>
      </dl>

      {recall.description && (
        <section aria-labelledby="description-heading">
          <h2 id="description-heading">Description</h2>
          <p>{recall.description}</p>
        </section>
      )}

      {noticeHref && (
        <p>
          <a className="button primary" href={noticeHref} target="_blank" rel="noopener noreferrer">
            Read the official CPSC notice
            <span className="visually-hidden"> (opens in a new tab)</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        </p>
      )}
      <p className="muted small">Always follow the official notice. RecallRadar isn't affiliated with the CPSC.</p>
    </article>
  );
}
