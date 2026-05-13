import cron from 'node-cron';
import { pollQuotesOnce } from './poll-quotes';
import { quoteChain } from '../providers';

let started = false;

export function startSchedulers() {
  if (started) return;
  started = true;

  cron.schedule('*/30 * * * * *', async () => {
    try {
      await pollQuotesOnce(quoteChain());
    } catch (e) {
      console.error('[poll-quotes] failed:', e);
    }
  });

  console.log('[scheduler] started');
}
