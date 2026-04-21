# Cash Cat — engineering decisions (locked for v1)

| Topic | Decision | Rationale |
|-------|-----------|-----------|
| Chart library | **Recharts** | React-native charts; aligns with shadcn + token-driven colours. |
| UI bridge | **FastAPI on `127.0.0.1`** (dynamic port) | OpenAPI contract; easy debugging with `curl`; Tauri spawns engine subprocess. |
| Python packaging (dev) | **`venv` + `pip install -r requirements.txt`** | Simple local loop; PyInstaller/sidecar deferred to release packaging. |
| SQLite | **WAL mode**, versioned SQL migrations | PRD reliability; migrations in `engine/cash_cat/migrations/`. |
| Akahu HTTP | **httpx** async client, HTTPS to `api.akahu.io` | Headers `Authorization: Bearer`, `X-Akahu-Id` per Akahu docs. |

These follow the Cash Cat build alignment plan (PRD v1.0).
