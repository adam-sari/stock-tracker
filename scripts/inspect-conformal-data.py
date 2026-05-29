"""Inspect calibration data availability for conformal training."""
import sqlite3
import sys

db = sys.argv[1]
con = sqlite3.connect(db)

def q(s):
    return con.execute(s).fetchone()[0]

print('composite rows:', q("SELECT COUNT(*) FROM backtest_scores WHERE signal_kind='composite'"))
print('realized total:', q('SELECT COUNT(*) FROM realized_returns'))
print('realized computed:', q("SELECT COUNT(*) FROM realized_returns WHERE status='computed'"))
print('realized spy_excess not null:',
      q("SELECT COUNT(*) FROM realized_returns WHERE status='computed' AND spy_excess_pct IS NOT NULL"))

print('\nrealized by horizon (computed + spy_excess not null):')
rows = con.execute("""
  SELECT horizon_days, COUNT(*) FROM realized_returns
   WHERE status='computed' AND spy_excess_pct IS NOT NULL
   GROUP BY horizon_days ORDER BY horizon_days
""").fetchall()
for h, n in rows:
    print(f'  h={h}: {n}')

print('\njoined (composite x realized x computed):')
for h in (1, 5, 21, 63):
    n = con.execute("""
      SELECT COUNT(*) FROM backtest_scores bs
       JOIN realized_returns rr ON rr.date=bs.date AND rr.ticker=bs.ticker
       WHERE bs.signal_kind='composite' AND rr.status='computed'
         AND rr.horizon_days=? AND rr.spy_excess_pct IS NOT NULL
    """, (h,)).fetchone()[0]
    print(f'  h={h}: {n}')

print('\nstock_meta sector coverage:')
print('  total meta rows:', q('SELECT COUNT(*) FROM stock_meta'))
print('  with sector:', q("SELECT COUNT(*) FROM stock_meta WHERE sector IS NOT NULL AND sector != ''"))

print('\ncomposite date range:')
mn, mx = con.execute("SELECT MIN(date), MAX(date) FROM backtest_scores WHERE signal_kind='composite'").fetchone()
print(f'  {mn} → {mx}')
