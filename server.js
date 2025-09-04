// Simple Express server to proxy Amadeus Flight Offers API
// Usage:
//   set AMADEUS_CLIENT_ID=... && set AMADEUS_CLIENT_SECRET=... && npm start

const express = require('express');
const path = require('path');

const PORT = process.env.PORT || 3001;
const AMADEUS_CLIENT_ID = process.env.AMADEUS_CLIENT_ID || '';
const AMADEUS_CLIENT_SECRET = process.env.AMADEUS_CLIENT_SECRET || '';
const AMADEUS_BASE = process.env.AMADEUS_BASE || 'https://test.api.amadeus.com';

const app = express();

// Allow CORS for dev when opening flights.html on a different port
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Serve this project statically so you can open flights.html at http://localhost:3001/flights.html
app.use(express.static(path.resolve(__dirname)));

// Helper: parse ISO8601 duration like PT18H30M into minutes
function isoDurationToMinutes(s) {
  try {
    const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (!m) return 0;
    const h = parseInt(m[1] || '0', 10);
    const min = parseInt(m[2] || '0', 10);
    return h * 60 + min;
  } catch (_) {
    return 0;
  }
}

// Rough emissions estimate based on time (very approximate)
function estimateEmissionsKg(totalMinutes) {
  const hours = totalMinutes / 60;
  return Math.round(hours * 45 * 1.2); // ~54 kg per hour
}

async function getAmadeusToken() {
  if (!AMADEUS_CLIENT_ID || !AMADEUS_CLIENT_SECRET) {
    throw Object.assign(new Error('Missing AMADEUS_CLIENT_ID/AMADEUS_CLIENT_SECRET'), { status: 500 });
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: AMADEUS_CLIENT_ID,
    client_secret: AMADEUS_CLIENT_SECRET,
  });
  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw Object.assign(new Error(`Token HTTP ${res.status}`), { status: res.status });
  return res.json();
}

function mapOfferToItem(offer) {
  const it = offer.itineraries?.[0];
  if (!it) return null;
  const segs = it.segments || [];
  if (!segs.length) return null;
  const segments = segs.map(s => ({
    carrier: s.carrierCode,
    from: s.departure?.iataCode,
    to: s.arrival?.iataCode,
    departure: s.departure?.at,
    arrival: s.arrival?.at,
  }));
  const totalMinutes = isoDurationToMinutes(it.duration || 'PT0M');
  const departure = segments[0].departure;
  const arrival = segments[segments.length - 1].arrival;
  const carriers = [...new Set(segments.map(s => s.carrier))].map(code => ({ code, name: code }));
  const currency = offer.price?.currency || 'USD';
  const price = offer.price?.total || '0';
  return {
    from: segments[0].from,
    to: segments[segments.length - 1].to,
    departure,
    arrival,
    segments,
    totalMinutes,
    stops: Math.max(0, segments.length - 1),
    carriers,
    price,
    currency,
    emissionsKg: estimateEmissionsKg(totalMinutes),
  };
}

app.get('/api/flights', async (req, res) => {
  try {
    const originLocationCode = (req.query.from || '').toUpperCase();
    const destinationLocationCode = (req.query.to || '').toUpperCase();
    const departureDate = req.query.start || '';
    const returnDate = req.query.end || '';
    const adults = Math.max(1, Math.min(9, parseInt(req.query.adults || '1', 10)));
    const travelClass = (req.query.travelClass || '').toUpperCase();
    if (!originLocationCode || !destinationLocationCode || !departureDate) {
      return res.status(400).json({ error: 'from, to, and start (YYYY-MM-DD) are required' });
    }

    const token = await getAmadeusToken();
    const params = new URLSearchParams({
      originLocationCode,
      destinationLocationCode,
      departureDate,
      adults: String(adults),
      nonStop: 'false',
      max: '10',
    });
    if (travelClass) params.set('travelClass', travelClass);
    if (returnDate) params.set('returnDate', returnDate);

    const url = `${AMADEUS_BASE}/v2/shopping/flight-offers?${params.toString()}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.errors?.[0]?.detail || `Amadeus HTTP ${r.status}`;
      return res.status(r.status).json({ error: msg, raw: data });
    }
    const items = Array.isArray(data.data) ? data.data.map(mapOfferToItem).filter(Boolean) : [];
    res.json({ items });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening at http://localhost:${PORT}`);
});
