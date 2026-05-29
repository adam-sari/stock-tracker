<ticker_context>
{{CONTEXT_JSON}}
</ticker_context>

Write a **deep** research note for **{{TICKER}}** following the system rules.

You have access to `web_search`. Use it sparingly and only to:
1. Pull headlines from the last 30 days that are missing from the news block above.
2. Find consensus analyst estimates or guidance changes if relevant to your thesis.
3. Look up peer-set tickers (3–5 closest comps) if you reference them in `## Peer context`.

Do not search for information already present in `ticker_context`.

In addition to the standard sections, include:

## Recent earnings
The most recent quarter's reported numbers (revenue, EPS, key segment), guidance shifts, and any commentary that changes the thesis.

## Peer context
3–5 comparable tickers with a one-line note on each. Cite any per-peer claim with `[cite:web_search:<short-tag>]` (a free-form short label you assign).

Every factual claim must carry a citation. Use existing `cite` values for ticker context rows; use `[cite:web_search:<tag>]` for facts pulled from web search.
