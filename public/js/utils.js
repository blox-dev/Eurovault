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
