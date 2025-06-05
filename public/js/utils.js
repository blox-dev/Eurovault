"use strict";

function parseTime(t) {
  const match = t.match(/^(\d{4})(?:[-_]?([A-Za-z0-9]+))?$/);
  return match
    ? { year: +match[1], suffix: match[2] || "" }
    : { year: -Infinity, suffix: "" };
}

export function compareTimes(a, b) {
  const ta = parseTime(a);
  const tb = parseTime(b);
  if (ta.year !== tb.year) return ta.year - tb.year;
  return ta.suffix.localeCompare(tb.suffix);
}

// Create shorter versions of eurostat units
// https://webgate.ec.europa.eu/fusionregistry/search.html?search=SCL_UNIT

const phraseRules = {
  "national currency": "NCU",
  "square metres": "m<sup>2</sup>",
  "square metre": "m<sup>2</sup>",
  "cubic metres": "m<sup>3</sup>",
  "cubic metre": "m<sup>3</sup>",
  "square kilometres": "km<sup>2</sup>",
  "square kilometre": "km<sup>2</sup>",
  "purchasing power standards": "PPS",
  "purchasing power standard": "PPS",
  // "chain linked volumes": "clv",
  "euro cent": "&cent;",
  "rate of change": "chg.",
};

const phraseReplacements = new Set(Object.values(phraseRules));

const wordRules = {
  "million": "mln.",
  "millions": "mln.",
  "billion": "bln.",
  "billions": "bln.",
  "thousand": "k.",
  "thousands": "k.",
  "euro": "&euro;",
  "euros": "&euro;",
  "per": "/",
  "inhabitant": "hab",
  "inhabitants": "hab",
  "capita": "cap",
  "person": "p",
  "persons": "p",
  "individuals": "p",
  "employee": "emp",
  "employees": "emp",
  "household": "hh",
  "households": "hh",
  "adult": "ad",
  "adults": "ad",
  "equivalent": "eq",
  "gdp": "GDP",
  "kg": "kg",
  "kilogram": "kg",
  "kilograms": "kg",
  "gram": "g",
  "grams": "g",
  "micrograms": "&micro;g",
  "milligrams": "mg",
  "tonne": "t",
  "tonnes": "t",
  "tonne-kilometre": "t&sdot;km",
  "tonne-kilometres": "t&sdot;km",
  "kilowatt": "kW",
  "kilowatts": "kW",
  "megawatt": "mW",
  "megawatts": "mW",
  "gigawatt": "gW",
  "gigawatts": "gW",
  "kilowatt-hour": "kWH",
  "megawatt-hour": "mWH",
  "gigawatt-hour": "gWH",
  "kilocalorie": "kcal",
  "kilojoule": "kJ",
  "megajoule": "mJ",
  "gigajoule": "gJ",
  "terajoule": "tJ",
  "hectare": "ha",
  "hectares": "ha",
  "metre": "m",
  "metres": "m",
  "kilometre": "km",
  "kilometres": "km",
  "liter": "l",
  "litre": "l",
  "litres": "l",
  "hectolitre": "hl",
  "hectolitres": "hl",
  "minute": "min",
  "minutes": "min",
  "hour": "h",
  "hours": "h",
  "day": "d",
  "days": "d",
  "month": "mo",
  "months": "mo",
  "year": "yr",
  "years": "yr",
  // "index": "idx",
  "coefficient": "coef.",
  "relative": "chg.",
  "rate": "chg.",
  "change": "chg.",
  "percentage": "%",
  // "price": "€",
  "currency": "cur",
  "national": "nat.",
  "volume": "vol",
  "pps": "",
  "work": "wrk",
  "employment": "emp",
};

function removeExplanation(str) {
  // Remove all parentheses and their contents
  str = str.replace(/\s*\([^)]*\)/g, "");
  // Remove commas
  return str.replace(/,/g, "").trim().toLowerCase();
}

function applyPhraseRules(str) {
  for (const [phrase, replacement] of Object.entries(phraseRules)) {
    const regex = new RegExp(`\\b${phrase}\\b`, "gi");
    str = str.replace(regex, replacement);
  }
  return str;
}

function applyWordRules(str) {
  return str
    .split(/\s+/)
    .map((word) =>
      phraseReplacements.has(word)
        ? word
        : wordRules.hasOwnProperty(word)
        ? wordRules[word]
        : ""
    )
    .filter(Boolean)
    .join("");
}

export function shorten(input) {
  const cleaned = removeExplanation(input);
  const phraseReplaced = applyPhraseRules(cleaned);
  return applyWordRules(phraseReplaced);
}
