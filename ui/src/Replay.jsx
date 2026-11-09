import { useEffect, useMemo, useRef, useState } from "react";
import "./replay.css";

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mmss = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };

const W = 1000, H = 240, GY = 140, CARX = 300, GROUND = GY + 80;
const STARS = Array.from({ length: 80 }, (_, i) => [(i * 379) % 1000, (i * 173) % 100, (i % 3) * 0.5 + 0.6]);

/* ---- data helpers ---- */
function lerpAt(arr, t, maxGap) {
  if (!arr.length) return null;
  if (t <= arr[0].ts) return arr[0];
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; arr[m].ts <= t ? (lo = m) : (hi = m - 1); }
  const a = arr[lo], b = arr[lo + 1];
  if (!b || b.ts - a.ts > maxGap) return a;
  const f = (t - a.ts) / (b.ts - a.ts), o = { ...a };
  for (const k in a) if (typeof a[k] === "number" && typeof b[k] === "number" && k !== "ts" && k !== "id") o[k] = a[k] + (b[k] - a[k]) * f;
  return o;
}

/* ---- gauge ---- */
function Gauge({ v, max, step, red, text, unit, id }) {
  const ang = (x) => -120 + 240 * clamp(x / max, 0, 1);
  const P = (d, r) => { const t = ((d - 90) * Math.PI) / 180; return [150 + r * Math.cos(t), 150 + r * Math.sin(t)]; };
  const arc = (a, b, r) => { const [x0, y0] = P(a, r), [x1, y1] = P(b, r); return `M${x0} ${y0}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const ticks = [];
  for (let i = 0; i <= max + 1e-6; i += step) {
    const d = ang(i), [x0, y0] = P(d, 126), [x1, y1] = P(d, 108), [tx, ty] = P(d, 90);
    ticks.push(<g key={i}><line x1={x0} y1={y0} x2={x1} y2={y1} className={red && i >= red ? "tk red" : "tk"} /><text x={tx} y={ty + 4} className="tl" textAnchor="middle">{i}</text></g>);
    if (i < max) { const d2 = ang(i + step / 2), [a0, b0] = P(d2, 126), [a1, b1] = P(d2, 118); ticks.push(<line key={"m" + i} x1={a0} y1={b0} x2={a1} y2={b1} className="tk minor" />); }
  }
  const na = ang(v), [nx, ny] = P(na, 104), [bx, by] = P(na + 180, 18);
  return (
    <svg className="gauge" viewBox="0 12 300 242" role="img" aria-label={`${text} ${unit}`}>
      <defs><linearGradient id={id} x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#2fd6e8" /><stop offset="1" stopColor="#7c5cff" /></linearGradient></defs>
      <circle cx="150" cy="150" r="140" className="face" />
      <path d={arc(-120, 120, 134)} className="track" />
      {red && <path d={arc(ang(red), 120, 134)} className="redzone" />}
      {v > max * 0.005 && <path d={arc(-120, na, 134)} stroke={`url(#${id})`} className="prog" />}
      {ticks}
      <line x1={bx} y1={by} x2={nx} y2={ny} className="needle" />
      <circle cx="150" cy="150" r="11" className="hub" /><circle cx="150" cy="150" r="4" className="hub2" />
      <text x="150" y="212" textAnchor="middle" className="gv">{text}</text>
      <text x="150" y="234" textAnchor="middle" className="gu">{unit}</text>
    </svg>
  );
}
const Bar = ({ label, v, max, unit, dp = 0, color }) => (
  <div className="bar"><div className="bt"><span>{label}</span><b>{v.toFixed(dp)} {unit}</b></div><i><u style={{ width: clamp((v / max) * 100, 0, 100) + "%", background: color }} /></i></div>
);

/* ---- scene ---- */
function hills(c, off, base, amp, col, k) {
  c.fillStyle = col; c.beginPath(); c.moveTo(0, H);
  for (let x = 0; x <= W; x += 8) { const X = x + off; c.lineTo(x, base - amp * (Math.sin(X * 0.006 * k) + 0.6 * Math.sin(X * 0.017 * k + 2))); }
  c.lineTo(W, H); c.fill();
}
function drawScene(c, r, a, time, dark) {
  const sp = a.speed_kmh, d = r.dist;
  const sky = c.createLinearGradient(0, 0, 0, GY);
  dark ? (sky.addColorStop(0, "#050816"), sky.addColorStop(1, "#1b2150")) : (sky.addColorStop(0, "#7fc4f5"), sky.addColorStop(1, "#dff1fb"));
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  if (dark) { c.fillStyle = "#fff"; STARS.forEach(([x, y, s], i) => { c.globalAlpha = 0.5 + 0.5 * Math.sin(time / 700 + i); c.fillRect(x, y, s, s); }); c.globalAlpha = 1; }
  const sun = c.createRadialGradient(820, 70, 2, 820, 70, 70);
  sun.addColorStop(0, dark ? "#fff6d8" : "#fffbe6"); sun.addColorStop(0.3, dark ? "#fff6d8" : "#fffbe6"); sun.addColorStop(0.36, dark ? "rgba(255,246,216,.15)" : "rgba(255,240,180,.4)"); sun.addColorStop(1, "rgba(255,246,216,0)");
  c.fillStyle = sun; c.fillRect(740, 0, 180, 160);
  hills(c, d * 0.03, 120, 30, dark ? "#141a3d" : "#9cc5d8", 1); hills(c, d * 0.09, 150, 22, dark ? "#0d1230" : "#7fae95", 1.7);
  c.fillStyle = dark ? "#12151f" : "#4a4f5c"; c.fillRect(0, GY, W, H - GY);
  c.fillStyle = dark ? "#1d2233" : "#6a7080"; c.fillRect(0, GY, W, 5);
  c.fillStyle = "#cfd8ee"; c.fillRect(0, GY + 8, W, 2); c.fillRect(0, H - 8, W, 2);
  c.fillStyle = "#ffd34d"; for (let x = -(d % 90) - 90; x < W; x += 90) c.fillRect(x, GY + 62, 50, 4);
  for (let i = -1; i < 5; i++) {
    const x = i * 330 - (d % 330) + 60;
    c.fillStyle = dark ? "#2a3350" : "#5a6278"; c.fillRect(x, GY - 100, 4, 100); c.fillRect(x, GY - 100, 30, 4);
    if (dark) { const g = c.createRadialGradient(x + 30, GY - 92, 1, x + 30, GY - 92, 90); g.addColorStop(0, "rgba(255,220,140,.5)"); g.addColorStop(1, "rgba(255,220,140,0)"); c.fillStyle = g; c.fillRect(x - 60, GY - 180, 180, 180); c.fillStyle = "#ffe6a8"; c.fillRect(x + 25, GY - 97, 10, 4); }
  }
  if (sp > 45) { c.strokeStyle = `rgba(${dark ? "200,230,255" : "255,255,255"},${clamp((sp - 45) / 200, 0, 0.4)})`; c.lineWidth = 1.5; for (let i = 0; i < 14; i++) { const y = 30 + ((i * 53) % 130), x = W - ((i * 131 + d * 2.2) % (W + 300)) + 100; c.beginPath(); c.moveTo(x, y); c.lineTo(x + sp * 0.9, y); c.stroke(); } }
  r.parts.forEach((p) => { c.fillStyle = `rgba(190,200,220,${p.life * 0.35})`; c.beginPath(); c.arc(p.x, p.y, 3 + (1 - p.life) * 9, 0, 7); c.fill(); });
  c.fillStyle = "rgba(0,0,0,.45)"; c.beginPath(); c.ellipse(CARX, GROUND + 3, 190, 10, 0, 0, 7); c.fill();
  const bob = Math.sin(time * (0.02 + a.rpm / 60000)) * (0.3 + a.engine_load / 90);
  c.save(); c.translate(CARX, GROUND + bob); c.rotate(r.pitch); drawCar(c, r, dark); c.restore();
}

// A white fastback coupe in side view. Origin = ground, middle of the car, nose to the right.
function drawCar(c, r, dark) {
  const hb = c.createLinearGradient(166, 0, 560, 0);
  hb.addColorStop(0, `rgba(255,244,200,${dark ? 0.6 : 0.25})`); hb.addColorStop(1, "rgba(255,244,200,0)");
  c.fillStyle = hb; c.beginPath(); c.moveTo(165, -50); c.lineTo(560, -100); c.lineTo(560, 10); c.lineTo(165, -40); c.fill();
  // body
  const g = c.createLinearGradient(0, -110, 0, -16);
  g.addColorStop(0, "#ffffff"); g.addColorStop(0.55, "#f1f4f9"); g.addColorStop(1, "#b9c2d3");
  c.fillStyle = g; c.strokeStyle = "rgba(120,135,165,.55)"; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-160, -18); c.lineTo(-165, -40); c.lineTo(-160, -62);
  c.quadraticCurveTo(-140, -78, -100, -92);
  c.bezierCurveTo(-70, -108, -20, -112, 10, -108);
  c.bezierCurveTo(40, -104, 75, -78, 105, -66);
  c.lineTo(150, -58); c.quadraticCurveTo(167, -54, 169, -40); c.lineTo(167, -20); c.lineTo(150, -18); c.closePath(); c.fill(); c.stroke();
  // glass
  const gl = c.createLinearGradient(0, -102, 0, -67); gl.addColorStop(0, "#27324d"); gl.addColorStop(1, "#0d1220");
  c.fillStyle = gl; c.beginPath(); c.moveTo(-108, -78); c.bezierCurveTo(-85, -96, -30, -102, 4, -99);
  c.bezierCurveTo(28, -92, 58, -76, 76, -67); c.lineTo(-108, -67); c.closePath(); c.fill();
  c.strokeStyle = "#f4f6fa"; c.lineWidth = 4; c.beginPath(); c.moveTo(-6, -100); c.lineTo(-10, -67); c.stroke();
  c.fillStyle = "rgba(255,255,255,.18)"; c.beginPath(); c.moveTo(-60, -96); c.lineTo(-30, -100); c.lineTo(-52, -68); c.lineTo(-78, -68); c.fill();
  // body lines: shoulder, sill, door handle, mirror
  c.strokeStyle = "rgba(130,145,175,.6)"; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-150, -58); c.quadraticCurveTo(0, -64, 148, -54); c.stroke();
  c.beginPath(); c.moveTo(-140, -24); c.lineTo(140, -24); c.stroke();
  c.fillStyle = "#c9d1e0"; c.fillRect(-48, -58, 22, 4); c.fillRect(14, -58, 22, 4);
  c.fillStyle = "#e9edf5"; c.beginPath(); c.ellipse(72, -69, 9, 5, -0.3, 0, 7); c.fill();
  // wheel wells + wheels
  [-100, 100].forEach((x) => {
    c.fillStyle = "#0a0d16"; c.beginPath(); c.arc(x, -30, 34, 0, 7); c.fill();
    c.save(); c.translate(x, -30); c.fillStyle = "#13161f"; c.beginPath(); c.arc(0, 0, 30, 0, 7); c.fill();
    const rim = c.createRadialGradient(0, 0, 3, 0, 0, 21); rim.addColorStop(0, "#e8edf7"); rim.addColorStop(1, "#8a95ab");
    c.fillStyle = rim; c.beginPath(); c.arc(0, 0, 21, 0, 7); c.fill();
    c.rotate(r.wheel);
    for (let i = 0; i < 10; i++) { c.rotate(Math.PI / 5); c.strokeStyle = i % 2 ? "#3a4560" : "#1b2236"; c.lineWidth = i % 2 ? 2 : 3.5; c.beginPath(); c.moveTo(4, 0); c.lineTo(20, 0); c.stroke(); }
    c.fillStyle = "#2a3350"; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill(); c.restore();
  });
  // lights
  c.fillStyle = "#fff4c8"; c.shadowColor = "#fff4c8"; c.shadowBlur = 18; c.beginPath(); c.moveTo(150, -54); c.lineTo(166, -50); c.lineTo(165, -45); c.lineTo(148, -48); c.fill();
  c.fillStyle = r.braking ? "#ff1f3a" : "#a8142a"; c.shadowColor = "#ff1f3a"; c.shadowBlur = r.braking ? 26 : 8; c.fillRect(-165, -58, 5, 12); c.shadowBlur = 0;
}

/* ---- component ---- */
export default function Replay(props) {
  // Needs a trip's samples; without them show a note instead of crashing.
  if (!props.s1 || props.s1.length < 2)
    return <section className={"rp " + (props.dark === false ? "light" : "dark")}><div className="card">Pick a trip with 1-second samples to replay it.</div></section>;
  return <Player {...props} />;
}

function Player({ s1: raw1, s30: raw30 = [], start, dark = true }) {
  const s1 = useMemo(() => [...raw1].sort((a, b) => a.ts - b.ts), [raw1]);
  const s30 = useMemo(() => [...raw30].sort((a, b) => a.ts - b.ts), [raw30]);
  const t0 = s1[0].ts, dur = Math.max(1, s1[s1.length - 1].ts - t0);
  const cv = useRef(), R = useRef({ t: 0, play: true, rate: 5, dist: 0, wheel: 0, pitch: 0, prev: 0, acc: 0, odo: 0, last: 0, parts: [], braking: false, dark });
  const [ui, setUi] = useState({ play: true, rate: 5 }), [v, setV] = useState(null);
  const dtcs = useMemo(() => { try { return JSON.parse(start?.stored_dtcs || "[]"); } catch { return []; } }, [start]);
  useEffect(() => { Object.assign(R.current, ui); }, [ui]);
  useEffect(() => { R.current.dark = dark; }, [dark]);
  useEffect(() => {
    const c = cv.current.getContext("2d"); c.scale(2, 2); let raf;
    const loop = (ts) => {
      const r = R.current, dt = Math.min((ts - (r.last || ts)) / 1000, 0.1); r.last = ts;
      if (r.play) { r.t += dt * 1000 * r.rate; if (r.t >= dur) { r.t = dur; r.play = false; setUi((u) => ({ ...u, play: false })); } }
      const a = lerpAt(s1, t0 + r.t, 20000), b = lerpAt(s30, t0 + r.t, 120000) || {};
      if (r.play && dt > 0) {
        const sim = dt * r.rate; r.acc += ((a.speed_kmh - r.prev) / sim - r.acc) * Math.min(1, dt * 3); r.prev = a.speed_kmh;
        r.odo += (a.speed_kmh / 3600) * sim; r.dist += a.speed_kmh * 5 * dt; r.wheel += a.speed_kmh * 0.12 * dt; r.braking = r.acc < -6;
        if (Math.random() < dt * (6 + a.throttle_pos * 0.4)) r.parts.push({ x: CARX - 170, y: GROUND - 14, life: 1 });
        r.parts.forEach((p) => { p.x -= a.speed_kmh * 5 * dt; p.y -= 14 * dt; p.life -= dt * 0.9; }); r.parts = r.parts.filter((p) => p.life > 0);
      }
      r.pitch += (clamp(-r.acc * 0.0028, -0.05, 0.05) - r.pitch) * Math.min(1, dt * 6);
      drawScene(c, r, a, ts, r.dark);
      setV({ a, b, t: r.t, odo: r.odo });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, [s1, s30]);
  useEffect(() => {
    const k = (e) => { if (e.code === "Space" && !["SELECT", "INPUT", "BUTTON"].includes(e.target.tagName)) { e.preventDefault(); setUi((u) => ({ ...u, play: !u.play })); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  const path = useMemo(() => { const mx = Math.max(20, ...s1.map((s) => s.speed_kmh)); return s1.map((s, i) => (i ? "L" : "M") + (((s.ts - t0) / dur) * 1000).toFixed(1) + " " + (60 - (s.speed_kmh / mx) * 54).toFixed(1)).join(""); }, [s1]);

  return (
    <section className={"rp " + (dark ? "dark" : "light")}>
      <div className="scene">
        <canvas ref={cv} width={W * 2} height={H * 2} />
        {v && <>
          <div className="hud"><div className="big">{Math.round(v.a.speed_kmh)}<small>km/h</small></div>
            <span className={"badge" + (start?.mil_on ? " warn" : "")}>{start?.mil_on ? "Check engine " + dtcs.join(" ") : "No warnings"}</span></div>
          <div className="tr"><b>{mmss(v.t)}</b> / {mmss(dur)}<br />{v.odo.toFixed(2)} km driven<br />
            {v.a.speed_kmh > 3 ? ((v.a.maf_gps * 0.3287) / v.a.speed_kmh * 100).toFixed(1) + " L/100km" : "idle " + (v.a.maf_gps * 0.3287).toFixed(1) + " L/h"}</div>
        </>}
      </div>
      {v && <>
        <div className="dash">
          <div className="card"><Gauge id="rp-sp" v={v.a.speed_kmh} max={240} step={20} text={Math.round(v.a.speed_kmh)} unit="km/h" /></div>
          <div className="card bars">
            <Bar label="Throttle" v={v.a.throttle_pos} max={100} unit="%" color="linear-gradient(90deg,#2fd6e8,#7c5cff)" />
            <Bar label="Engine load" v={v.a.engine_load} max={100} unit="%" color="linear-gradient(90deg,#4ade80,#fbbf24)" />
            <Bar label="Coolant" v={v.a.coolant_temp_c} max={120} unit="°C" color={v.a.coolant_temp_c > 105 ? "#ff4a5c" : "#2fd6e8"} />
            <Bar label="Air flow (MAF)" v={v.a.maf_gps} max={60} unit="g/s" dp={1} color="#7c5cff" />
            <Bar label="Short fuel trim" v={Math.abs(v.a.short_fuel_trim)} max={25} unit={(v.a.short_fuel_trim < 0 ? "−" : "+") + "%"} dp={1} color="#fbbf24" />
            <Bar label="Intake air" v={v.a.intake_temp_c} max={80} unit="°C" color="#2fd6e8" />
          </div>
          <div className="card"><Gauge id="rp-rpm" v={v.a.rpm / 1000} max={8} step={1} red={6.5} text={Math.round(v.a.rpm)} unit="rpm × 1000" /></div>
        </div>
        <div className="mini">
          {[["Battery", v.b.module_voltage_v, 2, "V"], ["Catalyst temp", v.b.catalyst_temp_c, 0, "°C"], ["O₂ post-cat", v.b.o2_post_cat_v, 2, "V"], ["Long fuel trim", v.b.long_fuel_trim, 1, "%"], ["Outside", v.b.ambient_temp_c, 0, "°C"], ["Barometer", v.b.baro_pressure_kpa, 0, "kPa"]]
            .map(([l, x, dp, u]) => <div className="card" key={l}><span>{l}</span><b>{x != null ? x.toFixed(dp) : "–"}</b><em>{u}</em></div>)}
        </div>
        <div className="card ctl">
          <div className="row">
            <button className={ui.play ? "on" : ""} onClick={() => { if (R.current.t >= dur) { R.current.t = 0; R.current.odo = 0; } setUi((u) => ({ ...u, play: !u.play })); }}>{ui.play ? "Pause" : "Play"}</button>
            {[1, 5, 20, 60].map((x) => <button key={x} className={ui.rate === x ? "on" : ""} onClick={() => setUi((u) => ({ ...u, rate: x }))}>{x}×</button>)}
            <span className="hint">Space = play/pause. Drag the graph to jump.</span>
          </div>
          <div className="tlw">
            <svg viewBox="0 0 1000 64" preserveAspectRatio="none"><path d={path + "L1000 64L0 64Z"} className="area" /><path d={path} className="line" vectorEffect="non-scaling-stroke" />
              <line x1={(v.t / dur) * 1000} x2={(v.t / dur) * 1000} y1="0" y2="64" className="head" vectorEffect="non-scaling-stroke" /></svg>
            <input type="range" min="0" max={dur} step="100" value={v.t} aria-label="Trip position"
              onChange={(e) => { const r = R.current; r.t = +e.target.value; r.parts = []; r.prev = lerpAt(s1, t0 + r.t, 20000).speed_kmh; }} />
          </div>
        </div>
      </>}
    </section>
  );
}