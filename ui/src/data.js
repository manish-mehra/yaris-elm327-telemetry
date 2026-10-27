// Everything about getting data into the app lives here.
// Swap these for real fetch() calls once the backend endpoints exist.

/* ---------- parsing sqlite JSON exports ---------- */
// The sqlite shell output can include a prompt or trailing text, so only the
// outermost [...] is parsed.
export const parseText = (t) => JSON.parse(t.slice(t.indexOf("["), t.lastIndexOf("]") + 1));

export const kind = (rows) => {
  const k = rows[0] || {};
  return "speed_kmh" in k ? "samples_1s"
    : "long_fuel_trim" in k ? "samples_30s"
    : "started_at" in k ? "trips"
    : "stored_dtcs" in k ? "trip_start_data"
    : null;
};

export const emptyData = () => ({ trips: [], samples_1s: [], samples_30s: [], trip_start_data: [] });

// If the trips table wasn't exported, derive trips from the samples.
export function finalize(D) {
  if (!D.trips.length) {
    const m = {};
    D.samples_1s.concat(D.samples_30s).forEach((s) => {
      const t = m[s.trip_id] || (m[s.trip_id] = { id: s.trip_id, started_at: s.ts, ended_at: null });
      t.started_at = Math.min(t.started_at, s.ts);
    });
    D.trips = Object.values(m);
  }
  return D;
}

/* ---------- load the JSON files from public/data ---------- */
// Files are served from /data/*.json. trip_start_data.json is optional.
const FILES = { trips: "trips", samples_1s: "samples_1s", samples_30s: "samples_30s", trip_start_data: "trip_start_data" };

export async function loadDefault() {
  const D = emptyData();
  await Promise.all(Object.entries(FILES).map(async ([key, name]) => {
    try {
      const res = await fetch("/data/" + name + ".json");
      if (res.ok) D[key] = parseText(await res.text());
    } catch { /* missing or not JSON: skip */ }
  }));
  return finalize(D);
}

// Later, replace loadDefault with calls to your backend, e.g.
//   GET /api/trips            -> [{id, started_at, ended_at}]
//   GET /api/trips/:id        -> { samples_1s, samples_30s, start }
