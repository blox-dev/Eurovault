import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMetadataObject,
  buildUrls,
  generateHtml,
  moreThan30DaysApart,
  JSON2CSV,
} from '../app.js';

// --- validateMetadataObject ---
test('validateMetadataObject should fail when "files" is missing', () => {
  const metadata = {};
  const errors = validateMetadataObject(metadata);
  assert(errors.includes("Root object must contain 'files' as an array."));
});

test('validateMetadataObject should detect missing file code', () => {
  const metadata = { files: [{ _status: {}, dimension: {}, dimensionPrefs: {} }] };
  const errors = validateMetadataObject(metadata);
  assert(errors.some(e => e.includes("Missing file code")));
});

test('validateMetadataObject should succeed with minimal valid input', () => {
  const metadata = {
    files: [{
      code: "demo",
      _status: { metadata: {} },
      dimension: { geo: { category: { index: { EU: 0 } } } },
      dimensionPrefs: { geo: { category: { index: { EU: 0 } } } },
    }]
  };
  const errors = validateMetadataObject(metadata);
  assert.equal(errors.length, 0);
});

// --- buildUrls ---
test('buildUrls should assign a URL to file with valid dimensionPrefs', () => {
  const files = [{
    code: "demo",
    _status: { metadata: { status: "success" } },
    dimensionPrefs: { geo: { category: { label: { EU: "Europe" } } } }
  }];
  buildUrls(files);
  assert.ok(files[0].url.startsWith("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/demo"));
});

// --- generateHtml ---
test('generateHtml should produce HTML with links', () => {
  const files = {
    demo: { code: "demo", url: "http://example.com", label: "Demo file" }
  };
  const html = generateHtml(files);
  assert.match(html, /<a target="_blank" href="http:\/\/example\.com">JSON<\/a>/);
});

// --- moreThan30DaysApart ---
test('moreThan30DaysApart detects >30 days difference', () => {
  assert.equal(
    moreThan30DaysApart("2020-01-01", "2020-02-15"),
    true
  );
});

test('moreThan30DaysApart detects <30 days difference', () => {
  assert.equal(
    moreThan30DaysApart("2020-01-01", "2020-01-15"),
    false
  );
});

// --- JSON2CSV ---
test('JSON2CSV converts simple dataset to CSV', () => {
  const data = {
    id: ["geo", "time"],
    size: [2, 2],
    dimension: {
      geo: { category: { label: { EU: "Europe", US: "USA" } } },
      time: { category: { label: { "2020": "2020", "2021": "2021" } } }
    },
    value: {
      "0": 100,
      "1": 200,
      "2": 300,
      "3": 400,
    }
  };
  const csv = JSON2CSV(data);
  assert.match(csv, /GEO,TIME,VALUE/);
  assert.match(csv, /EU,2020,100/);
  assert.match(csv, /US,2021,400/);
});