// 12seasons.nyc — wedding planner
// One big plot: per-hour distribution (box/whisker) of a weather metric for a
// chosen NYC calendar day, with a daylight/golden-hour background. Click an
// hour for its full histogram. Tabs switch the metric.

// Times Square-ish, matching the main page.
const LAT = 40.7128;
const LON = -73.985;

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

  const options = {
    series: [{ type: cfg.kind === "box" ? "boxPlot" : "bar", name: cfg.label, data }],
    chart: {
      type: cfg.kind === "box" ? "boxPlot" : "bar",
      height: 460,
      fontFamily: "inherit",
      toolbar: { show: false },
      animations: { enabled: false },
      events: {
        dataPointSelection: (e, ctx, c) => renderYearBars(c.dataPointIndex),
        click: (e, ctx, c) => {
          if (c && c.dataPointIndex >= 0) renderYearBars(c.dataPointIndex);
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
    tooltip: { shared: false, x: { format: "h TT" } },
  };

  if (chart) chart.destroy();
  chart = new ApexCharts(document.getElementById("chart"), options);
  chart.render();
  renderHeader();
}

// ---------- click an hour -> modal with one bar per year ----------

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

function renderYearBars(hourIndex) {
  const cfg = METRICS[mode];
  const { m, d, key } = selectedMMDD();
  const day = cfg.data().data[key];
  if (!day) return;
  const y0 = WEDDING_TEMPS.meta.y0;
  const { i0, i1 } = yearsInRange();
  const years = [],
    vals = [];
  for (let yi = i0; yi <= i1; yi++) {
    const v = day[hourIndex][yi];
    if (v === null || v === undefined) continue;
    years.push(y0 + yi);
    vals.push(v);
  }
  if (!vals.length) return;

  const unit = cfg.histUnit || cfg.unit;
  document.getElementById("modal-title").textContent =
    `${cfg.label} at ${formatHour(hourIndex)} · ${MONTHS[m - 1]} ${ordinal(d)}`;

  const options = {
    series: [{ name: cfg.label, data: vals }],
    chart: {
      type: "bar",
      height: 340,
      fontFamily: "inherit",
      toolbar: { show: false },
      animations: { enabled: false },
    },
    plotOptions: { bar: { columnWidth: "80%", borderRadius: 1 } },
    colors: ["#3b6ea5"],
    dataLabels: { enabled: false },
    xaxis: {
      categories: years,
      tickAmount: Math.min(11, years.length - 1),
      labels: { rotate: -45, style: { colors: "#777", fontSize: "10px" } },
    },
    yaxis: {
      labels: {
        formatter: (v) => Math.round(v) + unit,
        style: { colors: "#777" },
      },
    },
    grid: { borderColor: "#eee", strokeDashArray: 3 },
    tooltip: { y: { formatter: (v) => v + unit } },
  };

  if (modalChart) modalChart.destroy();
  modalChart = new ApexCharts(document.getElementById("modal-chart"), options);
  modalChart.render();
  openModal();
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
  document.title = `New York on ${md}`;

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
  document.querySelectorAll(".tabs a").forEach((a) => {
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
  document.querySelectorAll(".tabs a").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      setMode(a.dataset.mode);
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

  // Re-render only when crossing the phone/desktop breakpoint.
  let wasNarrow = window.innerWidth <= 600;
  window.addEventListener("resize", () => {
    const now = window.innerWidth <= 600;
    if (now !== wasNarrow) {
      wasNarrow = now;
      renderMain();
    }
  });

  renderMain();
}

window.addEventListener("load", init);
