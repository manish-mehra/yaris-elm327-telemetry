import { useEffect, useMemo, useState } from "react";
import TripChart from "./TripChart.jsx";
import ReplayModal from "./ReplayModal.jsx";
import useDark from "./useDark.js";
import { SPECS } from "./specs.js";
import { loadDefault } from "./data.js";
import { clock, num, avg, hhmm } from "./utils.js";
import Replay from "./Replay.jsx";

// Edit these two lines for your car. Put the photo in public/car.png.
const CAR = { name: "My car", image: "/car.png" };

const group = (rows) => {
  const out = {};
  rows.forEach((r) => (out[r.trip_id] ||= []).push(r));
  return out;
};
const col = (rows, key) => rows.map((r) => r[key]).filter((v) => v != null);

const Stat = ({ label, value, unit, note }) => (
  <div className="stat">
    <span>{label}</span>
    <strong>{value}<em>{unit}</em></strong>
    {note && <small>{note}</small>}
  </div>
);

export default function App() {
  const [data, setData] = useState(null); // null = still loading
  const [tripId, setTripId] = useState(null);
  const [range, setRange] = useState([0, 100]); // visible window, % of trip
  const [replayOpen, setReplayOpen] = useState(false);
  const dark = useDark();

  useEffect(() => { loadDefault().then(setData); }, []);

  // Group samples by trip once per dataset.
  const by = useMemo(() => {
    if (!data) return null;
    return {
      s1: group(data.samples_1s),
      s30: group(data.samples_30s),
      start: Object.fromEntries(data.trip_start_data.map((r) => [r.trip_id, r])),
    };
  }, [data]);

  const trips = useMemo(
    () => (data ? [...data.trips].sort((a, b) => b.started_at - a.started_at) : []),
    [data]
  );
  const trip = trips.find((t) => t.id === tripId) || trips[0];
  useEffect(() => setRange([0, 100]), [trip?.id]);

  const s1 = (trip && by.s1[trip.id]) || [];
  const s30 = (trip && by.s30[trip.id]) || [];
  const start = trip && by.start[trip.id];
  const end = trip ? trip.ended_at || s1.at(-1)?.ts || trip.started_at : 0;
  const seconds = trip ? Math.max(1, (end - trip.started_at) / 1000) : 1;
  const xr = [(range[0] * seconds) / 100, (range[1] * seconds) / 100];

  const label = (t) =>
    new Date(t.started_at).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) +
    ", " + hhmm(t.started_at);

  // Numbers shown in the stat tiles.
  let km = 0;
  for (let i = 1; i < s1.length; i++) km += (s1[i].speed_kmh * (s1[i].ts - s1[i - 1].ts)) / 3.6e6;
  const dtcs = (() => { try { return JSON.parse(start.stored_dtcs); } catch { return []; } })();

  return (
    <div className="page">
      <header className="car">
        <div className="car-photo">
          <img src={CAR.image} alt={CAR.name} onError={(e) => (e.target.style.display = "none")} />
        </div>
        <div className="car-info">
          <h1>{CAR.name}</h1>
          <p>{start?.vin ? "VIN " + start.vin : "Trip log"}</p>
          <select
            value={trip ? trip.id : ""}
            disabled={!trips.length}
            onChange={(e) => setTripId(+e.target.value)}
            aria-label="Choose a trip"
            style={{marginRight: "2em"}} 
          >
            {!trips.length && <option>{data ? "No trips found" : "Loading…"}</option>}
            {trips.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}
          </select>
          <button className="rpm-btn" disabled={s1.length < 2} onClick={() => setReplayOpen(true)}>Replay trip</button>
        </div>
        {start && (
          <div className="pills">
            <span className={start.mil_on ? "pill bad" : "pill"}>Check-engine light {start.mil_on ? "on" : "off"}</span>
            <span className={start.dtc_count ? "pill bad" : "pill"}>
              {start.dtc_count ? "Fault codes: " + dtcs.join(", ") : "No fault codes"}
            </span>
            <span className="pill">{num(start.distance_since_dtc_clr, 0)} km since codes cleared</span>
            <span className="pill">Engine had run {clock(start.run_time_s)} at start</span>
          </div>
        )}
      </header>

      {!data && <div className="loader"><i /> Loading trips…</div>}
      {data && !trip && (
        <div className="loader">Add trips.json, samples_1s.json and samples_30s.json to public/data/.</div>
      )}

      {trip && (
        <main>
          <section className="stats">
            <Stat label="Duration" value={clock(seconds)} />
            <Stat label="Distance" value={num(km, 1)} unit=" km" note="estimated from speed" />
            <Stat label="Top speed" value={num(Math.max(0, ...col(s1, "speed_kmh")), 0)} unit=" km/h" />
            <Stat label="Average RPM" value={num(avg(col(s1, "rpm")), 0)} />
            <Stat label="Coolant" value={num(s1[0]?.coolant_temp_c, 0) + " → " + num(s1.at(-1)?.coolant_temp_c, 0)} unit=" °C" />
            <Stat label="Fuel trim" value={num(avg(col(s1, "short_fuel_trim")), 1) + " / " + num(avg(col(s30, "long_fuel_trim")), 1)} unit=" %" note="short / long" />
            <Stat label="Module voltage" value={num(avg(col(s30, "module_voltage_v")), 2)} unit=" V" />
            <Stat label="Catalyst peak" value={num(Math.max(...col(s30, "catalyst_temp_c")), 0)} unit=" °C" />
          </section>

          <section className="range">
            <label>From <input type="range" min="0" max="100" step="0.5" value={range[0]}
              onChange={(e) => setRange([Math.min(+e.target.value, range[1] - 2), range[1]])} /></label>
            <label>To <input type="range" min="0" max="100" step="0.5" value={range[1]}
              onChange={(e) => setRange([range[0], Math.max(+e.target.value, range[0] + 2)])} /></label>
            <button onClick={() => setRange([0, 100])}>Show all</button>
            <p>Showing {clock(xr[0])} to {clock(xr[1])}. Hover a chart to compare the same moment on all of them.</p>
          </section>

          <section className="charts">
            {SPECS.map((spec) => (
              <TripChart key={spec.t} spec={spec} t0={trip.started_at} s1={s1} s30={s30} xr={xr} dark={dark} />
            ))}
          </section>
        </main>
      )}
      <ReplayModal 
      open={replayOpen && s1.length > 1} onClose={() => setReplayOpen(false)}
        title={trip ? "Trip replay: " + label(trip) : ""} key={trip?.id}
        s1={s1} s30={s30} start={start} dark={dark} />
        <section className="replay-section">
  <h2>Watch this trip</h2>
  <p>Replay the drive second by second. Speed, RPM and engine readings follow the recorded data.</p>
  <Replay key={trip?.id} s1={s1} s30={s30} start={start} dark={dark} />
</section>
    </div>
  );
}