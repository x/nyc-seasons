# Historical Weather Data

I ended up using [Open-Meteo](https://open-meteo.com/) for historical weather data. It's a great choice if you want a simple API or a CSV download — no account needed, no fuss. It uses ERA5 reanalysis data, a globally consistent "gap-filled" dataset from the European Centre for Medium-Range Weather Forecasts (ECMWF).

- **Cost:** Free for non-commercial use (up to 10,000 calls per day).
- **Time Range:** Hourly data from 1940 to present.
- **Resolution:** ~9 km (ERA5-Land) or ~25 km (ERA5).

## How to get it

1. Go to the [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api) page.
2. Enter your coordinates (Latitude/Longitude).
3. Select the date range (e.g., 1976-01-01 to 2026-03-22).
4. Check the "Temperature (2m)" and "Apparent Temperature" boxes under Hourly Variables.
5. Download the CSV. The St. Louis one is already in here as an example.

## Parsing

`parse.py` reads an Open-Meteo CSV and generates `temps.js` — the mean and standard deviation of apparent temperature grouped by day-of-year and hour. This is what the app uses to determine if it's hotter or colder than expected.

```bash
pipenv run python parse.py stl-open-meteo.csv
cp temps.js ../js/temps.js
```

The generated `temps.js` needs to be copied to `js/temps.js` for the app to use it.
