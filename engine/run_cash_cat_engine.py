"""PyInstaller entry point for the Tauri sidecar (same API as `uvicorn cash_cat.app:app`).

Inside a PyInstaller onefile bundle, `uvicorn.run("cash_cat.app:app", …)` fails with
"Error loading ASGI app. Could not import module 'cash_cat.app'." because uvicorn's
string-based import lookup does not resolve frozen modules reliably. Passing the ASGI
app object directly bypasses that lookup.
"""

from __future__ import annotations

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()

    import uvicorn

    from cash_cat.app import app

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
