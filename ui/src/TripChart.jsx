import { useEffect, useRef } from "react";
import Chart from "chart.js/auto";
import { clock, num } from "./utils.js";

// Hovering one chart draws a vertical line on all of them.
const charts = new Set();
let hoverX = null;

const crosshair = {
  id: "crosshair",
  afterDatasetsDraw(c) {
    if (hoverX == null) return;
    const px = c.scales.x.getPixelForValue(hoverX);
    const { left, right, top, bottom } = c.chartArea;
    if (px < left || px > right) return;
    const g = c.ctx;
    g.save();
    g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted");
    g.setLineDash([4, 4]);
    g.beginPath(); g.moveTo(px, top); g.lineTo(px, bottom); g.stroke();
    g.restore();
  },
  afterEvent(c, { event }) {
    if (event.type === "mousemove") hoverX = c.scales.x.getValueForPixel(event.x);
    else if (event.type === "mouseout") hoverX = null;
    else return;
    charts.forEach((o) => o !== c && o.draw());
  },
};

export default function TripChart({ spec, t0, s1, s30, xr, dark }) {
  const canvas = useRef();
  const chart = useRef();

  // Rebuild when trip, data or theme changes.
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const text = css.getPropertyValue("--muted").trim();
    const grid = css.getPropertyValue("--line").trim();

    const datasets = spec.series.map((s) => ({
      label: s.label,
      yAxisID: s.axis || "y",
      borderColor: s.color,
      backgroundColor: s.color,
      borderWidth: 1.6,
      pointRadius: s.dots ? 3 : 0,
      tension: s.step ? 0 : 0.2,
      stepped: s.step ? "before" : false,
      data: (s.src === 30 ? s30 : s1)
        .filter((r) => r[s.key] != null)
        .map((r) => ({ x: (r.ts - t0) / 1000, y: r[s.key] })),
    }));

    const scales = {
      x: { type: "linear", min: xr[0], max: xr[1], grid: { color: grid },
           ticks: { color: text, maxTicksLimit: 8, callback: clock } },
    };
    spec.axes.forEach((a, i) => {
      scales[a.id] = {
        position: i ? "right" : "left", min: a.min, max: a.max,
        title: { display: true, text: a.title, color: text },
        ticks: { color: text },
        grid: { color: grid, drawOnChartArea: !i },
      };
    });

    const c = new Chart(canvas.current, {
      type: "line",
      data: { datasets },
      plugins: [crosshair],
      options: {
        parsing: false, animation: false, responsive: true, maintainAspectRatio: false,
        interaction: { mode: "nearest", axis: "x", intersect: false },
        plugins: {
          legend: { labels: { color: text, boxWidth: 12, boxHeight: 3 } },
          tooltip: { callbacks: {
            title: (i) => clock(i[0].parsed.x),
            label: (i) => " " + i.dataset.label + ": " + num(i.parsed.y, 2),
          } },
        },
        scales,
      },
    });
    chart.current = c;
    charts.add(c);
    return () => { charts.delete(c); c.destroy(); };
  }, [spec, t0, s1, s30, dark]);

  // Cheap update when only the time window moves.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.options.scales.x.min = xr[0];
    c.options.scales.x.max = xr[1];
    c.update("none");
  }, [xr]);

  return (
    <div className="card">
      <h3>{spec.t}<span>{spec.u}</span></h3>
      <div className="plot"><canvas ref={canvas} /></div>
    </div>
  );
}