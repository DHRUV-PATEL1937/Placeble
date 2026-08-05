import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Placeble application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Dashboard \| Placeble/);
  assert.match(html, /Your complete career readiness workspace\./);
  assert.match(html, /class="auth-loading"/);
  assert.match(html, /class="auth-brand"/);
  assert.match(html, />placeble</i);
  assert.match(html, /Preparing your workspace/);
  assert.match(html, /Placeble career readiness dashboard/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site|codex-preview/i);
});

test("keeps product metadata and the application entry point explicit", async () => {
  const [page, layout, app, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/placeble-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /export const metadata:\s*Metadata/);
  assert.match(page, /title:\s*"Dashboard \| Placeble"/);
  assert.match(page, /<PlacebleApp\s*\/>/);
  assert.match(layout, /applicationName:\s*"Placeble"/);
  assert.match(layout, /og\.png/);
  assert.match(layout, /<html lang="en"/);
  assert.match(app, /ProfessionalRoleDashboard/);
  assert.match(app, /PlacebleDashboard/);
  assert.match(packageJson, /"name": "@placeble\/frontend"/);
  assert.doesNotMatch(page, /codex-preview|_sites-preview/i);
});
