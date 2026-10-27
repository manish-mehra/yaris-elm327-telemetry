import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import TripChart from "./TripChart.jsx";
import useDark from "./useDark.js";
import { SPECS } from "./specs.js";
import { loadDefault, emptyData } from "./data.js";
import { clock, num, avg, hhmm } from "./utils.js";

const Stat = ({ l, v, u, sub }) => (
  <div className="stat">
    <small>{l}</small>
    <strong>{v}</strong>
    {u && <em>{u}</em>}
    {sub && <small>{sub}</small>}
  </div>
);

export default function App() {
  const [data, setData] = useState(emptyData);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [rng, setRng] = useState([0, 100]); // time window, percent of trip
  const [msg, setMsg] = useState("");
  const dark = useDark();

  useEffect(() => { loadDefault().then(setData).finally(() => setLoading(false)); }, []);

  // Group samples by trip once per dataset.
  const idx = useMemo(() => {
    const g = (rows) => { const m = {}; rows.forEach((r) => (m[r.trip_id] || (m[r.trip_id] = [])).push(r)); return m; };
    return { a: g(data.samples_1s), b: g(data.samples_30s), c: Object.fromEntries(data.trip_start_data.map((r) => [r.trip_id, r])) };
  }, [data]);

  const endOf = (t) => {
    const r = idx.a[t.id];
    return t.ended_at || (r && r.length ? r[r.length - 1].ts : t.started_at);
  };

  // Newest day first; several trips per day.
  const days = useMemo(() => {
    const m = new Map();
    [...data.trips].sort((a, b) => b.started_at - a.started_at).forEach((t) => {
      const d = new Date(t.started_at), k = d.toDateString();
      if (!m.has(k)) m.set(k, { label: d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }), trips: [] });
      m.get(k).trips.push(t);
    });
    return [...m.values()];
  }, [data]);

  const trip = data.trips.find((t) => t.id === sel) || (days[0] && days[0].trips[0]);
  useEffect(() => setRng([0, 100]), [trip && trip.id]);

  const s1 = trip ? idx.a[trip.id] || [] : [];
  const s30 = trip ? idx.b[trip.id] || [] : [];
  const start = trip ? idx.c[trip.id] : null;
  const dur = trip ? Math.max(1, (endOf(trip) - trip.started_at) / 1000) : 1;
  const xr = useMemo(() => [(rng[0] * dur) / 100, (rng[1] * dur) / 100], [rng, dur]);

  const st = useMemo(() => {
    let dist = 0;
    for (let i = 1; i < s1.length; i++) dist += (s1[i].speed_kmh * (s1[i].ts - s1[i - 1].ts)) / 3.6e6;
    const col = (rows, k) => rows.map((r) => r[k]).filter((v) => v != null);
    return {
      dist, top: Math.max(0, ...col(s1, "speed_kmh")), rpm: avg(col(s1, "rpm")),
      c0: (s1[0] || {}).coolant_temp_c, c1: (s1[s1.length - 1] || {}).coolant_temp_c,
      stft: avg(col(s1, "short_fuel_trim")), ltft: avg(col(s30, "long_fuel_trim")),
      volt: avg(col(s30, "module_voltage_v")), cat: Math.max(...col(s30, "catalyst_temp_c")),
    };
  }, [s1, s30]);


  const dtcs = (() => { try { return JSON.parse(start.stored_dtcs); } catch { return []; } })();

  return (
    <>
      <header>
        <div>
          <h1>Trip log</h1>
          <div className="hd-sub">{loading ? "Loading…" : data.trips.length + (data.trips.length === 1 ? " trip" : " trips") + " loaded"}</div>
        </div>
      </header>

      <div className="app">
        <aside>
          {days.map((d) => (
            <div key={d.label}>
              <div className="day">
                <span>{d.label}</span>
                <span>{d.trips.length + (d.trips.length === 1 ? " trip" : " trips")}</span>
              </div>
              {d.trips.map((t) => {
                const rows = idx.a[t.id] || [], du = (endOf(t) - t.started_at) / 1000, sd = idx.c[t.id];
                const bad = sd && (sd.mil_on || sd.dtc_count);
                return (
                  <button key={t.id} className={"trip" + (trip && trip.id === t.id ? " on" : "")} onClick={() => setSel(t.id)}>
                    <b>{hhmm(t.started_at)}</b>
                    <span>{clock(du) + " · top " + Math.max(0, ...rows.map((r) => r.speed_kmh)) + " km/h" + (bad ? " · fault code" : "")}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {msg && <div className="msg">{msg}</div>}
        </aside>

        <main>
          {!trip ? (
            <div className="empty">{loading ? "Loading…" : "No trips found. Put trips.json, samples_1s.json and samples_30s.json in public/data/, or use Load JSON files."}</div>
          ) : (
            <>
              <div className="top">
                <h2>
                  {new Date(trip.started_at).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) + ", " + hhmm(trip.started_at)}
                </h2>
                <span className="hd-sub">{"Trip #" + trip.id + (trip.ended_at ? "" : " · no end time recorded")}</span>
              </div>

              {start && (
                <div className="pills">
                  <span className={"pill" + (start.mil_on ? " bad" : "")}>Check-engine light {start.mil_on ? "on" : "off"}</span>
                  <span className={"pill" + (start.dtc_count ? " bad" : "")}>
                    {start.dtc_count ? "Fault codes: " + dtcs.join(", ") : "No fault codes"}
                  </span>
                  <span className="pill">{num(start.distance_since_dtc_clr, 0)} km since codes cleared</span>
                  <span className="pill">Engine had run {clock(start.run_time_s)} at start</span>
                  <span className="pill">VIN {start.vin || "not read"}</span>
                </div>
              )}

              <div className="stats">
                <Stat l="Duration" v={clock(dur)} />
                <Stat l="Distance" v={num(st.dist, 1)} u="km" sub="estimated from speed" />
                <Stat l="Top speed" v={num(st.top, 0)} u="km/h" />
                <Stat l="Average RPM" v={num(st.rpm, 0)} />
                <Stat l="Coolant" v={num(st.c0, 0) + " → " + num(st.c1, 0)} u="°C" />
                <Stat l="Fuel trim, avg" v={num(st.stft, 1) + " / " + num(st.ltft, 1)} u="%" sub="short / long" />
                <Stat l="Module voltage" v={num(st.volt, 2)} u="V" />
                <Stat l="Catalyst peak" v={num(st.cat, 0)} u="°C" />
              </div>

              <div className="range">
                <label htmlFor="r0">From</label>
                <input id="r0" type="range" min="0" max="100" step="0.5" value={rng[0]}
                  onChange={(e) => setRng([Math.min(+e.target.value, rng[1] - 2), rng[1]])} />
                <button className="btn" onClick={() => setRng([0, 100])}>Show all</button>
                <label htmlFor="r1">To</label>
                <input id="r1" type="range" min="0" max="100" step="0.5" value={rng[1]}
                  onChange={(e) => setRng([rng[0], Math.max(+e.target.value, rng[0] + 2)])} />
                <span />
                <div className="win">
                  <span>Window {clock(xr[0])} to {clock(xr[1])}</span>
                  <span>Hover any chart to compare the same moment on all of them. Click a legend item to hide a line.</span>
                </div>
              </div>

              <div className="charts">
                {SPECS.map((sp) => (
                  <TripChart key={sp.t} spec={sp} t0={trip.started_at} s1={s1} s30={s30} xr={xr} dark={dark} />
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </>
  );
}
