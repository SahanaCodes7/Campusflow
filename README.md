# Campusflow

A small collection of demo apps that together form a minimal campus notifications / assignments stack.

This repository contains three main pieces you can run locally:

- CampusFlow backend (Node/Express + Socket.IO) — serves frontend static pages and provides APIs and realtime alerts.
- CollegeConnect (Flask) — a lightweight service that can send/receive updates and sync with CampusFlow.
- ExternalApp (Node/Express) — a simple external assignments provider that CampusFlow can sync with.

## Repository layout (important folders)

- `HACK/CampusFlow_Project (2)/CampusFlow_Project/backend/` — CampusFlow backend (Node.js). Main entry: `server.js`.
- `HACK/CollegeConnect (2)/CollegeConnect/` — Flask app (Python). Main entry: `app.py`.
- `HACK/ExternalApp (2)/ExternalApp/ExternalApp/` — External app (Node.js). Main entry: `server.js`.

## Prerequisites

- Node.js (v14+ recommended) and npm
- Python 3.8+ and pip
- A bash-compatible shell is recommended on Windows (your default is `bash.exe`) — the commands below use bash-style env setting.

## Ports used by the services

- CampusFlow backend: 3000 (default, env PORT overrides this)
- ExternalApp: 4000
- CollegeConnect: 7000

Start the CampusFlow backend first so the other apps can reach it for syncing.

## How to run (bash)

### 1) CampusFlow backend

Open a terminal and run:

```bash
cd "HACK/CampusFlow_Project (2)/CampusFlow_Project/backend"
npm install
# Start on default port 3000:
npm start

# Or override the port (bash):
PORT=4000 npm start
```

The backend will print a message like:

```
✅ CampusFlow Backend running on http://localhost:3000
```

The backend serves the frontend static files (if present) from the `frontend/` directory, and exposes APIs (e.g. `/api/data`, `/alerts`, `/api/announcements`, `/sync`, `/sync-external`, ...).

### 2) ExternalApp (assignments provider)

This app has no package.json in the repo, so install the dependencies and run `node server.js`:

```bash
cd "HACK/ExternalApp (2)/ExternalApp/ExternalApp"
# Install the libs used by this service (run once):
npm install express multer axios

# Start the server:
node server.js
```

It will run on http://localhost:4000 and expose endpoints like `/external-assignments` and `/assignments`.

### 3) CollegeConnect (Flask)

Create and activate a virtual environment, install requirements, and run the app:

```bash
cd "HACK/CollegeConnect (2)/CollegeConnect"
python -m venv venv
# On Windows (Git Bash):
source venv/Scripts/activate
# On WSL / Linux / macOS:
# source venv/bin/activate
pip install -r requirements.txt
python app.py
```

The Flask app runs on http://127.0.0.1:7000 by default and is configured to sync with CampusFlow at http://127.0.0.1:3000 (see `CAMPUSFLOW_SYNC_URL` in `app.py`).

## Quick verification

- CampusFlow backend: open http://localhost:3000 (or `http://<host>:<PORT>` you chose) and check `GET /health`.
- ExternalApp: `GET http://localhost:4000/external-assignments` should return an array (possibly empty).
- CollegeConnect: open http://127.0.0.1:7000 and try to add an update via the form or `POST /add-update`.

## Troubleshooting

- "Port already in use" — either stop the process using the port or start the service on a different port, e.g. `PORT=5000 npm start` for the backend.
- Node dependency errors — run `npm install` in the relevant folder and ensure Node version is compatible.
- Python/Flask errors — make sure you activated the virtualenv and installed `requirements.txt`.
- Sync failures — ensure CampusFlow backend is running before starting CollegeConnect or ExternalApp so they can reach `http://localhost:3000`.

If you hit upload-related errors, look for Multer / file-size messages in the server logs — both Node apps validate file types and sizes.

## Contributing

1. Create an issue describing the problem or feature.
2. Fork and create a branch for your change.
3. Submit a PR with a clear description and tests if applicable.

## Notes for maintainers

- CampusFlow backend uses `data.json` in `backend/` for persisted demo data. Back up before modifying in production.
- The backend automatically serves `frontend/` if present; this makes local testing simpler.

## License

This repo is provided as-is for demo/learning purposes. Add a license file if you plan to distribute.

---
If you'd like, I can also:
- create minimal `package.json` files for the ExternalApp so `npm install` is more straightforward, and
- add small start scripts or a top-level `Makefile`/scripts to run the whole stack with one command.
