import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { clock, num, hhmm } from "./utils.js";

/* Shared crosshair: hovering one chart draws a vertical line on all of them. */
const registry = new Set();
const hover = { x: null };

const crosshair = {
  id: "xh",
  afterDatasetsDraw(c) {
    if (hover.x == null) return;
    const px = c.scales.x.getPixelForValue(hover.x), a = c.chartArea;
    if (px < a.left || px > a.right) return;
    const g = c.ctx;
    g.save();
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted");
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(px, a.top); g.lineTo(px, a.bottom); g.stroke();
    g.restore();
  },
  afterEvent(c, args) {
    const e = args.event;
    if (e.type === "mousemove") hover.x = c.scales.x.getValueForPixel(e.x);
    else if (e.type === "mouseout") hover.x = null;
    else return;
    registry.forEach((o) => { if (o !== c) o.draw(); });
  },
};

export default function TripChart({ spec, t0, s1, s30, xr, dark }) {
  const cv = useRef(), ch = useRef(), xrRef = useRef(xr);
  xrRef.current = xr;

  // (Re)build the chart when the trip, data or theme changes.
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const txt = css.getPropertyValue("--muted").trim();
    const grid = css.getPropertyValue("--grid").trim();

    const datasets = spec.series.map((s) => ({
      label: s.label, yAxisID: s.axis || "y",
      borderColor: s.color, backgroundColor: s.color, borderWidth: 1.6,
      pointRadius: s.dots ? 3 : 0, pointHoverRadius: 4,
      tension: s.step ? 0 : 0.2, stepped: s.step ? "before" : false,
      data: (s.src === 30 ? s30 : s1).filter((r) => r[s.key] != null).map((r) => ({ x: (r.ts - t0) / 1000, y: r[s.key] })),
    }));

    const scales = {
      x: { type: "linear", min: xrRef.current[0], max: xrRef.current[1],
           ticks: { color: txt, callback: (v) => clock(v), maxTicksLimit: 8 }, grid: { color: grid } },
    };
    spec.axes.forEach((a, i) => {
      scales[a.id] = {
        position: i ? "right" : "left", min: a.min, max: a.max,
        title: { display: true, text: a.title, color: txt }, ticks: { color: txt },
        grid: { color: grid, drawOnChartArea: !i },
      };
    });

    const c = new Chart(cv.current, {
      type: "line", data: { datasets }, plugins: [crosshair],
      options: {
        parsing: false, animation: false, responsive: true, maintainAspectRatio: false,
        interaction: { mode: "nearest", axis: "x", intersect: false },
        plugins: {
          legend: { labels: { color: txt, boxWidth: 12, boxHeight: 3 } },
          tooltip: { callbacks: {
            title: (i) => "t = " + clock(i[0].parsed.x) + "  (" + hhmm(t0 + i[0].parsed.x * 1000) + ")",
            label: (i) => " " + i.dataset.label + ": " + num(i.parsed.y, 2),
          } },
        },
        scales,
      },
    });
    ch.current = c; registry.add(c);
    return () => { registry.delete(c); c.destroy(); ch.current = null; };
  }, [spec, t0, s1, s30, dark]);

  // Cheap update when only the time window changes.
  useEffect(() => {
    const c = ch.current;
    if (c) { c.options.scales.x.min = xr[0]; c.options.scales.x.max = xr[1]; c.update("none"); }
  }, [xr]);

  return (
    <div className="card">
      <h3>{spec.t}<span>{spec.u}</span></h3>
      <div className="cv"><canvas ref={cv} /></div>
    </div>
  );
}
