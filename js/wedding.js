// 12seasons.nyc — wedding planner
// One big plot: per-hour distribution (box/whisker) of a weather metric for a
// chosen NYC calendar day, with a daylight/golden-hour background. Click an
// hour for its full histogram. Tabs switch the metric.

// A page may set window.PLACE before loading this script to point the daylight
// math and the header at another city. Defaults to NYC (Times Square-ish).
const PLACE = (typeof window !== "undefined" && window.PLACE) || {
  name: "New York",
  lat: 40.7128,
  lon: -73.985,
};
const LAT = PLACE.lat;
const LON = PLACE.lon;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const METRICS = {
  temp: { label: "Temperature", kind: "box", unit: "°", data: () => WEDDING_TEMPS },
  feels: { label: "Feels Like", kind: "box", unit: "°", data: () => WEDDING_FEELS },
  precip: {
    label: "Precipitation",
    kind: "bar", // % of years with any precip, per hour
    unit: "%",
    histUnit: " mm", // click-through histogram is of rainfall amounts
    data: () => WEDDING_PRECIP,
  },
};

// The box metrics that share a y-axis, so Temperature and Feels Like for the
// same day plot on the same scale and can be compared tab-to-tab.
const BOX_METRICS = ["temp", "feels"];

// Snap axis bounds to multiples of `step` so the scale only moves in coarse
// jumps between dates (comparable) while each plot still fills the space.
function niceBounds(lo, hi, step, zeroBase) {
  let min = zeroBase ? 0 : Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  if (max <= min) max = min + step;
  return { min, max, tickAmount: Math.round((max - min) / step) };
}

// Shared 10°-snapped bounds spanning every box metric for the given day.
function sharedBoxBounds(key) {
  let lo = Infinity,
    hi = -Infinity;
  for (const k of BOX_METRICS) {
    for (let h = 0; h < 24; h++) {
      const vals = cellValues(METRICS[k].data(), key, h);
      if (!vals.length) continue;
      const s = [...vals].sort((a, b) => a - b);
      lo = Math.min(lo, s[0]);
      hi = Math.max(hi, s[s.length - 1]);
    }
  }
  return niceBounds(lo, hi, 10, false);
}

let mode = "temp";
let chart = null;
let modalChart = null;
let modalHour = 0; // hour whose modal is open
let modalTab = "dist"; // "dist" (distribution) | "years" (history)

// ---------- data helpers ----------

function yearsInRange() {
  const y0 = WEDDING_TEMPS.meta.y0;
  let a = +document.getElementById("yearStart").value;
  let b = +document.getElementById("yearEnd").value;
  if (a > b) [a, b] = [b, a];
  return { i0: a - y0, i1: b - y0 };
}

function cellValues(dataset, mmdd, hour) {
  const day = dataset.data[mmdd];
  if (!day) return [];
  const { i0, i1 } = yearsInRange();
  return day[hour].slice(i0, i1 + 1).filter((v) => v !== null);
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx),
    hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function fiveNumber(values) {
  const s = [...values].sort((a, b) => a - b);
  return [
    s[0],
    quantile(s, 0.25),
    quantile(s, 0.5),
    quantile(s, 0.75),
    s[s.length - 1],
  ].map((v) => Math.round(v * 10) / 10);
}

function selectedMMDD() {
  const m = +document.getElementById("month").value;
  const d = +document.getElementById("day").value;
  return { m, d, key: `${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

function hourTs(m, d, hour) {
  return Date.UTC(refYear(m, d), m - 1, d, hour);
}

// ---------- solar position (NOAA) -> daylight background bands ----------

// Cosmetic scaffold: 24 boxes plotted at whole hours of one reference day,
// read in UTC so labels equal NYC wall-clock hours. Feb 29 needs a leap year.
function refYear(m, d) {
  return m === 2 && d === 29 ? 2024 : 2025;
}

function isDST(y, m, d) {
  // US rule: 2nd Sunday of March .. 1st Sunday of November.
  const nthSunday = (month, n) => {
    const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + (n - 1) * 7;
  };
  const after = (am, ad) => m > am || (m === am && d >= ad);
  const before = (bm, bd) => m < bm || (m === bm && d < bd);
  return after(3, nthSunday(3, 2)) && before(11, nthSunday(11, 1));
}

function dayOfYear(y, m, d) {
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
}

// Sun elevation (degrees) at a given NYC local hour on the selected date.
function sunElevation(m, d, localHour) {
  const y = refYear(m, d);
  const tz = isDST(y, m, d) ? -4 : -5;
  const doy = dayOfYear(y, m, d);
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (localHour - 12) / 24);
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const tst = localHour * 60 + (eqtime + 4 * LON - 60 * tz);
  const ha = ((tst / 4 - 180) * Math.PI) / 180;
  const lat = (LAT * Math.PI) / 180;
  const cosZen =
    Math.sin(lat) * Math.sin(decl) +
    Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  return 90 - (Math.acos(Math.max(-1, Math.min(1, cosZen))) * 180) / Math.PI;
}

function skyBand(elev) {
  if (elev >= 6) return "day";
  if (elev >= -4) return "golden";
  return "night";
}

const BAND_STYLE = {
  day: { fillColor: "#fff7d6", opacity: 0.35 },
  golden: { fillColor: "#f6a821", opacity: 0.28 },
  night: { fillColor: "#20304f", opacity: 0.16 },
};

// Walk the day minute-by-minute, merge equal bands into shaded x-axis regions.
function daylightAnnotations(m, d) {
  const segs = [];
  let cur = null;
  for (let t = 0; t <= 24 + 1e-9; t += 1 / 60) {
    const band = skyBand(sunElevation(m, d, Math.min(24, t)));
    if (!cur || cur.band !== band) {
      if (cur) cur.end = Math.min(24, t);
      cur = { band, start: Math.min(24, t), end: Math.min(24, t) };
      segs.push(cur);
    } else cur.end = Math.min(24, t);
  }
  const base = Date.UTC(refYear(m, d), m - 1, d);
  return segs.map((s) => ({
    x: base + s.start * 3600000,
    x2: base + s.end * 3600000,
    fillColor: BAND_STYLE[s.band].fillColor,
    opacity: BAND_STYLE[s.band].opacity,
    borderWidth: 0,
  }));
}

// ---------- main chart ----------

function renderMain() {
  const cfg = METRICS[mode];
  const { m, d, key } = selectedMMDD();
  const data = [];
  let hi = 0; // only the precip bar needs a data-driven max

  for (let h = 0; h < 24; h++) {
    const vals = cellValues(cfg.data(), key, h);
    const ts = hourTs(m, d, h);
    if (cfg.kind === "box") {
      if (!vals.length) continue;
      data.push({ x: ts, y: fiveNumber(vals) });
    } else {
      const pct = vals.length
        ? (100 * vals.filter((v) => v > 0).length) / vals.length
        : 0;
      data.push({ x: ts, y: Math.round(pct) });
      hi = Math.max(hi, pct);
    }
  }

  // Box metrics share one scale per day (see sharedBoxBounds); precip % is a
  // zero-based bar snapped to 10 points.
  const yb =
    cfg.kind === "box" ? sharedBoxBounds(key) : niceBounds(0, hi, 10, true);

  // On phones, run the plot to the edges: fewer ticks, smaller labels, and
  // almost no internal gutter. Desktop keeps its roomier defaults.
  const narrow = window.innerWidth <= 600;

  // Size the header first, then give ApexCharts an exact pixel height so the
  // phone layout fills the viewport with no scrolling. We derive the height
  // from the *other* sections (header/tabs/controls) rather than from #chart
  // itself: ApexCharts stamps a min-height on #chart, so measuring it would
  // feed back on the flex layout. The siblings are stable.
  renderHeader();
  const chartEl = document.getElementById("chart");
  let chartH = 460;
  if (narrow) {
    const container = chartEl.parentElement;
    const cs = getComputedStyle(container);
    let used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    for (const el of container.children) {
      const s = getComputedStyle(el);
      used += parseFloat(s.marginTop) + parseFloat(s.marginBottom);
      if (el !== chartEl) used += el.getBoundingClientRect().height;
    }
    chartH = Math.max(220, Math.floor(container.clientHeight - used - 2));
  }

  const options = {
    series: [{ type: cfg.kind === "box" ? "boxPlot" : "bar", name: cfg.label, data }],
    chart: {
      type: cfg.kind === "box" ? "boxPlot" : "bar",
      height: chartH,
      fontFamily: "inherit",
      toolbar: { show: false },
      animations: { enabled: false },
      events: {
        dataPointSelection: (e, ctx, c) => openHourModal(c.dataPointIndex),
        click: (e, ctx, c) => {
          if (c && c.dataPointIndex >= 0) openHourModal(c.dataPointIndex);
        },
      },
    },
    plotOptions: {
      boxPlot: { colors: { upper: "#c9e3d2", lower: "#e3ecc9" } },
      bar: { columnWidth: "65%", borderRadius: 2 },
    },
    colors: ["#3b6ea5"],
    stroke: { width: 1, colors: ["#2b4a63"] },
    dataLabels: { enabled: false },
    xaxis: {
      type: "datetime",
      min: hourTs(m, d, 0),
      max: hourTs(m, d, 0) + 24 * 3600000,
      tickAmount: narrow ? 6 : 12, // every 4h on phones, every 2h otherwise
      labels: {
        datetimeUTC: true,
        format: "h TT",
        rotate: 0,
        hideOverlappingLabels: true,
        style: { colors: "#555", ...(narrow ? { fontSize: "10px" } : {}) },
      },
      tooltip: { enabled: false },
    },
    yaxis: {
      min: yb.min,
      max: yb.max,
      tickAmount: yb.tickAmount,
      forceNiceScale: false,
      labels: {
        formatter: (v) => Math.round(v) + cfg.unit,
        style: { colors: "#555", ...(narrow ? { fontSize: "10px" } : {}) },
      },
    },
    grid: {
      borderColor: "#eee",
      strokeDashArray: 3,
      ...(narrow ? { padding: { left: 0, right: 2, top: 0, bottom: 0 } } : {}),
    },
    annotations: { xaxis: daylightAnnotations(m, d) },
    tooltip:
      cfg.kind === "box"
        ? {
            shared: false,
            // Tukey box tooltip, with Q1/Q3 spelled out as percentiles.
            custom: ({ seriesIndex, dataPointIndex, w }) => {
              const pt = w.config.series[seriesIndex].data[dataPointIndex];
              const y = pt.y;
              const u = cfg.unit;
              const row = (l, v) =>
                `<div style="display:flex;justify-content:space-between;gap:1.25rem;padding:1px 0;">` +
                `<span style="color:#888;">${l}</span>` +
                `<span style="font-weight:600;">${Math.round(v)}${u}</span></div>`;
              return (
                `<div style="padding:6px 10px;font-size:12px;line-height:1.35;">` +
                `<div style="font-weight:600;margin-bottom:2px;">${formatHour(new Date(pt.x).getUTCHours())}</div>` +
                row("Maximum", y[4]) +
                row("75th pct", y[3]) +
                row("Median", y[2]) +
                row("25th pct", y[1]) +
                row("Minimum", y[0]) +
                `</div>`
              );
            },
          }
        : { shared: false, x: { format: "h TT" } },
  };

  if (chart) chart.destroy();
  chart = new ApexCharts(chartEl, options);
  chart.render();
  // ApexCharts stamps an inline min-height that inflates the flex item; clear
  // it so #chart keeps exactly the height the layout allotted (no overflow).
  if (narrow) chartEl.style.minHeight = "0px";
}

// ---------- click an hour -> modal (Distribution / History tabs) ----------

function formatHour(h) {
  const ap = h < 12 ? "AM" : "PM";
  const hr = h % 12 || 12;
  return `${hr} ${ap}`;
}

function openModal() {
  document.documentElement.classList.add("modal-is-open");
  document.getElementById("hour-modal").setAttribute("open", "");
}

function closeModal() {
  document.documentElement.classList.remove("modal-is-open");
  document.getElementById("hour-modal").removeAttribute("open");
  if (modalChart) {
    modalChart.destroy();
    modalChart = null;
  }
}

// Values for the open hour, in the selected year range (precip: wet hours only).
function modalValues() {
  const values = cellValues(METRICS[mode].data(), selectedMMDD().key, modalHour);
  return mode === "precip" ? values.filter((v) => v > 0) : values;
}

function openHourModal(hourIndex) {
  modalHour = hourIndex;
  modalTab = "dist";
  setModalTab("dist");
  openModal();
}

function setModalTab(tab) {
  modalTab = tab;
  document.querySelectorAll(".modal-tabs a").forEach((a) => {
    const on = a.dataset.mtab === tab;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const { m, d } = selectedMMDD();
  document.getElementById("modal-title").textContent =
    `${METRICS[mode].label} at ${formatHour(modalHour)} · ${MONTHS[m - 1]} ${ordinal(d)}`;
  if (tab === "dist") renderDistribution();
  else renderHistory();
}

// Gaussian kernel density estimate -> smooth points for a spline area.
function normPdf(z) {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

function kde(values) {
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const h = std > 0 ? 1.06 * std * Math.pow(n, -0.2) : 1; // Silverman's rule
  const lo = Math.min(...values),
    hi = Math.max(...values);
  const pad = Math.max(2 * h, (hi - lo) * 0.05);
  const start = lo - pad,
    end = hi + pad,
    steps = 96;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const x = start + ((end - start) * i) / steps;
    let s = 0;
    for (const xi of values) s += normPdf((x - xi) / h);
    pts.push({ x: Math.round(x * 10) / 10, y: s / (n * h) });
  }
  return { pts, mean, std };
}

// Histogram of the raw sample: {x: bin center, y: count of years}.
function histogramCounts(values, binCount) {
  const lo = Math.min(...values),
    hi = Math.max(...values);
  const width = (hi - lo) / binCount || 1;
  const bins = new Array(binCount).fill(0);
  for (const v of values) {
    let i = Math.floor((v - lo) / width);
    if (i >= binCount) i = binCount - 1;
    bins[i]++;
  }
  return bins.map((c, i) => ({
    x: Math.round((lo + (i + 0.5) * width) * 10) / 10,
    y: c,
  }));
}

function vLine(x, label = "", opts = {}) {
  return {
    x,
    strokeDashArray: opts.solid ? 0 : 4,
    borderColor: opts.solid ? "#2b4a63" : opts.faint ? "#c2ced9" : "#9fb3c8",
    borderWidth: opts.solid ? 1.5 : 1,
    label: {
      text: label,
      orientation: "horizontal",
      position: "top",
      offsetY: opts.offsetY || 0, // stagger to avoid label collisions
      borderWidth: 0,
      style: { background: "transparent", color: "#888", fontSize: "10px" },
    },
  };
}

function renderDistribution() {
  const cfg = METRICS[mode];
  const unit = cfg.histUnit || cfg.unit;
  const summaryEl = document.getElementById("modal-summary");
  const values = modalValues();
  if (values.length < 5) {
    if (modalChart) modalChart.destroy(), (modalChart = null);
    document.getElementById("modal-chart").innerHTML = "";
    summaryEl.textContent = "Not enough data — widen the year range.";
    return;
  }

  const { pts } = kde(values);
  const bars = histogramCounts(values, 12);
  const s = [...values].sort((a, b) => a - b);
  const r = Math.round;
  const p10 = r(quantile(s, 0.1)),
    p25 = r(quantile(s, 0.25)),
    p50 = r(quantile(s, 0.5)),
    p75 = r(quantile(s, 0.75)),
    p90 = r(quantile(s, 0.9));
  const narrow = window.innerWidth <= 600;

  const options = {
    // Faded sample histogram (counts) behind the smooth KDE area.
    series: [
      { name: "Years", type: "column", data: bars },
      { name: "density", type: "area", data: pts },
    ],
    chart: {
      type: "line",
      height: 320,
      fontFamily: "inherit",
      toolbar: { show: false },
      animations: { enabled: false },
    },
    stroke: { curve: "smooth", width: [0, 2] },
    fill: {
      type: ["solid", "gradient"],
      opacity: [0.3, 0.3],
      gradient: { opacityFrom: 0.4, opacityTo: 0.05 },
    },
    colors: ["#9fb3c8", "#3b6ea5"],
    plotOptions: { bar: { columnWidth: "95%" } },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      type: "numeric",
      min: pts[0].x,
      max: pts[pts.length - 1].x,
      tickAmount: narrow ? 5 : 6,
      labels: {
        formatter: (v) => Math.round(v) + unit,
        style: { colors: "#777", ...(narrow ? { fontSize: "10px" } : {}) },
      },
      tooltip: { enabled: false },
    },
    yaxis: [
      {
        seriesName: "Years",
        min: 0,
        tickAmount: 4,
        forceNiceScale: true,
        labels: {
          formatter: (v) => Math.round(v),
          style: { colors: "#bbb", ...(narrow ? { fontSize: "10px" } : {}) },
        },
      },
      { seriesName: "density", show: false, min: 0 },
    ],
    grid: {
      borderColor: "#eee",
      strokeDashArray: 3,
      // Headroom at the top so the raised percentile labels don't clip.
      padding: narrow ? { left: 0, right: 2, top: 12 } : { top: 12 },
    },
    annotations: {
      xaxis: [
        vLine(p10, "10th", { faint: true, offsetY: -8 }),
        vLine(p25), // 25th line, unlabeled
        vLine(p50, "median", { solid: true, offsetY: -8 }),
        vLine(p75), // 75th line, unlabeled
        vLine(p90, "90th", { faint: true, offsetY: -8 }),
      ],
    },
    tooltip: { enabled: false },
  };

  if (modalChart) modalChart.destroy();
  modalChart = new ApexCharts(document.getElementById("modal-chart"), options);
  modalChart.render();

  summaryEl.textContent =
    `50% of the time it's ${p25}–${p75}${unit}, ` +
    `and 80% of the time it's ${p10}–${p90}${unit}.`;
}

function renderHistory() {
  const cfg = METRICS[mode];
  const day = cfg.data().data[selectedMMDD().key];
  const unit = cfg.histUnit || cfg.unit;
  const summaryEl = document.getElementById("modal-summary");
  if (!day) {
    summaryEl.textContent = "";
    return;
  }
  const y0 = WEDDING_TEMPS.meta.y0;
  const { i0, i1 } = yearsInRange();
  const years = [],
    vals = [];
  for (let yi = i0; yi <= i1; yi++) {
    const v = day[modalHour][yi];
    if (v === null || v === undefined) continue;
    years.push(y0 + yi);
    vals.push(v);
  }

  // Record extremes for this hour on this date.
  const hourStr = formatHour(modalHour);
  if (!vals.length) {
    summaryEl.textContent = "";
  } else {
    let lo = 0,
      hi = 0;
    vals.forEach((v, i) => {
      if (v < vals[lo]) lo = i;
      if (v > vals[hi]) hi = i;
    });
    if (mode === "precip") {
      summaryEl.textContent =
        vals[hi] > 0
          ? `The wettest ${hourStr} on record was ${years[hi]} (${vals[hi]} mm).`
          : `No measurable rain at ${hourStr} on this date on record.`;
    } else {
      summaryEl.textContent =
        `The coldest ${hourStr} on record was ${years[lo]} at ${Math.round(vals[lo])}°, ` +
        `and the hottest was ${years[hi]} at ${Math.round(vals[hi])}°.`;
    }
  }

  const narrow = window.innerWidth <= 600;
  const options = {
    series: [{ name: cfg.label, data: vals }],
    chart: {
      type: "bar",
      height: 320,
      fontFamily: "inherit",
      toolbar: { show: false },
      animations: { enabled: false },
    },
    plotOptions: { bar: { columnWidth: "80%", borderRadius: 1 } },
    colors: ["#3b6ea5"],
    dataLabels: { enabled: false },
    xaxis: {
      categories: years,
      tickAmount: narrow ? 6 : Math.min(11, years.length - 1),
      labels: { rotate: -45, style: { colors: "#777", fontSize: "10px" } },
    },
    yaxis: {
      labels: {
        formatter: (v) => Math.round(v) + unit,
        style: { colors: "#777", ...(narrow ? { fontSize: "10px" } : {}) },
      },
    },
    grid: {
      borderColor: "#eee",
      strokeDashArray: 3,
      ...(narrow ? { padding: { left: 0, right: 2 } } : {}),
    },
    tooltip: { y: { formatter: (v) => v + unit } },
  };

  if (modalChart) modalChart.destroy();
  modalChart = new ApexCharts(document.getElementById("modal-chart"), options);
  modalChart.render();
}

// ---------- header + explainer ----------

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Interquartile actual-temperature range (°F) pooled across an hour span.
function pooledIQR(key, hStart, hEnd) {
  const day = WEDDING_TEMPS.data[key];
  if (!day) return null;
  const { i0, i1 } = yearsInRange();
  const arr = [];
  for (let h = hStart; h <= hEnd; h++)
    for (let yi = i0; yi <= i1; yi++) {
      const v = day[h][yi];
      if (v !== null) arr.push(v);
    }
  if (arr.length < 4) return null;
  arr.sort((a, b) => a - b);
  return [Math.round(quantile(arr, 0.25)), Math.round(quantile(arr, 0.75))];
}

// Average hourly chance of precip during the day/evening (9 AM–11 PM): the
// mean, over those hours, of the share of years that hour was wet. This reads
// like a weather-app "chance of rain" -- unlike the probability of *any* wet
// hour across the whole window, which compounds to ~30% for nearly every day.
function dayRainChance(key) {
  const day = WEDDING_PRECIP.data[key];
  if (!day) return null;
  let sum = 0,
    hours = 0;
  for (let h = 9; h <= 23; h++) {
    const vals = cellValues(WEDDING_PRECIP, key, h);
    if (!vals.length) continue;
    sum += vals.filter((v) => v > 0).length / vals.length;
    hours++;
  }
  return hours ? Math.round((100 * sum) / hours) : null;
}

const range = (r) => `${r[0]}–${r[1]}°`;

function renderHeader() {
  const { m, d, key } = selectedMMDD();
  const md = `${MONTHS[m - 1]} ${ordinal(d)}`;
  document.getElementById("title-date").textContent = md;
  document.title = `${PLACE.name} on ${md}`;

  const day = pooledIQR(key, 9, 17); // 9 AM – 5 PM
  const eve = pooledIQR(key, 18, 23); // 6 PM – 11 PM
  const rain = dayRainChance(key);
  const parts = [];
  if (day) parts.push(`${range(day)} during the day`);
  if (eve) parts.push(`${range(eve)} in the evening`);
  let s = parts.length ? `Typically ${parts.join(" and ")}` : "Typically";
  if (rain !== null) s += `, with a ${rain}% chance of rain`;
  document.getElementById("explainer").textContent = s + ".";
}

// ---------- controls ----------

function daysInMonth(m) {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

function fillOptions(sel, values, labels) {
  sel.innerHTML = values
    .map((v, i) => `<option value="${v}">${labels ? labels[i] : v}</option>`)
    .join("");
}

function syncDays() {
  const m = +document.getElementById("month").value;
  const sel = document.getElementById("day");
  const prev = +sel.value || 1;
  const n = daysInMonth(m);
  fillOptions(sel, Array.from({ length: n }, (_, i) => i + 1));
  sel.value = Math.min(prev, n);
}

// ---------- URL params (?month=4&day=10) ----------

function readParams() {
  const q = new URLSearchParams(location.search);
  const m = parseInt(q.get("month"), 10);
  const d = parseInt(q.get("day"), 10);
  if (m >= 1 && m <= 12) document.getElementById("month").value = m;
  syncDays();
  if (d >= 1 && d <= daysInMonth(+document.getElementById("month").value))
    document.getElementById("day").value = d;
}

function writeParams() {
  const { m, d } = selectedMMDD();
  history.replaceState(null, "", `?month=${m}&day=${d}`);
}

function setMode(next) {
  mode = next;
  document.querySelectorAll(".tabs:not(.modal-tabs) a").forEach((a) => {
    const on = a.dataset.mode === mode;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  renderMain();
}

function init() {
  fillOptions(
    document.getElementById("month"),
    MONTHS.map((_, i) => i + 1),
    MONTHS,
  );
  const { y0, y1 } = WEDDING_TEMPS.meta;
  const years = Array.from({ length: y1 - y0 + 1 }, (_, i) => y0 + i);
  fillOptions(document.getElementById("yearStart"), years);
  fillOptions(document.getElementById("yearEnd"), years);
  document.getElementById("month").value = 6;
  document.getElementById("yearStart").value = y0;
  document.getElementById("yearEnd").value = y1;
  syncDays();
  document.getElementById("day").value = 15;
  readParams(); // ?month=&day= overrides the defaults

  const onChange = () => {
    renderMain();
    writeParams();
  };
  document.getElementById("month").addEventListener("change", () => {
    syncDays();
    onChange();
  });
  ["day", "yearStart", "yearEnd"].forEach((id) =>
    document.getElementById(id).addEventListener("change", onChange),
  );
  document.querySelectorAll(".tabs:not(.modal-tabs) a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      setMode(a.dataset.mode);
    }),
  );

  document.querySelectorAll(".modal-tabs a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      setModalTab(a.dataset.mtab);
    }),
  );
  document.getElementById("modal-close").addEventListener("click", (e) => {
    e.preventDefault();
    closeModal();
  });
  document.getElementById("hour-modal").addEventListener("click", (e) => {
    if (e.target.id === "hour-modal") closeModal(); // click backdrop
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Re-fit on resize: breakpoint change, rotation, or the mobile browser
  // toolbar showing/hiding (which changes the available height).
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderMain, 150);
  });

  renderMain();
}

window.addEventListener("load", init);
