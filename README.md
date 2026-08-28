# Malaysia Weather Intelligence

A premium, production-ready weather app for Malaysia, powered by the official
[MET Malaysia Open Data API](https://developer.data.gov.my/realtime-api/weather)
(`api.data.gov.my/weather/*`).

## Why this won't get CORS-blocked

The browser never talks to `api.data.gov.my` directly. Instead:

- **In production (Vercel):** the client calls `/api/weather/forecast`,
  `/api/weather/warning`, and `/api/weather/warning/earthquake` — these are
  serverless functions in the `/api` folder that fetch MET Malaysia's API
  **server-to-server** and return the JSON. Server-to-server requests aren't
  subject to browser CORS rules, so this can never be blocked by CORS.
- **In local dev:** `vite.config.js` proxies the same `/api/weather/*` paths
  straight to `api.data.gov.my`, so the app behaves identically with
  `npm run dev`.

Same-origin requests, one code path, no CORS issues in either environment.

## Project structure

```
malaysia-weather/
├── api/
│   └── weather/
│       ├── forecast.js         → GET /api/weather/forecast
│       ├── warning.js          → GET /api/weather/warning
│       └── warning/
│           └── earthquake.js   → GET /api/weather/warning/earthquake
├── src/
│   ├── App.jsx                 → the entire app
│   └── main.jsx                → React entry point
├── index.html
├── vite.config.js
├── package.json
└── .gitignore
```

## 1. Run it locally (optional, but recommended first)

```bash
npm install
npm run dev
```

Open the printed local URL (usually `http://localhost:5173`).

## 2. Push to GitHub

From inside the `malaysia-weather` folder:

```bash
git init
git add .
git commit -m "Malaysia Weather Intelligence"
```

Create a new empty repository on GitHub (no README/license, so it stays
empty), then:

```bash
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Or use the GitHub CLI: `gh repo create <your-repo> --public --source=. --remote=origin --push`.)

## 3. Deploy on Vercel

**Option A — Vercel dashboard (no CLI needed)**

1. Go to https://vercel.com/new
2. Click **Import Git Repository** and pick the repo you just pushed.
3. Vercel auto-detects the **Vite** framework preset — leave the defaults:
   - Build Command: `vite build` (auto-filled)
   - Output Directory: `dist` (auto-filled)
   - The `api/` folder is auto-detected and deployed as serverless functions —
     no extra configuration needed.
4. Click **Deploy**. In ~30–60 seconds you'll get a live URL like
   `https://malaysia-weather-intelligence.vercel.app`.

**Option B — Vercel CLI**

```bash
npm install -g vercel
vercel login
vercel        # first deploy, follow the prompts (link/create project)
vercel --prod # promote to production
```

## 4. Verify the API routes after deploy

Once deployed, these should return live JSON directly (useful for debugging):

- `https://<your-app>.vercel.app/api/weather/forecast?contains=Langkawi@location__location_name&limit=3`
- `https://<your-app>.vercel.app/api/weather/warning?limit=3`
- `https://<your-app>.vercel.app/api/weather/warning/earthquake?limit=3`

If any of these return an error, it's an upstream MET Malaysia issue, not a
CORS/deployment issue — the app's error states (retry buttons, "temporarily
unavailable" messages) will handle it gracefully.

## Notes

- No API key is required — `api.data.gov.my` is public open data.
- No `localStorage`/`sessionStorage` is used; app state resets on reload by
  design (the splash/onboarding flow plays each session).
- Data source: MET Malaysia via Malaysia's Open Data platform
  (`data.gov.my`).
