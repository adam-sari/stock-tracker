"""Root pytest conftest — registers shared CLI options."""


def pytest_addoption(parser):
    parser.addoption("--update-golden", action="store_true",
                     help="Regenerate the golden_summary.json fixture")
