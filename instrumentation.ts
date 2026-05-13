export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { applySchema } = await import('./lib/db/migrate');
    const { startSchedulers } = await import('./lib/jobs/scheduler');
    applySchema();
    startSchedulers();
  }
}
