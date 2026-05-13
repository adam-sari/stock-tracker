import { describe, it, expect, vi, afterEach } from 'vitest';
import { WikimediaClient } from '@/lib/providers/wikimedia';

describe('WikimediaClient', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  describe('parseTimestamp', () => {
    it('parses a Wikimedia timestamp into YYYY-MM-DD', () => {
      expect(WikimediaClient.parseTimestamp('2026050600')).toBe('2026-05-06');
      expect(WikimediaClient.parseTimestamp('2026011200')).toBe('2026-01-12');
    });
  });

  describe('formatDate', () => {
    it('formats a Date as YYYYMMDD', () => {
      const d = new Date('2026-05-13T00:00:00Z');
      expect(WikimediaClient.formatDate(d)).toBe('20260513');
    });

    it('zero-pads month and day', () => {
      const d = new Date('2026-01-05T00:00:00Z');
      expect(WikimediaClient.formatDate(d)).toBe('20260105');
    });
  });

  describe('getPageviews', () => {
    it('parses the API response correctly', async () => {
      const client = new WikimediaClient({ baseUrl: 'https://wikimedia.test' });
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { project: 'en.wikipedia', article: 'Apple_Inc.', timestamp: '2026050600', views: 10412 },
            { project: 'en.wikipedia', article: 'Apple_Inc.', timestamp: '2026050700', views: 9988 },
          ],
        }),
      } as Response);

      const results = await client.getPageviews('Apple_Inc.', '20260506', '20260507');
      expect(results).toHaveLength(2);
      expect(results[0].views).toBe(10412);
      expect(results[0].timestamp).toBe('2026050600');
      expect(results[1].views).toBe(9988);
    });

    it('returns empty array on 404', async () => {
      const client = new WikimediaClient({ baseUrl: 'https://wikimedia.test' });
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const results = await client.getPageviews('UnknownArticle', '20260101', '20260131');
      expect(results).toEqual([]);
    });

    it('throws ProviderError on non-404 HTTP errors', async () => {
      const client = new WikimediaClient({ baseUrl: 'https://wikimedia.test' });
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
      } as Response);

      await expect(client.getPageviews('Apple_Inc.', '20260101', '20260131')).rejects.toThrow('503');
    });

    it('sends User-Agent header', async () => {
      const client = new WikimediaClient({ baseUrl: 'https://wikimedia.test', userAgent: 'TestBot/1.0' });
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      } as Response);

      await client.getPageviews('Apple_Inc.', '20260101', '20260131');
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { 'User-Agent': 'TestBot/1.0' } }),
      );
    });
  });
});
