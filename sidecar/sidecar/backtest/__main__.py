"""`python -m sidecar.backtest` entry point."""
from sidecar.backtest.cli import main
import sys

if __name__ == "__main__":
    sys.exit(main())
