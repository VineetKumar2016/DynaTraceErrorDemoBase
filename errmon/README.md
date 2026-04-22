# ◈ AI Error Monitor

An AI-powered developer assistant that monitors production errors from **Dynatrace**, performs automated **root cause analysis** with Claude, and generates code fixes — creating GitHub PRs and Jira tickets with a single approval click.

---

## Quick Start

### Prerequisites
- **Python 3.10+** — https://python.org
- **Node.js 18+** — https://nodejs.org
- **No database required** — data is stored in `backend/data.json` automatically

### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

### Windows
```bat
start.bat
```

Then open **http://localhost:8000** in your browser.

---

## First-Time Setup

The **Setup Wizard** will appear on first launch. You'll need:

### 1. GitHub Personal Access Token
- Go to https://github.com/settings/tokens → Generate new token (classic)
- Required scopes: `repo`, `read:packages`
- Paste the token in **Settings → GitHub & Repos**

### 2. Dynatrace Connection
- **Environment URL**: Your Dynatrace instance URL, e.g. `https://abc123.live.dynatrace.com`
- **Platform Token**: Create at `{env-url}/ui/access-tokens`
  - Required scopes: `storage:logs:read`, `storage:buckets:read`, `storage:metrics:read`, `storage:entities:read`
- **API Token** *(optional)*: For problem correlation — scope: `problems.read`

### 3. AI Model
- **Anthropic API Key**: Get from https://console.anthropic.com/keys
- Default model: `claude-sonnet-4-6`
- For deeper analysis use: `claude-opus-4-6`

### 4. Jira Board *(optional)*
- **Base URL**: `https://yourcompany.atlassian.net`
- **Email**: Your Atlassian account email
- **API Token**: Create at https://id.atlassian.com/manage-profile/security/api-tokens

---

## How It Works

```
Dynatrace  →  Polling Service  →  Deduplication  →  Error Table
                                                          ↓
                                               [User clicks Analyze]
                                                          ↓
                                              Claude AI Analysis (SSE)
                                                          ↓
                                         Fix: RCA + Code Changes + Tests
                                                          ↓
                                        [User: Approve / Revise / Reject]
                                                          ↓
                                         GitHub PR  +  Jira Ticket
```

### Key Features
| Feature | Details |
|---|---|
| **Auto Polling** | Fetches errors from Dynatrace every 5 min (configurable) |
| **Deduplication** | SHA-256 fingerprinting prevents duplicate analysis |
| **Streaming Analysis** | Live SSE stream shows AI investigation steps in real time |
| **Real GitHub PR** | Creates branch + PR with diff in your actual repository |
| **Real Jira Ticket** | Creates bug ticket with RCA, fix summary, testing notes |
| **Cost Tracking** | Tracks tokens and USD cost per investigation |
| **Human-in-the-loop** | Every fix requires developer approval before action |

---

## Manual Commands

### Backend only
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend dev server (with hot reload)
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173  (proxies /api → localhost:8000)
```

### Rebuild frontend after changes
```bash
cd frontend
npm run build
# Outputs to backend/static/ — served by FastAPI
```

---

## Project Structure

```
errmon/
├── start.sh              # macOS/Linux one-click start
├── start.bat             # Windows one-click start
├── backend/
│   ├── main.py           # FastAPI app + polling scheduler
│   ├── database.py       # JSON file-backed database (data.json)
│   ├── models.py         # Pydantic data models
│   ├── dynatrace_service.py  # Dynatrace Grail API integration
│   ├── ai_service.py     # Claude API + GitHub PR + Jira ticket creation
│   ├── requirements.txt
│   ├── .env.example
│   ├── static/           # Built React app (served by FastAPI)
│   └── routes/
│       ├── settings.py   # Credentials, GitHub repos
│       ├── errors.py     # Error CRUD + filtering
│       ├── fixes.py      # Fix records
│       ├── analysis.py   # Streaming AI analysis + approve/reject
│       ├── scans.py      # Scan trigger + history
│       ├── dashboard.py  # Aggregated stats
│       └── prs.py        # PR listing
└── frontend/
    └── src/
        ├── api.js         # All API calls + SSE streaming
        ├── ui.jsx         # Shared components
        ├── App.jsx        # Navigation + routing
        └── pages/
            ├── Dashboard.jsx
            ├── Errors.jsx
            ├── ErrorDetail.jsx
            ├── FixReview.jsx
            ├── Other.jsx   (Fixes, PRs, Scans, Architecture)
            ├── Settings.jsx
            └── Wizard.jsx
```

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env`:

```env
HOST=0.0.0.0
PORT=8000
```

All API credentials (GitHub token, Dynatrace token, Anthropic API key, Jira token) are stored securely in the database — never in environment variables or config files.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/dashboard/` | Stats summary |
| GET | `/api/errors/` | List errors (filterable) |
| GET | `/api/errors/{id}` | Single error |
| POST | `/api/analysis/analyze` | Stream AI analysis (SSE) |
| POST | `/api/analysis/approve` | Approve fix → create PR + Jira |
| POST | `/api/analysis/reject` | Reject fix |
| GET | `/api/fixes/` | List fixes |
| GET | `/api/prs/` | List PRs |
| GET | `/api/scans/` | Scan history |
| POST | `/api/scans/trigger` | Trigger async scan |
| POST | `/api/scans/trigger-sync` | Trigger sync scan (waits) |
| GET | `/api/settings/` | All settings (masked) |
| POST | `/api/settings/github` | Save GitHub config |
| POST | `/api/settings/dynatrace` | Save Dynatrace config |
| POST | `/api/settings/ai` | Save AI config |
| POST | `/api/settings/jira` | Save Jira config |
| POST | `/api/settings/pipeline` | Save pipeline config |
| POST | `/api/settings/test/github` | Test GitHub connection |
| POST | `/api/settings/test/dynatrace` | Test Dynatrace connection |
| POST | `/api/settings/test/jira` | Test Jira connection |
| GET | `/api/settings/github/repos` | Fetch repos from GitHub |

---

## Supported Dynatrace APIs

- **Grail Log Search** (`/api/v2/logs/search`) — primary log fetching
- **Grail DQL Query** (`/platform/storage/query/v1/query:execute`) — advanced queries
- **Environment API v2 Problems** (`/api/v2/problems`) — problem/incident correlation

---

## Limitations

- GitHub Copilot AI provider is not yet functional (no public API)
- AWS Bedrock requires additional AWS SDK setup
- Complex multi-file code changes may need manual review
- Auto-fix generation is disabled by default (high token cost)
