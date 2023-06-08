// NYC - But actually Time Square...
const lat = 40.7128;
const lon = -73.9850;

// API - Plz don't steal and do bad things with the key.
const apiKey = "e1ac16beb06cba262e36e848533b3971";
const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}`;
const aqiUrl = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`;

// Seasons
const astrologicalSubSeasons = {
	earlySpring: { start: "03-20", end: "04-19" },
	midSpring: { start: "04-19", end: "05-19" },
	lateSpring: { start: "05-22", end: "06-21" },
	earlySummer: { start: "06-21", end: "07-21" },
	midSummer: { start: "07-21", end: "08-22" },
	lateSummer: { start: "08-22", end: "09-22" },
	earlyFall: { start: "09-22", end: "10-22" },
	midFall: { start: "10-22", end: "11-21" },
	lateFall: { start: "11-21", end: "12-21" },
	earlyWinter: { start: "00-21", end: "01-19" },
	midWinter: { start: "01-19", end: "02-18" },
	lateWinter: { start: "02-18", end: "03-20" },
}

// Mapping to the list index.
const seasonsIndexes = {
	"Winter": 0,
	"Fool's Spring": 1,
	"Second Winter": 2,
	"Spring of Deception": 3,
	"Third Winter": 4,
	"The Pollening": 5,
	"Actual Spring": 6,
	"Summer": 7,
	"Hell's Front Porch": 8,
	"False Fall": 9,
	"Second Summer": 10,
	"Actual Fall": 11
};

function getMeanAndStd(now) {
	let dayOfYear = Math.floor((now - (new Date(now.getFullYear(), 0, 0))) / 1000 / 60 / 60 / 24);
	let dayHour = `${dayOfYear.toString().padStart(3, "0")}-${now.getHours().toString().padStart(2, "0")}`;
	let mean = temps[dayHour].mean;
	let std = temps[dayHour].std;
	return { mean, std };
}

function checkIfCold(now, tempF) {
	let { mean, std } = getMeanAndStd(now);
	return tempF < mean - (1.5 * std);
}

function checkIfHot(now, tempF) {
	let { mean, std } = getMeanAndStd(now);
	return tempF > mean + (1.5 * std);
}

function getAstrologicalSubSeason(now) {
	let day = now.getDate();
	let month = now.getMonth();
	let date = `${(month + 1).toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
	for (let subSeason in astrologicalSubSeasons) {
		let subSeasonRange = astrologicalSubSeasons[subSeason];
		if (date >= subSeasonRange.start && date < subSeasonRange.end) {
			return subSeason;
		}
	}
	throw new Error("Date not in any sub season: " + date);
}

function getNYCSeason(now, tempF, aqiScore) {
	let isHot = checkIfHot(now, tempF);
	let isCold = checkIfCold(now, tempF);
	let isMid = !isHot && !isCold;
	let season = getAstrologicalSubSeason(now);
	console.log(isHot, isCold, isMid, season)

	if (season.match("Winter")) {
		if (isCold || isMid) {
			if (season === "earlyWinter" || season === "midWinter") {
				return "Winter";
			}
			if (season === "lateWinter") {
				return "Second Winter";
			}
		}
		if (isHot) {
			return "Fool's Spring";
		}

	// In non-winter seasons, if the AQI is bad, it's always Hell's Front Porch.
	} else if (aqiScore > 2) {
		return "Hell's Front Porch";
	}

	if (season.match("Spring")) {
		if (isCold) {
			return "Third Winter";
		}
		if (isMid || isHot) {
			if (season === "earlySpring") {
				return "Spring of Deception";
			}
			if (season === "midSpring" || season === "lateSpring") {
				if (isMid) {
					return "Actual Spring";
				}
				if (isHot) {
					return "The Pollening";
				}
			}
		}
	}

	if (season.match("Summer")) {
		if (isHot) {
			return "Hell's Front Porch";
		}
		if (isMid || isCold) {
			if (season === "earlySummer" || season === "midSummer") {
				return "Summer";
			}
			if (season === "lateSummer") {
				return "False Fall";
			}
		}
	}

	if (season.match("Fall")) {
		if (isCold) {
			return "Winter";
		}
		if (isMid) {
			return "Actual Fall";
		}
		if (isHot) {
			return "Second Summer";
		}
	}
	throw new Exception("Please email devon@peticol.as with the current date, time, and if you wore a jacket today.");
}

function describeAqi(aqiScore) {
	if (aqiScore === 1) {
		return "Good";
	} else if (aqiScore === 2) {
		return "Fair";
	} else if (aqiScore === 3) {
		return "Moderate";
	} else if (aqiScore === 4) {
		return "Poor";
	} else {
		return "Very Poor";
	}
}

function getExplainerString(now, tempF, aqiScore) {
	let { mean, std } = getMeanAndStd(now);
	let tempDeviations = (tempF - mean) / std;
	let timeParts = now.toString().split(" ");
	let amPm = now.getHours() < 12 ? "AM" : "PM";
	let hour = now.getHours() % 12;
	hour = hour === 0 ? 12 : hour;
	let aboveBelow = tempDeviations > 0 ? "above" : "below";
	let absTempDeviations = Math.abs(tempDeviations);
	let str = `It's ${tempF.toFixed(1)}\u00B0F which is ${absTempDeviations.toFixed(1)} standard deviations ${aboveBelow} the mean of ${mean.toFixed(1)}\u00B0F for ${hour} ${amPm}, ${timeParts[1]} ${timeParts[2]}`;
	if (aqiScore > 2) {
		str += `\nThe AQI is "${describeAqi(aqiScore)}"`;
	}
	return str;
}

window.addEventListener("load", () => {
	fetch(apiUrl)
		.then((response) => {
			return response.json();
		})
		.then((weatherData) => {
			console.log(weatherData);

			fetch(aqiUrl)
				.then((response) => {
					return response.json();
				})
				.then((aqiData) => {
					console.log(aqiData);

					// F stands for Freedom
					let tempK = weatherData.main.feels_like;
					let tempF = 1.8 * (tempK - 273) + 32;
					
					// https://openweathermap.org/api/air-pollution
					let aqiScore = aqiData.list[0].main.aqi;

					let now = new Date();
					let season = getNYCSeason(now, tempF, aqiScore);

					console.log(tempF, season);

					let seasonIndex = seasonsIndexes[season];
					let seasonLi = document.querySelectorAll("li")[seasonIndex];
					seasonLi.classList.add("current");

					let explainer = getExplainerString(now, tempF, aqiScore);
					document.querySelector("#explainer").innerText = explainer;
		});
	});
});