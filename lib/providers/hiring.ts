/**
 * Hiring-velocity provider — Greenhouse public job board API.
 *
 * Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
 * Lever:      https://api.lever.co/v0/postings/{slug}  (reserved for future use)
 *
 * NOTE: In production this slug mapping would need an automated discovery
 * mechanism (e.g., crawl ATS slug guesses from careers.<company>.com and
 * probe the Greenhouse/Lever APIs). The map below is hardcoded for a curated
 * set of well-known tech companies only.
 */

export type ATS = 'greenhouse' | 'lever';

export type HiringJob = {
  id: string | number;
  title: string;
  location?: string;
};

/** Greenhouse API response shape */
type GreenhouseResponse = {
  jobs: Array<{ id: number; title: string; location?: { name?: string } }>;
};

/** Lever API response shape (array of postings) */
type LeverPosting = {
  id: string;
  text: string;
  categories?: { location?: string };
};

/**
 * Hardcoded ticker → ATS slug mapping for well-known tech companies.
 * Only Greenhouse entries are needed for v1; Lever is reserved for future use.
 *
 * Real-world extension: run a nightly probe that tries common slug variants
 * (e.g., ticker.toLowerCase(), company name slug) against both APIs and
 * caches any that return HTTP 200.
 */
export const TECH_ATS_MAP: Record<string, { ats: ATS; slug: string }> = {
  SNOW:  { ats: 'greenhouse', slug: 'snowflake' },
  DDOG:  { ats: 'greenhouse', slug: 'datadog' },
  NET:   { ats: 'greenhouse', slug: 'cloudflare' },
  MDB:   { ats: 'greenhouse', slug: 'mongodb' },
  ZS:    { ats: 'greenhouse', slug: 'zscaler' },
  CRWD:  { ats: 'greenhouse', slug: 'crowdstrike' },
  OKTA:  { ats: 'greenhouse', slug: 'okta' },
  TEAM:  { ats: 'greenhouse', slug: 'atlassian' },
  SHOP:  { ats: 'greenhouse', slug: 'shopify' },
  COIN:  { ats: 'greenhouse', slug: 'coinbase' },
  HUBS:  { ats: 'greenhouse', slug: 'hubspot' },
  TWLO:  { ats: 'greenhouse', slug: 'twilio' },
  DOCN:  { ats: 'greenhouse', slug: 'digitalocean' },
};

export class HiringClient {
  private baseUrlGreenhouse: string;
  private baseUrlLever: string;

  constructor(
    baseUrlGreenhouse = 'https://boards-api.greenhouse.io',
    baseUrlLever = 'https://api.lever.co',
  ) {
    this.baseUrlGreenhouse = baseUrlGreenhouse;
    this.baseUrlLever = baseUrlLever;
  }

  /**
   * Fetch open job postings for a given ATS slug.
   * Returns an array of jobs — callers typically only need the count.
   */
  async getJobs(slug: string, ats: ATS = 'greenhouse'): Promise<HiringJob[]> {
    if (ats === 'greenhouse') {
      return this.getGreenhouseJobs(slug);
    }
    return this.getLeverJobs(slug);
  }

  private async getGreenhouseJobs(slug: string): Promise<HiringJob[]> {
    const url = `${this.baseUrlGreenhouse}/v1/boards/${slug}/jobs`;
    const res = await fetch(url, { headers: { 'User-Agent': 'stock-tracker/1.0' } });
    if (!res.ok) {
      throw new Error(`Greenhouse HTTP ${res.status} for slug "${slug}": ${await res.text()}`);
    }
    const data = (await res.json()) as GreenhouseResponse;
    return (data.jobs ?? []).map(j => ({
      id: j.id,
      title: j.title,
      location: j.location?.name,
    }));
  }

  private async getLeverJobs(slug: string): Promise<HiringJob[]> {
    const url = `${this.baseUrlLever}/v0/postings/${slug}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'stock-tracker/1.0' } });
    if (!res.ok) {
      throw new Error(`Lever HTTP ${res.status} for slug "${slug}": ${await res.text()}`);
    }
    const data = (await res.json()) as LeverPosting[];
    return (data ?? []).map(p => ({
      id: p.id,
      title: p.text,
      location: p.categories?.location,
    }));
  }
}
