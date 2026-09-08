import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "audit");
fs.mkdirSync(out, { recursive: true });

const chrome =
  process.env.CHROME ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const notes = [];
const errors = [];

function log(msg) {
  notes.push(msg);
  console.log(msg);
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "new",
  args: [
    "--use-gl=angle",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

async function shot(name) {
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  log(`shot ${name}`);
  return file;
}

async function metrics(label) {
  const m = await page.evaluate(() => {
    const phone = document.querySelector(".phone");
    const home = document.querySelector(".home");
    const overflow = {
      bodyScrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      phoneH: phone ? phone.getBoundingClientRect().height : null,
      homeScroll: home ? home.scrollHeight : null,
      homeClient: home ? home.clientHeight : null,
    };
    const buttons = [...document.querySelectorAll("button")].map((b) => ({
      text: (b.innerText || "").replace(/\s+/g, " ").trim().slice(0, 60),
      disabled: b.disabled,
      w: Math.round(b.getBoundingClientRect().width),
      h: Math.round(b.getBoundingClientRect().height),
    }));
    const h1 = document.querySelector("h1")?.innerText;
    const pills = [...document.querySelectorAll(".source-pill,.origin-badge,.kicker")].map((e) =>
      e.innerText.trim()
    );
    const hud = document.querySelector(".hud")?.innerText;
    const overlapping = [];
    const dock = document.querySelector(".dock");
    const hudEl = document.querySelector(".hud");
    if (dock && hudEl) {
      const a = dock.getBoundingClientRect();
      const b = hudEl.getBoundingClientRect();
      if (a.top < b.bottom && a.bottom > b.top) overlapping.push("hud/dock");
    }
    return { overflow, buttons, h1, pills, hud, overlapping, title: document.title };
  });
  log(`${label} ${JSON.stringify(m, null, 2)}`);
  return m;
}

await page.goto("http://127.0.0.1:5173/", { waitUntil: "load", timeout: 20000 });
await page.waitForSelector(".phone", { timeout: 15000 });
await new Promise((r) => setTimeout(r, 600));
await shot("01-home-phone");
const home = await metrics("HOME");

const start = await page.$("button.go");
if (!start) throw new Error("no start button");
await start.click();
await page.waitForSelector(".stress", { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1800));
await shot("02-stress-webgl");
await metrics("STRESS");

const bomb = await page.evaluateHandle(() =>
  [...document.querySelectorAll("button")].find((b) => /bomb/i.test(b.innerText))
);
if (bomb && bomb.asElement()) {
  await bomb.asElement().click();
  await new Promise((r) => setTimeout(r, 1200));
  await shot("03-stress-bomb");
}

const stop = await page.evaluateHandle(() =>
  [...document.querySelectorAll("button")].find((b) => /stop/i.test(b.innerText))
);
if (!stop || !stop.asElement()) throw new Error("no stop button");
await stop.asElement().click();
await page.waitForSelector(".report", { timeout: 20000 });
await new Promise((r) => setTimeout(r, 900));
await shot("04-report");
const report = await metrics("REPORT");

await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
await page.goto("http://127.0.0.1:5173/#/desk", { waitUntil: "load", timeout: 20000 });
await page.waitForSelector(".desk", { timeout: 10000 });
await new Promise((r) => setTimeout(r, 700));
await shot("05-desk-desktop");
const desk = await metrics("DESK");

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.reload({ waitUntil: "load" });
await new Promise((r) => setTimeout(r, 700));
await shot("06-desk-mobile");

await page.goto("http://127.0.0.1:5173/", { waitUntil: "load" });
await page.waitForSelector("button.go");
await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".workload-card")];
  cards.find((c) => /gpu triangles/i.test(c.innerText))?.click();
});
await (await page.$("button.go")).click();
await page.waitForSelector(".stress", { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1500));
await shot("07-triangles");

await page.goto("http://127.0.0.1:5173/", { waitUntil: "load" });
await page.waitForSelector("button.go");
await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".workload-card")];
  cards.find((c) => /dom feed/i.test(c.innerText))?.click();
});
await (await page.$("button.go")).click();
await page.waitForSelector(".stress", { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1200));
await shot("08-dom-feed");

await browser.close();

const summary = { errors, notes: notes.slice(0, 40), homeButtons: home.buttons, reportButtons: report.buttons, deskH1: desk.h1 };
fs.writeFileSync(path.join(out, "walkthrough.json"), JSON.stringify(summary, null, 2));
console.log("ERRORS", errors);
console.log("done", out);
