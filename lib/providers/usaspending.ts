/**
 * USAspending.gov public API client — no auth required.
 * https://api.usaspending.gov/api/v2/
 */

export type USASpendingAward = {
  awardId: string;
  recipientName: string;
  description: string;
  awardAmount: number;
  actionDate: string;
  awardingAgency: string;
};

/**
 * Hardcoded map of defense company names as they appear in USAspending recipient data.
 * Key: ticker, Value: recipient name fragment used to match awards.
 */
export const KNOWN_DEFENSE_RECIPIENTS: Record<string, string> = {
  LMT: 'Lockheed Martin Corp',
  RTX: 'Raytheon Technologies',
  GD: 'General Dynamics Corp',
  BA: 'Boeing Co',
  NOC: 'Northrop Grumman Corp',
  LDOS: 'Leidos Holdings Inc',
  KTOS: 'Kratos Defense',
  AVAV: 'AeroVironment Inc',
  HII: 'Huntington Ingalls Industries',
  TXT: 'Textron Inc',
  PSN: 'Parsons Corp',
  BWXT: 'BWX Technologies',
  CW: 'Curtiss-Wright Corp',
  MRCY: 'Mercury Systems',
  AJRD: 'Aerojet Rocketdyne',
};

export type SearchAwardsOptions = {
  recipientName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  limit?: number;
  page?: number;
};

export class USASpendingClient {
  private baseUrl: string;

  constructor(baseUrl = 'https://api.usaspending.gov') {
    this.baseUrl = baseUrl;
  }

  async searchAwards(opts: SearchAwardsOptions): Promise<USASpendingAward[]> {
    const body = {
      filters: {
        award_type_codes: ['A', 'B', 'C', 'D'],
        agencies: [{ type: 'awarding', tier: 'toptier', name: 'Department of Defense' }],
        time_period: [{ start_date: opts.startDate, end_date: opts.endDate }],
        recipient_search_text: [opts.recipientName],
      },
      fields: [
        'Award ID',
        'Recipient Name',
        'Description',
        'Award Amount',
        'Action Date',
        'Awarding Agency',
        'period_of_performance_start_date',
      ],
      limit: opts.limit ?? 100,
      page: opts.page ?? 1,
    };

    const res = await fetch(`${this.baseUrl}/api/v2/search/spending_by_award/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`USAspending HTTP ${res.status}: ${await res.text()}`);
    }

    const data = (await res.json()) as {
      results?: Array<{
        'Award ID': string;
        'Recipient Name': string;
        'Description': string;
        'Award Amount': number;
        'Action Date': string;
        'Awarding Agency': string;
      }>;
    };

    return (data.results ?? []).map(r => ({
      awardId: r['Award ID'] ?? '',
      recipientName: r['Recipient Name'] ?? '',
      description: r['Description'] ?? '',
      awardAmount: r['Award Amount'] ?? 0,
      actionDate: r['Action Date'] ?? '',
      awardingAgency: r['Awarding Agency'] ?? '',
    }));
  }
}
