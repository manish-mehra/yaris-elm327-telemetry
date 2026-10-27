export const clock = (s) => {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};
export const num = (v, d = 1) =>
  v == null || isNaN(v) || !isFinite(v) ? "–" : Number(v).toFixed(d);
export const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export const hhmm = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
