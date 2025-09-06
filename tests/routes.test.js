import test from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { app } from "../app.js";
import { config } from '../config.js';

// helper to start/stop server on free port
async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(config.port, resolve));
  const port = server.address().port;
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    server.close();
  }
}

test("GET /metadata should return HTML", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/metadata`);
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.match(text, /<html|<!DOCTYPE html/i);
  });
});

test("POST /save-metadata should reject invalid JSON", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/save-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // missing "files"
    });
    const text = await res.text();

    assert.equal(res.status, 400);
    assert.match(text, /Root object must contain 'files'/);
  });
});

test("POST /save-metadata should accept valid metadata", async () => {
  const validMetadata = {
    files: [
      {
        code: "demo",
        _status: { metadata: {} },
        dimension: { geo: { category: { index: { EU: 0 } } } },
        dimensionPrefs: { geo: { category: { index: { EU: 0 } } } },
      },
    ],
  };

  await withServer(async (base) => {
    const res = await fetch(`${base}/save-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validMetadata),
    });
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.match(text, /Metadata saved successfully/);
  });
});

test("GET /links should return HTML table with links", async () => {
  await withServer(async (base) => {
    const metadata = {
      files: [
        {
          code: "demo",
          _status: { metadata: {} },
          dimension: { geo: { category: { index: { EU: 0 } } } },
          dimensionPrefs: { geo: { category: { index: { EU: 0 } } } },
        },
      ],
    };
    await fetch(`${base}/save-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });

    // now request /links
    const res = await fetch(`${base}/links`);
    const html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /<table/);
    assert.match(html, /demo/);
  });
});

test("POST /update should trigger update workflow", async () => {
  await withServer(async (base) => {
    const metadata = {
      files: [
        {
          code: "demo",
          _status: { metadata: {} },
          dimension: { geo: { category: { index: { EU: 0 } } } },
          dimensionPrefs: { geo: { category: { index: { EU: 0 } } } },
        },
      ],
    };
    await fetch(`${base}/save-metadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
    
    const res = await fetch(`${base}/update`, { method: "GET" });
    const text = await res.text();

    assert.equal(res.status, 200);
    assert.match(text, /<table/);
  });
});
