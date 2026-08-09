// Bakes the explore datasets from an OpenWeatherMap history CSV.
//   node scripts/build-wedding-data.mjs [input.csv] [output-prefix]
//   node scripts/build-wedding-data.mjs                       # NYC (defaults)
//   node scripts/build-wedding-data.mjs jupiter_weather.csv js/jupiter
//
// Output: <prefix>-temps.js, <prefix>-feels.js, <prefix>-precip.js, each
//   { meta:{y0,y1}, data: { "MM-DD": [ /*24 hours*/ [ /*value per year, null*/ ] ] } }
// Keyed by LOCAL month/day/hour (daylight & "the temp at 5pm" are local), using
// the per-row `timezone` offset so DST is handled. Duplicate rows per timestamp
// (multiple weather descriptions) are collapsed to one reading. The year range
// is detected from the data. The globals are always WEDDING_* so the same
// wedding.js drives any city's page.
import fs from "fs";
import readline from "readline";

const inputCsv = process.argv[2] || "nyc_weather.csv";
const prefix = process.argv[3] || "js/wedding";

const byDt = new Map(); // dt(unix) -> { temp, feels, rain, snow, off }

const rl = readline.createInterface({
  input: fs.createReadStream(inputCsv),
});
let first = true;
rl.on("line", (l) => {
  if (first) {
    first = false;
    return;
  }
  const c = l.split(",");
  const dt = +c[0],
    off = +c[2],
    temp = parseFloat(c[6]),
    feels = parseFloat(c[9]);
  const rain = parseFloat(c[19]) || 0,
    snow = parseFloat(c[21]) || 0;
  if (!Number.isFinite(temp)) return;
  const cur = byDt.get(dt);
  if (!cur) byDt.set(dt, { temp, feels, rain, snow, off });
  else {
    cur.rain = Math.max(cur.rain, rain);
    cur.snow = Math.max(cur.snow, snow);
  }
});
rl.on("close", () => {
  const local = (dt, off) => new Date((dt + off) * 1000); // read fields as UTC

  // Detect the local-time year range, ignoring boundary stubs: shifting UTC to
  // local pulls a few hours into the prior/next year, which would otherwise add
  // a near-empty year to the dropdown. Keep years with real coverage.
  const yearCount = new Map();
  for (const [dt, v] of byDt.entries()) {
    const y = local(dt, v.off).getUTCFullYear();
    yearCount.set(y, (yearCount.get(y) || 0) + 1);
  }
  const years = [...yearCount.keys()]
    .filter((y) => yearCount.get(y) >= 100)
    .sort((a, b) => a - b);
  const Y0 = years[0],
    Y1 = years[years.length - 1],
    NY = Y1 - Y0 + 1;

  const temps = {},
    feels = {},
    precip = {};
  const ensure = (o, k) => {
    if (!o[k]) {
      o[k] = [];
      for (let h = 0; h < 24; h++) o[k][h] = new Array(NY).fill(null);
    }
    return o[k];
  };
  for (const [dt, v] of byDt.entries()) {
    const d = local(dt, v.off);
    const y = d.getUTCFullYear();
    if (y < Y0 || y > Y1) continue; // skip boundary stubs
    const key = `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate(),
    ).padStart(2, "0")}`;
    const h = d.getUTCHours();
    const yi = y - Y0;
    ensure(temps, key)[h][yi] = Math.round(v.temp * 10) / 10;
    if (Number.isFinite(v.feels))
      ensure(feels, key)[h][yi] = Math.round(v.feels * 10) / 10;
    ensure(precip, key)[h][yi] = Math.round((v.rain + v.snow) * 100) / 100;
  }
  const meta = { y0: Y0, y1: Y1 };
  const write = (name, varName, data) =>
    fs.writeFileSync(
      `${prefix}-${name}.js`,
      `const ${varName} = ` + JSON.stringify({ meta, data }) + ";\n",
    );
  write("temps", "WEDDING_TEMPS", temps);
  write("feels", "WEDDING_FEELS", feels);
  write("precip", "WEDDING_PRECIP", precip);

  // Report global extremes (useful for sanity checks / axis bounds).
  const ext = (o) => {
    let lo = Infinity,
      hi = -Infinity;
    for (const k in o)
      for (const hr of o[k])
        for (const v of hr)
          if (v !== null) {
            if (v < lo) lo = v;
            if (v > hi) hi = v;
          }
    return [lo, hi];
  };
  console.log(`wrote ${prefix}-{temps,feels,precip}.js  years ${Y0}-${Y1}`);
  console.log("temp extremes  ", ext(temps));
  console.log("feels extremes ", ext(feels));
  console.log("precip extremes", ext(precip));
});
