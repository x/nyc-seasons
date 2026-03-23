#!/usr/bin/env python3
"""Parse Open-Meteo historical CSV into temps.js for the app."""

import argparse
import json
import sys

import pandas as pd


def main():
    parser = argparse.ArgumentParser(
        description="Parse Open-Meteo CSV into temps.js (mean/std by day-hour)"
    )
    parser.add_argument("csv_file", help="Path to the Open-Meteo CSV file")
    parser.add_argument(
        "-o", "--output",
        default="temps.js",
        help="Output path (default: temps.js)",
    )
    args = parser.parse_args()

    # Open-Meteo CSVs have 3 header lines before the actual data
    df = pd.read_csv(args.csv_file, skiprows=3)

    col_time = df.columns[0]  # "time"
    # Use apparent temperature (feels_like equivalent); fall back to temperature
    if len(df.columns) > 2:
        col_temp = df.columns[2]  # "apparent_temperature (°F)"
    else:
        col_temp = df.columns[1]  # "temperature_2m (°F)"

    df["datetime"] = pd.to_datetime(df[col_time])
    df["day_hour"] = df["datetime"].dt.strftime("%j-%H")

    hour_temps = df.groupby("day_hour")[col_temp].agg(["mean", "std"])
    hour_temps_dict = hour_temps.to_dict("index")

    js_content = "temps = " + json.dumps(hour_temps_dict, indent=2)

    with open(args.output, "w") as f:
        f.write(js_content + "\n")

    print(f"Wrote {len(hour_temps_dict)} entries to {args.output}")


if __name__ == "__main__":
    main()
