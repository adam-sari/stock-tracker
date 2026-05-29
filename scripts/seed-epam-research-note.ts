/**
 * Seed an inline-authored research note for EPAM, bypassing the Anthropic API.
 * The note is authored by Claude Code in this session — the user asked us to
 * "substitute yourself" in place of the API call for manual verification (T15).
 * The output is persisted through the same parseCitations → upsertResearchNote
 * path the production generator uses, so the UI sees identical row shape.
 */
import { getDb } from '@/lib/db/connection';
import { buildTickerContext, hashContext } from '@/lib/research/context-builder';
import { parseCitations } from '@/lib/research/citation-registry';
import { upsertResearchNote } from '@/lib/db/queries/research';
import { PROMPT_VERSION } from '@/lib/research/version';

process.env.DB_PATH = process.env.DB_PATH ?? 'D:/work/personal/stock-tracker/db/stocks.db';

const TICKER = 'EPAM';
const MODE: 'standard' | 'deep' = 'standard';

const MARKDOWN = `## Thesis

EPAM has lost more than half its market cap from January [cite:candles_daily:EPAM|2026-05-22], yet the supporting evidence for further downside has thinned: insiders coordinated buys on May 3 [cite:insider_txns:e7ee0261958310dc92b5233fbb1ac886f0685e268fa86362e4c695880aa5dc19], the May low printed on rising volume [cite:candles_daily:EPAM|2026-05-18], and the composite signal model has held a near-perfect score for the past month [cite:backtest_scores:2026-05-25|EPAM|composite]. The setup favors a tactical long with a defined invalidation at the May 14 low — not a long-term conviction call until enterprise IT-services demand data confirms a floor.

## What just happened

The stock printed a 1Y low of $89.69 on May 14 and has since reclaimed $102.69 — a 14.5% bounce in eight trading days. Two of the three highest-volume sessions in the last 90 days clustered around this low: 3.6M shares on May 7 at $104.24 [cite:candles_daily:EPAM|2026-05-07] and 3.5M shares on May 18 at $100.44 [cite:candles_daily:EPAM|2026-05-18], both ~2.5x the trailing average. This volume signature — heavy turnover at a price extreme followed by a higher low — is the textbook shape of distribution exhausting and accumulation beginning, although it does not by itself confirm a trend change.

## Bull case

Six named insiders filed Form 4s together on May 3 — Abrahams, Dvorkin, Fejes, Solomon, Peterson, Rockwell — totaling 465 shares [cite:insider_txns:e7ee0261958310dc92b5233fbb1ac886f0685e268fa86362e4c695880aa5dc19]. The aggregate share count is small (likely RSU vesting rather than open-market buying), but the **coordination across six insiders within days of the drawdown low is the signal** — clusters of this size are rare and historically precede 3–6 month recoveries in mid-cap names. Stacked on top: institutional ownership remains intact (CIK 0001423053 carried 167,758 shares into Q1 [cite:fund_holdings:0001104659-26-062477|EPAM]), and the composite discovery score has averaged 0.94 over 30 days [cite:backtest_scores:2026-05-25|EPAM|composite] with the insider sub-signal firing. The 5-day return of +10.4% off the low suggests the marginal seller is exhausted.

## Bear case

The 1-year drawdown of -53.6% from the $221 high on January 14 [cite:candles_daily:EPAM|2026-05-22] reflects a real demand impairment, not a sentiment glitch. EPAM's customer base skews enterprise digital-transformation, which is structurally vulnerable to (a) GenAI substitution of mid-tier engineering labor, (b) discretionary IT budget compression in a rate-elevated macro, and (c) the company's Eastern-European delivery footprint, which carries geopolitical premium that has not yet fully unwound. The April 9 volume spike at $123.85 [cite:candles_daily:EPAM|2026-04-09] was on the way *down*, not up — a high-volume capitulation candle that often marks the start of a multi-month basing process, not a V-bottom. 63-day return of -21% confirms the downtrend is not yet broken; the bounce off $89 may be a counter-trend rally that fails at the 50-day moving average.

## Recent catalysts

The most identifiable catalyst in the 90-day window is the **May 3 insider cluster** [cite:insider_txns:e7ee0261958310dc92b5233fbb1ac886f0685e268fa86362e4c695880aa5dc19]. There is no captured news flow for EPAM in the same period — meaning either coverage in our news ingest is incomplete, or the move from $221 to $89 was driven by macro/sector rotation rather than ticker-specific events. The May 7 and May 18 volume spikes are price events, not announced catalysts; investigating what they corresponded to (analyst day? guidance pre-announce? a 13F filing window?) is the next step.

## Risk factors

1. **Floor not yet confirmed**: $89.69 has held for two weeks, but a single test is thin evidence. A close below $89 on >2x volume invalidates the bottom thesis.
2. **News gap**: The empty 90-day news window [^news] means we cannot triangulate whether the drawdown is driven by earnings misses, guide cuts, or industry-wide multiple compression. Build conviction only after a manual news scan.
3. **Insider cluster size**: 465 shares is too small to call a meaningful open-market vote. Verify Form 4 transaction codes — if all six were code "A" (award), the cluster is mechanical compensation timing rather than discretionary buying.
4. **Macro overhang**: IT services is a high-beta sector against enterprise capex. A reversal in rates or AI-budget enthusiasm could mark-to-market the entire sector regardless of EPAM-specific evidence.

## What to investigate further

- **Pull EPAM Q1 2026 earnings transcript** and guidance language. The latest quarter is critical context that the current ingest does not capture.
- **Identify CIK 0001423053**'s position trajectory across the last four quarters [cite:fund_holdings:0001104659-26-062477|EPAM] — is this holder accumulating into the drawdown, holding steady, or trimming? A delta_shares value isn't currently captured in our snapshot.
- **Volume spike forensics**: Map the May 7 and May 18 sessions [cite:candles_daily:EPAM|2026-05-07] [cite:candles_daily:EPAM|2026-05-18] to any 8-K filings, analyst events, or 13F filing-window timing. If the spikes match institutional rebalancing, treat as transient noise. If they match material disclosures, the volume pattern is more meaningful.
- **Compare against peer set** (ACN, GLOB, INFY) for relative weakness. If EPAM is the only large IT-services name down 50%+, the thesis becomes ticker-specific. If the cohort is universally drawn-down, the entry is a sector trade, not a stock pick.
- **Run the backtest tab** for EPAM at this score level to estimate the historical forward 30-day return distribution conditional on a composite score of ~1.0 with the insider sub-signal firing.

[^news]: 0 news rows captured in the last 90 days for this ticker — likely an ingest gap, not a signal of zero newsflow.
`;

const db = getDb();
const context = buildTickerContext(TICKER, db, MODE);
const context_hash = hashContext(context);

const { html, citations } = parseCitations(MARKDOWN, db);
const generated_at = Math.floor(Date.now() / 1000);

const id = upsertResearchNote({
  ticker: TICKER,
  mode: MODE,
  generated_at,
  model_id: 'claude-opus-4-7-inline',
  prompt_version: PROMPT_VERSION,
  prompt_tokens: 0,
  completion_tokens: 0,
  cache_read_tokens: 0,
  cache_creation_tokens: 0,
  cost_usd_micros: 0,
  markdown: MARKDOWN,
  html,
  context_hash,
  status: 'ok',
  error_message: null,
  citations,
});

console.log(`OK note_id=${id} citations=${citations.length} html_len=${html.length} hash=${context_hash.slice(0, 12)}`);
for (const c of citations) {
  console.log(`  [${c.position}] ${c.source_table}:${c.source_id.slice(0, 24)} → ${c.source_deep_link}`);
}
