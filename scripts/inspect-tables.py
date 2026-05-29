"""List populated tables in the DB."""
import sqlite3
import sys

db = sys.argv[1]
con = sqlite3.connect(db)

tables = [r[0] for r in con.execute(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).fetchall()]
for t in tables:
    try:
        n = con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    except Exception:
        n = '?'
    print(f"{n:>10}  {t}")
