# Everywhere Travel — Flights UI + Proxy

A simple static site for searching flights with a dark UI, airport autocomplete, date pickers, and a tiny Node proxy for live flight offers. Uses a local airports dataset (CC0) for fast client‑side lookup.

## Quick Start

1) Requirements
- Node.js 18+ (for built‑in `fetch`)
- PowerShell (Windows) or a POSIX shell (macOS/Linux)

2) Install
```
npm install
```

3) Configure environment
- Copy `.env.example` to `.env`
- Fill in your Amadeus Test keys:
```
AMADEUS_CLIENT_ID=your_id
AMADEUS_CLIENT_SECRET=your_secret
# AMADEUS_BASE=https://test.api.amadeus.com   # default; set api.amadeus.com for production keys
```

4) Run the server
```
npm start
```
- Open: http://localhost:3001/flights.html

You should see “Live” next to Top Flights when the API proxy responds. If the proxy can’t be reached, the UI falls back to mock results and shows “Demo”.

## Features

- Airport autocomplete with city/country/name/code matching
  - Accent‑insensitive search
  - Metro/city aliases (e.g., “paris” → CDG/ORY; “london” → LHR/LGW/LCY/STN/LTN; “new york” → JFK/LGA/EWR)
- Date pickers (depart/return) with calendar icons
- Trip type (round trip / one way), passengers stepper, cabin select
- Swap origin/destination
- Results list with times (+day), duration, stops and stop airports, emissions placeholder, price, and expandable segment details

## Live flight data

The proxy in `server.js` calls Amadeus Flight Offers (Test by default):
- Auth: OAuth2 client credentials (keys from Amadeus for Developers)
- Endpoint: `/api/flights?from=YOW&to=HND&start=YYYY-MM-DD&end=YYYY-MM-DD&adults=1&travelClass=ECONOMY`
- The frontend already resolves city names to IATA codes and calls this route.

Notes
- Test env returns sample/limited availability and may differ from Google/airline sites.
- For production data, you need production credentials and `AMADEUS_BASE=https://api.amadeus.com`.

## Airports dataset

- Source: OurAirports (CC0/Public Domain) — https://ourairports.com/data/
- File used by the frontend: `assets/data/airports.min.json`
- Rebuild locally (optional):
```
# Windows (PowerShell)
./tools/build-airports.ps1 -OutPath assets/data/airports.min.json
```
Filters applied by the script: `type in (large_airport, medium_airport)`, `scheduled_service == yes`, has `iata_code`.

## Troubleshooting

- No suggestions while typing
  - Make sure you’re serving the site over HTTP (file:// blocks `fetch` for the local JSON). Use `npm start` or a dev server.
  - The UI ships with a small fallback list; for full coverage, ensure `assets/data/airports.min.json` exists (rebuild with the script above).

- Results show “Demo”
  - The proxy couldn’t be reached or keys are missing/invalid. Check `.env`, restart `npm start`, and watch the terminal for errors.

- Results differ from Google
  - Google aggregates multiple sources and applies its own ranking. Test env data is limited. Align params (city codes vs airport codes, passengers, non‑stop, currency) for closer comparisons.

## Project layout

- `flights.html`, `style.css` — UI
- `flights.js` — Autocomplete, pickers, submit, rendering, API calls
- `server.js` — Express static + `/api/flights` proxy (Amadeus)
- `assets/data/airports.min.json` — Airports list (filtered, CC0)
- `tools/build-airports.ps1` — Build filtered JSON from OurAirports
- `.env.example` — Required env vars; copy to `.env`
- `.gitignore` — ignores `node_modules/`, `.env`, raw CSV cache

## Next ideas

- Add sorting (price/duration/stops) and a non‑stop filter
- Add real airline names/logos map
- Optional alternative data source (e.g., Kiwi Tequila affiliate) behind a feature flag

---
If you want, I can add a one‑click dev script and a small “loading…” state for the results.

