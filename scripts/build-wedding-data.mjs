// Bakes the wedding-planner datasets from nyc_weather.csv.
//   node scripts/build-wedding-data.mjs
//
// Output: js/wedding-temps.js, js/wedding-feels.js and js/wedding-precip.js, each
//   { meta:{y0,y1}, data: { "MM-DD": [ /*24 hours*/ [ /*value per year, null if missing*/ ] ] } }
// Keyed by NYC LOCAL month/day/hour (daylight & "the temp at 5pm" are local),
// using the per-row `timezone` offset so DST is handled. Duplicate rows per
// timestamp (multiple weather descriptions) are collapsed to one reading.
import fs from "fs";
import readline from "readline";

const Y0 = 1979,
  Y1 = 2022,
  NY = Y1 - Y0 + 1;

const byDt = new Map(); // dt(unix) -> { temp, feels, rain, snow, off }

const rl = readline.createInterface({
  input: fs.createReadStream("nyc_weather.csv"),
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
    const d = new Date((dt + v.off) * 1000); // shift to NYC local, read as UTC
    const y = d.getUTCFullYear();
    if (y < Y0 || y > Y1) continue;
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
  fs.writeFileSync(
    "js/wedding-temps.js",
    "const WEDDING_TEMPS = " + JSON.stringify({ meta, data: temps }) + ";\n",
  );
  fs.writeFileSync(
    "js/wedding-feels.js",
    "const WEDDING_FEELS = " + JSON.stringify({ meta, data: feels }) + ";\n",
  );
  fs.writeFileSync(
    "js/wedding-precip.js",
    "const WEDDING_PRECIP = " + JSON.stringify({ meta, data: precip }) + ";\n",
  );

  // Report global extremes so the page can pick fixed y-axis bounds.
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
  console.log("wrote temps/feels/precip.js");
  console.log("temp extremes  ", ext(temps));
  console.log("feels extremes ", ext(feels));
  console.log("precip extremes", ext(precip));
});
