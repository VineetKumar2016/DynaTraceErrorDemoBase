# errmon — Run Commands

## Start Application (Windows)

### Option 1 — One command (recommended)
```bat
cd C:\V2\errmon\backend
set PYTHONIOENCODING=utf-8
python main.py
```
Then open **http://localhost:8000**

---

### Option 2 — Separate backend + frontend dev server

**Terminal 1 — Backend**
```bat
cd C:\V2\errmon\backend
set PYTHONIOENCODING=utf-8
python main.py
```

**Terminal 2 — Frontend (hot reload)**
```bat
cd C:\V2\errmon\frontend
npm run dev
```
Then open **http://localhost:5173**

---

## Rebuild Frontend (after UI changes)
```bat
cd C:\V2\errmon\frontend
npm run build
```
Output goes to `backend/static/` and is served automatically by FastAPI.

---

## Install Dependencies (first time only)

**Backend**
```bat
cd C:\V2\errmon\backend
pip install -r requirements.txt
```

**Frontend**
```bat
cd C:\V2\errmon\frontend
npm install
```

---

## Manage Running Server (Windows)

**Find server process (PowerShell)**
```powershell
Get-Process python
netstat -ano | findstr :8000
```

**Kill by PID (PowerShell)**
```powershell
Stop-Process -Id <PID> -Force
```

**Kill by PID (Command Prompt)**
```bat
taskkill /PID <PID> /F
```

---

## Environment Variables (`backend/.env`)
```env
HOST=0.0.0.0
PORT=8000
PYTHONIOENCODING=utf-8
```

Data is stored in `backend/data.json` (created automatically on first run).

---

## Quick Health Check
```
GET http://localhost:8000/api/health
```
Expected: `{"status":"ok","store":"file",...}`
