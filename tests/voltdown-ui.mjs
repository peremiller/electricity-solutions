import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { Script } from "node:vm";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const favicon = readFileSync(new URL("../favicon.svg", import.meta.url));
let server, browser, base;

before(async () => {
  server = createServer((req, res) => {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } else if (path === "/favicon.svg") {
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(favicon);
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

test("embedded JavaScript parses and existing browser-local key and exports remain", () => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "embedded script exists");
  new Script(match[1]);
  assert.match(match[1], /voltdown_status_v1/);
  assert.match(match[1], /voltdown_theme/);
  assert.match(html, /id="exportJson"/);
  assert.match(html, /id="exportCsv"/);
});

test("deep link opens authentic solution; keyboard focus survives actions; Back/Forward and data persist", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${base}/?source=regression&solution=12#main-content`);
  assert.equal(await page.locator("#detail.open").count(), 1);
  assert.equal(await page.locator("#detailClose").evaluate(el => el === document.activeElement), true);
  await page.locator(".steps-toggle").first().click();
  assert.equal(await page.locator('.steps-toggle[data-steps="0"]').evaluate(el => el === document.activeElement), true);
  const beforeStatus = await page.locator('.status-btn[data-sub="0"]').textContent();
  await page.locator('.status-btn[data-sub="0"]').click();
  assert.equal(await page.locator('.status-btn[data-sub="0"]').evaluate(el => el === document.activeElement), true);
  assert.notEqual(await page.locator('.status-btn[data-sub="0"]').textContent(), beforeStatus);
  const previous = await page.evaluate(() => localStorage.getItem("voltdown_status_v1"));
  assert.ok(JSON.parse(previous)["12:0"]);
  await page.locator("#detailClose").click();
  assert.equal(await page.locator("#detail.open").count(), 0);
  assert.equal(new URL(page.url()).searchParams.get("solution"), null);
  assert.equal(new URL(page.url()).searchParams.get("source"), "regression");
  assert.equal(new URL(page.url()).hash, "#main-content");
  await page.goBack();
  assert.equal(await page.locator("#detail.open").count(), 1);
  await page.goForward();
  assert.equal(await page.locator("#detail.open").count(), 0);
  await page.reload();
  assert.equal(await page.evaluate(() => localStorage.getItem("voltdown_status_v1")), previous);
  assert.deepEqual(errors, []);
  await page.close();
});

test("invalid saved statuses do not break rendering or discard other saved user entries", async () => {
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem("voltdown_status_v1", '{"1:0":"invalid-status","2:0":"done"}'));
  await page.goto(base + "/?solution=1");
  assert.equal(await page.locator("#detail.open").count(), 1);
  assert.ok((await page.locator("#count").textContent()).includes("1,000"));
  await page.locator('.status-btn[data-sub="0"]').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("voltdown_status_v1")));
  assert.equal(stored["2:0"], "done");
  assert.ok(["todo", "doing", "done", "blocked"].includes(stored["1:0"]));
  await page.close();
  const malformed = await browser.newPage();
  await malformed.addInitScript(() => localStorage.setItem("voltdown_status_v1", "null"));
  await malformed.goto(base + "/?solution=1");
  assert.equal(await malformed.locator("#detail.open").count(), 1);
  assert.equal(await malformed.evaluate(() => localStorage.getItem("voltdown_status_v1")), "null", "do not silently overwrite existing data");
  await malformed.close();
});

test("two themes, three viewport sizes, filters, empty state, table and escape all work", async () => {
  for (const width of [320, 390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(base);
    assert.equal(await page.locator(".skip-link").count(), 1);
    assert.equal(await page.locator("#grid .card").count() > 0, true);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(".skip-link").evaluate(el => el === document.activeElement), true);
    for (const theme of ["dark", "light"]) {
      if (theme === "light") await page.locator("#themeToggle").click();
      assert.equal(await page.evaluate(() => document.documentElement.getAttribute("data-theme") === "light"), theme === "light");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const offenders = overflow > 2 ? await page.evaluate(() => [...document.querySelectorAll("*")]
        .filter(el => { const b = el.getBoundingClientRect(); return b.width && b.right > window.innerWidth + 2 && getComputedStyle(el).position !== "fixed"; })
        .slice(0, 6).map(el => ({ tag: el.tagName.toLowerCase(), id: el.id, className: typeof el.className === "string" ? el.className : "", right: Math.round(el.getBoundingClientRect().right) }))) : [];
      assert.ok(overflow <= 2, `horizontal overflow at ${width}px in ${theme} mode: ${overflow}; offenders: ${JSON.stringify(offenders)}`);
      const readable = await page.locator("body").evaluate(el => getComputedStyle(el).color);
      assert.notEqual(readable, "rgba(0, 0, 0, 0)");
    }
    await page.locator("#search").fill("__not_a_known_solution_000__");
    assert.equal(await page.locator("#empty").isVisible(), true);
    await page.locator("#search").fill("");
    await page.locator("#viewTable").click();
    assert.equal(await page.locator("table.vtable").count(), 1);
    assert.equal(await page.locator("#viewTable").getAttribute("aria-pressed"), "true");
    await page.locator("table.vtable .rowbtn").first().click();
    assert.equal(await page.locator("#detail.open").count(), 1);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#detail.open").count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
});
