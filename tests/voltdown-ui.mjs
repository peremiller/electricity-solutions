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

// Contrast regression uses actual computed Chromium colors in both themes,
// including both ends of the card background gradient and the selected chip.
function parseColor(value) {
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
  }
  const match = value.match(/^rgba?[(]([0-9]+),[ ]*([0-9]+),[ ]*([0-9]+)/);
  assert.ok(match, `Unexpected color: ${value}`);
  return match.slice(1, 4).map(Number);
}
function contrast(a, b) {
  const luminance = value => {
    const [r, g, blue] = parseColor(value).map(v => v / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * blue;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test("small solution IDs, category link color, and selected chips meet 4.5:1 in both themes", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(base);
    for (const theme of ["dark", "light"]) {
      if (theme === "light") await page.locator("#themeToggle").click();
      const actual = await page.evaluate(() => {
        const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return {
          idText: getComputedStyle(document.querySelector("#grid .idtag")).color,
          chipText: getComputedStyle(document.querySelector(".chip.active")).color,
          card: token("--card"), card2: token("--card-2"),
          category: token("--accent-2")
        };
      });
      for (const background of [actual.card, actual.card2]) {
        assert.ok(contrast(actual.idText, background) >= 4.5,
          `${theme}: small ID text contrast below 4.5 on ${background}`);
        assert.ok(contrast(actual.category, background) >= 4.5,
          `${theme}: accent category color contrast below 4.5 on ${background}`);
      }
      assert.ok(contrast(actual.chipText, actual.category) >= 4.5,
        `${theme}: active category chip text below 4.5 contrast`);
    }
  } finally { await page.close(); }
});


test("keyboard focus rings remain visible for view, theme and dialog controls in both themes", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.goto(base);
    for (const theme of ["dark", "light"]) {
      if (theme === "light") await page.locator("#themeToggle").click();
      await page.keyboard.press("Tab");
      for (const selector of ["#viewTable", "#themeToggle", ".chip"]) {
        const target = page.locator(selector).first();
        await target.focus();
        const css = await target.evaluate(el => {
          const style = getComputedStyle(el);
          return { outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth) };
        });
        assert.equal(css.outlineStyle, "solid", `${theme} ${selector} should show keyboard focus`);
        assert.ok(css.outlineWidth >= 2, `${theme} ${selector} focus ring should be at least 2px`);
      }
      await page.locator("#grid .card").first().click();
      assert.equal(await page.locator("#detail.open").count(), 1);
      await page.keyboard.press("Tab");
      const step = page.locator(".steps-toggle").first();
      await step.focus();
      const width = await step.evaluate(el => parseFloat(getComputedStyle(el).outlineWidth));
      assert.ok(width >= 2, `${theme}: expanded detail action must have a visible focus ring`);
      await page.keyboard.press("Escape");
    }
  } finally { await page.close(); }
});

test("keyboard-selected category and expanding chips retain focus; filtered count is announced", async () => {
  for (const theme of ["dark", "light"]) {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    try {
      await page.goto(base);
      if (theme === "light") await page.locator("#themeToggle").click();
      const category = page.locator('#cats .chip[data-cat]:not([data-cat=""])').first();
      const key = await category.getAttribute("data-cat");
      await category.focus();
      await page.keyboard.press("Enter");
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.cat), key,
        `${theme}: replacing the active category chip must not lose keyboard focus`);
      assert.match(await page.locator("#srAnnounce").textContent(), /solutions match your filters/);
      const toggle = page.locator("#cats .chip-toggle");
      if (await toggle.count()) {
        await toggle.focus();
        await page.keyboard.press("Enter");
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true,
          `${theme}: expanding categories must restore focus`);
        await page.keyboard.press("Enter");
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true,
          `${theme}: collapsing categories must restore focus`);
      }
      await page.locator("#search").fill("__unmatched_category_query__");
      assert.match(await page.locator("#srAnnounce").textContent(), /^0 solutions match your filters\.$/);
      assert.equal(await page.locator("#empty").isVisible(), true);
    } finally { await page.close(); }
  }
});
