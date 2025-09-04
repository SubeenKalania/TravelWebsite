document.addEventListener('DOMContentLoaded', () => {
  const qs = (sel) => document.querySelector(sel);

  const form = qs('.search-section form');
  const fromInput = qs('#from');
  const toInput = qs('#to');
  const departInput = qs('#depart-date');
  const returnInput = qs('#return-date');
  const resultsList = qs('#results-list');
  const tripRound = qs('#trip-round');
  const tripOneway = qs('#trip-oneway');
  const paxInput = qs('#passengers');
  const paxInc = qs('#pax-inc');
  const paxDec = qs('#pax-dec');
  const cabinSelect = qs('#cabin');
  const swapBtn = qs('#swap-btn');

  const API_BASE = window.API_BASE || (location.port === '3001' ? '' : 'http://localhost:3001');

  // ---------- Date pickers ----------
  const departPicker = flatpickr(departInput, {
    altInput: true,
    altFormat: 'D, M j',
    dateFormat: 'Y-m-d',
    minDate: 'today',
    onChange: (dates) => {
      if (dates[0]) returnPicker.set('minDate', dates[0]);
    }
  });

  const returnPicker = flatpickr(returnInput, {
    altInput: true,
    altFormat: 'D, M j',
    dateFormat: 'Y-m-d',
    minDate: 'today'
  });

  const departIcon = qs('#depart-icon');
  if (departIcon) departIcon.addEventListener('click', () => departPicker.open());
  const returnIcon = qs('#return-icon');
  if (returnIcon) returnIcon.addEventListener('click', () => returnPicker.open());

  function syncTripMode() {
    const oneway = tripOneway && tripOneway.checked;
    if (oneway) {
      returnInput.value = '';
      returnPicker.clear();
      returnInput.disabled = true;
    } else {
      returnInput.disabled = false;
      if (departPicker.selectedDates[0]) returnPicker.set('minDate', departPicker.selectedDates[0]);
    }
  }
  if (tripRound && tripOneway) {
    tripRound.addEventListener('change', syncTripMode);
    tripOneway.addEventListener('change', syncTripMode);
    syncTripMode();
  }

  // ---------- Passengers stepper ----------
  function clampPax() {
    const v = Math.max(1, Math.min(9, parseInt(paxInput.value || '1', 10)));
    paxInput.value = v;
  }
  paxInc && paxInc.addEventListener('click', () => { paxInput.value = Math.min(9, (parseInt(paxInput.value || '1', 10) + 1)); clampPax(); });
  paxDec && paxDec.addEventListener('click', () => { paxInput.value = Math.max(1, (parseInt(paxInput.value || '1', 10) - 1)); clampPax(); });
  paxInput && paxInput.addEventListener('change', clampPax);

  // ---------- Swap ----------
  if (swapBtn) {
    swapBtn.addEventListener('click', () => {
      const v1 = fromInput.value; const c1 = fromInput.dataset.code;
      fromInput.value = toInput.value; fromInput.dataset.code = toInput.dataset.code;
      toInput.value = v1; toInput.dataset.code = c1;
    });
  }

  // ---------- Autocomplete ----------
  function ensureAutocompleteWrapper(input) {
    if (!input) return {};
    if (input.parentElement && input.parentElement.classList.contains('autocomplete')) {
      return { wrapper: input.parentElement, dropdown: input.parentElement.querySelector('.suggestions') };
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete';
    input.parentElement.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    const dropdown = document.createElement('div');
    dropdown.className = 'suggestions';
    wrapper.appendChild(dropdown);
    return { wrapper, dropdown };
  }

  const { dropdown: fromDropdown } = ensureAutocompleteWrapper(fromInput);
  const { dropdown: toDropdown } = ensureAutocompleteWrapper(toInput);

  // Airport data
  const FALLBACK_AIRPORTS = [
    { city: 'London', country: 'United Kingdom', name: 'Heathrow', code: 'LHR' },
    { city: 'London', country: 'United Kingdom', name: 'Gatwick', code: 'LGW' },
    { city: 'London', country: 'United Kingdom', name: 'City', code: 'LCY' },
    { city: 'Paris', country: 'France', name: 'Charles de Gaulle', code: 'CDG' },
    { city: 'Paris', country: 'France', name: 'Orly', code: 'ORY' },
    { city: 'New York', country: 'United States', name: 'John F. Kennedy', code: 'JFK' },
    { city: 'New York', country: 'United States', name: 'LaGuardia', code: 'LGA' },
    { city: 'Newark', country: 'United States', name: 'Newark Liberty', code: 'EWR' },
    { city: 'Ottawa', country: 'Canada', name: 'Ottawa Macdonald-Cartier International Airport', code: 'YOW' },
    { city: 'Gatineau', country: 'Canada', name: 'Ottawa / Gatineau Airport', code: 'YND' }
  ];

  function norm(s) {
    const str = (s || '').toString();
    try { return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
    catch { return str.toLowerCase(); }
  }

  // Metro/city aliases to include nearby/metro codes
  const CITY_ALIASES = {
    paris: ['cdg', 'ory', 'par'],
    london: ['lhr', 'lgw', 'lcy', 'stn', 'ltn', 'lon'],
    newyork: ['jfk', 'lga', 'ewr', 'nyc'],
    tokyo: ['hnd', 'nrt', 'tyo'],
    rome: ['fco', 'cia', 'rom'],
    milan: ['mxp', 'lin', 'bgy', 'mil'],
    chicago: ['ord', 'mdw', 'chi'],
    toronto: ['yyz', 'yyt', 'yto'],
    sanfrancisco: ['sfo', 'sjc', 'oak'],
    dubai: ['dxb'],
    delhi: ['del'],
    mumbai: ['bom'],
    vancouver: ['yvr'],
    amsterdam: ['ams'],
    frankfurt: ['fra'],
    madrid: ['mad'],
    zurich: ['zrh'],
    vienna: ['vie'],
    athens: ['ath'],
    istanbul: ['ist', 'saw']
  };

  function normalizeAirports(list) {
    return list
      .filter(a => a && a.code)
      .map(a => ({
        ...a,
        city_lc: norm(a.city),
        country_lc: norm(a.country),
        name_lc: norm(a.name),
        code_lc: (a.code || '').toLowerCase()
      }));
  }

  let AIRPORTS = normalizeAirports(FALLBACK_AIRPORTS);

  async function loadAirports() {
    try {
      const res = await fetch('assets/data/airports.min.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        AIRPORTS = normalizeAirports(data);
      }
    } catch (err) {
      console.warn('Using fallback airports dataset. Load error:', err);
    }
  }
  loadAirports();

  function scoreAirport(a, q) {
    let s = 0;
    if (a.code_lc === q) s += 200;              // exact code
    if (a.city_lc === q || a.name_lc === q) s += 160; // exact city/name
    if (a.city_lc.startsWith(q)) s += 120;
    if (a.name_lc.startsWith(q)) s += 100;
    if (a.country_lc.startsWith(q)) s += 60;
    if (a.city_lc.includes(q)) s += 40;
    if (a.name_lc.includes(q)) s += 30;
    if (a.country_lc.includes(q)) s += 10;
    if (a.code_lc.includes(q)) s += 80;         // partial code
    return s;
  }

  function searchAirports(query) {
    if (!query || query.trim().length < 1) return [];
    const q = norm(query.trim());
    const aliasCodes = CITY_ALIASES[q] || [];
    const candidates = AIRPORTS.filter(a =>
      a.city_lc.includes(q) || a.country_lc.includes(q) || a.name_lc.includes(q) || a.code_lc.includes(q) || aliasCodes.includes(a.code_lc)
    );
    return candidates
      .map(a => ({ a, s: scoreAirport(a, q) + (aliasCodes.includes(a.code_lc) ? 120 : 0) }))
      .sort((x, y) => y.s - x.s || x.a.city_lc.localeCompare(y.a.city_lc) || x.a.name_lc.localeCompare(y.a.name_lc))
      .slice(0, 10)
      .map(x => x.a);
  }

  function renderSuggestions(dropdown, items, input) {
    if (!dropdown) return;
    dropdown.innerHTML = '';
    if (!items.length) { dropdown.style.display = 'none'; return; }
    items.forEach((a, idx) => {
      const div = document.createElement('div');
      div.className = 'suggestion-item' + (idx === 0 ? ' active' : '');
      div.textContent = `${a.city}, ${a.country} - ${a.name} (${a.code})`;
      div.dataset.code = a.code;
      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        applySelection(input, a);
        hideSuggestions(dropdown);
      });
      dropdown.appendChild(div);
    });
    dropdown.style.display = 'block';
  }

  function hideSuggestions(dropdown) { if (dropdown) dropdown.style.display = 'none'; }

  function applySelection(input, airport) {
    input.value = `${airport.city}, ${airport.country} - ${airport.name} (${airport.code})`;
    input.dataset.code = airport.code;
  }

  function setupAutocomplete(input, dropdown) {
    if (!input || !dropdown) return;
    input.addEventListener('input', () => { delete input.dataset.code; renderSuggestions(dropdown, searchAirports(input.value), input); });
    input.addEventListener('focus', () => { renderSuggestions(dropdown, searchAirports(input.value), input); });
    input.addEventListener('blur', () => { setTimeout(() => hideSuggestions(dropdown), 120); });
    input.addEventListener('keydown', (e) => {
      const items = Array.from(dropdown.querySelectorAll('.suggestion-item'));
      if (!items.length) return;
      const idx = items.findIndex(el => el.classList.contains('active'));
      if (e.key === 'ArrowDown') { e.preventDefault(); const next = (idx + 1) % items.length; items.forEach(el => el.classList.remove('active')); items[next].classList.add('active'); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); const prev = (idx - 1 + items.length) % items.length; items.forEach(el => el.classList.remove('active')); items[prev].classList.add('active'); }
      else if (e.key === 'Enter') { const active = items[idx >= 0 ? idx : 0]; if (active) { e.preventDefault(); input.value = active.textContent || ''; input.dataset.code = active.dataset.code; hideSuggestions(dropdown); } }
      else if (e.key === 'Escape') { hideSuggestions(dropdown); }
    });
  }

  setupAutocomplete(fromInput, fromDropdown);
  setupAutocomplete(toInput, toDropdown);

  // ---------- Submit & API ----------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const startDate = departPicker.selectedDates[0] || null;
    const endDate = (tripOneway && tripOneway.checked) ? null : (returnPicker.selectedDates[0] || null);
    const from = await resolveIataCode(fromInput);
    const to = await resolveIataCode(toInput);
    try {
      const items = await fetchAPIFlights({ from, to, startDate, endDate, adults: parseInt(paxInput.value || '1', 10), cabin: cabinSelect.value });
      renderResults(items);
    } catch (err) {
      console.warn('API fetch failed, using mock:', err);
      setResultsStatus('Demo');
      renderResults(getMockFlights(from, to, startDate, endDate));
    }
  });

  function ymd(d) { return d ? new Date(d).toISOString().slice(0, 10) : ''; }

  async function fetchAPIFlights({ from, to, startDate, endDate, adults, cabin }) {
    if (!from || !to) throw new Error('Missing IATA codes');
    const params = new URLSearchParams({ from, to, start: ymd(startDate) });
    if (endDate) params.set('end', ymd(endDate));
    if (adults) params.set('adults', String(Math.max(1, Math.min(9, adults))));
    if (cabin) params.set('travelClass', cabin);
    const res = await fetch(`${API_BASE}/api/flights?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.items) return [];
    setResultsStatus('Live');
    return json.items.map(it => ({ ...it, currency: currencySymbol(it.currency || 'USD') }));
  }

  function currencySymbol(code) {
    switch ((code || '').toUpperCase()) {
      case 'USD': return '$';
      case 'CAD': return 'CA$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'JPY': return '¥';
      case 'AUD': return 'A$';
      default: return code + ' ';
    }
  }

  async function resolveIataCode(inputEl) {
    if (!inputEl) return '';
    if (inputEl.dataset && inputEl.dataset.code) return inputEl.dataset.code;
    const raw = (inputEl.value || '').trim();
    const m = raw.match(/\(([A-Z0-9]{3})\)$/);
    if (m) return m[1];
    if (/^[A-Za-z]{3}$/.test(raw)) return raw.toUpperCase();
    const items = searchAirports(raw);
    return items && items[0] ? items[0].code : raw.toUpperCase();
  }

  function setResultsStatus(mode) {
    const elBadge = document.getElementById('results-status');
    if (!elBadge) return;
    if (mode === 'Live') {
      elBadge.textContent = 'Live';
      elBadge.style.backgroundColor = '#244b2f';
      elBadge.style.color = '#a7f3d0';
      elBadge.style.borderColor = '#2f6d44';
    } else {
      elBadge.textContent = 'Demo';
      elBadge.style.backgroundColor = '#403b2a';
      elBadge.style.color = '#facc15';
      elBadge.style.borderColor = '#5a5032';
    }
  }

  // ---------- Rendering ----------
  function el(tag, cls, html) { const node = document.createElement(tag); if (cls) node.className = cls; if (html != null) node.innerHTML = html; return node; }
  function fmtTime(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function fmtDuration(minutes) { const h = Math.floor(minutes / 60); const m = minutes % 60; return h && m ? `${h} hr ${m} min` : (h ? `${h} hr` : `${m} min`); }
  function dayDiff(d1, d2) { const a = new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()); const b = new Date(d2.getFullYear(), d2.getMonth(), d2.getDate()); return Math.round((b - a) / 86400000); }
  function diffMinutes(a, b) { return Math.max(1, Math.round((b - a) / 60000)); }

  function renderResults(items) {
    if (!resultsList) return;
    resultsList.innerHTML = '';
    if (!items || !items.length) { resultsList.appendChild(el('div', 'results-empty', 'No flights found. Try different dates.')); return; }
    items.forEach((it) => resultsList.appendChild(renderCard(it)));
  }

  function renderCard(it) {
    const card = el('div', 'flight-card');
    const badge = el('div', 'airline-badge', (it.carriers && it.carriers[0] ? it.carriers[0].code : 'XX'));
    const main = el('div', 'flight-main');
    const right = el('div', 'price-col');

    const dep = new Date(it.departure);
    const arr = new Date(it.arrival);
    const times = el('div', 'flight-times');
    const plus = dayDiff(dep, arr);
    times.textContent = `${fmtTime(dep)} – ${fmtTime(arr)}${plus > 0 ? ' +' + plus : ''}`;

    const sub = el('div', 'flight-subline', (it.carriers || []).map(c => c.name || c.code).join(', '));

    const meta = el('div', 'flight-meta');
    meta.appendChild(el('span', 'meta-chip', fmtDuration(it.totalMinutes)));
    meta.appendChild(el('span', 'meta-chip', `${it.stops} ${it.stops === 1 ? 'stop' : 'stops'}`));
    const stopCodes = (it.segments || []).slice(0, -1).map(s => s.to).join(', ');
    if (stopCodes) meta.appendChild(el('span', 'meta-chip', stopCodes));
    meta.appendChild(el('span', 'co2-chip', `${it.emissionsKg} kg CO2e`));

    main.appendChild(times);
    main.appendChild(sub);
    main.appendChild(meta);

    const price = el('div', 'price', `${it.currency}${it.price}`);
    const toggle = el('button', 'toggle-btn', '▾');
    right.appendChild(price);
    right.appendChild(toggle);

    card.appendChild(badge);
    card.appendChild(main);
    card.appendChild(right);

    const segWrap = el('div', 'segments');
    (it.segments || []).forEach((s, i) => {
      const row = el('div', 'segment-row');
      const sd = new Date(s.departure); const sa = new Date(s.arrival);
      row.appendChild(el('div', '', `${s.from} ${fmtTime(sd)}`));
      row.appendChild(el('div', '', '→'));
      row.appendChild(el('div', '', `${s.to} ${fmtTime(sa)}`));
      segWrap.appendChild(row);
      if (i < it.segments.length - 1) {
        const next = it.segments[i + 1];
        const lay = diffMinutes(sa, new Date(next.departure));
        segWrap.appendChild(el('div', 'layover-row', `Layover ${s.to} · ${fmtDuration(lay)}`));
      }
    });
    card.appendChild(segWrap);
    toggle.addEventListener('click', () => { const open = segWrap.classList.toggle('open'); toggle.textContent = open ? '▴' : '▾'; });
    return card;
  }

  // ---------- Mock data (fallback) ----------
  function addMinutes(d, mins) { return new Date(d.getTime() + mins * 60000); }
  function getMockFlights(from, to, startDate) {
    const depBase = startDate ? new Date(startDate) : new Date();
    depBase.setHours(6, 5, 0, 0);
    const carriers = [ { code: 'UA', name: 'United' }, { code: 'AC', name: 'Air Canada' }, { code: 'NH', name: 'ANA' } ];
    const c = (codes) => codes.map(code => carriers.find(k => k.code === code)).filter(Boolean);
    const make = (segments, price, currency, emission) => {
      const departure = new Date(segments[0].departure);
      const arrival = new Date(segments[segments.length - 1].arrival);
      let total = 0; segments.forEach(s => { total += diffMinutes(new Date(s.departure), new Date(s.arrival)); });
      const uniqueCarriers = Array.from(new Set(segments.map(s => s.carrier)));
      return { from, to, departure, arrival, segments, totalMinutes: total, stops: Math.max(0, segments.length - 1), carriers: c(uniqueCarriers), price, currency, emissionsKg: emission };
    };
    const D0 = depBase;
    const s1a = { carrier: 'UA', from, to: 'EWR', departure: addMinutes(D0, 0), arrival: addMinutes(D0, 155) };
    const s1b = { carrier: 'NH', from: 'EWR', to, departure: addMinutes(D0, 313), arrival: addMinutes(D0, 1213) };
    const s2a = { carrier: 'AC', from, to: 'YYZ', departure: addMinutes(D0, 260), arrival: addMinutes(D0, 330) };
    const s2b = { carrier: 'UA', from: 'YYZ', to: 'ORD', departure: addMinutes(D0, 435), arrival: addMinutes(D0, 525) };
    const s2c = { carrier: 'NH', from: 'ORD', to, departure: addMinutes(D0, 695), arrival: addMinutes(D0, 1565) };
    const s3a = { carrier: 'AC', from, to: 'YUL', departure: addMinutes(D0, 390), arrival: addMinutes(D0, 455) };
    const s3b = { carrier: 'AC', from: 'YUL', to, departure: addMinutes(D0, 518), arrival: addMinutes(D0, 1298) };
    const items = [ make([s1a, s1b], 1211, 'CA$', 767), make([s2a, s2b, s2c], 1211, 'CA$', 1099), make([s3a, s3b], 1235, 'CA$', 823) ];
    return items;
  }
});

