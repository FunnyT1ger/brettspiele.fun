/* brettspiele.fun — Laufzeit-Test einer Seite im echten (headless) Chromium.
 *
 * Findet, was statische Prüfungen nicht sehen: JS-Ausnahmen beim Start,
 * Konsolenfehler, fehlgeschlagene Requests (404 auf Assets nach einem
 * Umbenennen, falscher Cache-Bust-Pfad …), fehlende Übersetzungsschlüssel in
 * den einzelnen Sprachen und horizontales Überlaufen auf dem Handy-Viewport.
 *
 * Aufruf (der Job kommt als JSON, damit nichts über die Shell escaped werden muss):
 *   node browser-check.mjs '<json>'
 *   json = { "url": "…", "langs": ["de","en"], "mobile": true,
 *            "timeout": 30000, "settle": 1500 }
 * Ausgabe: {"errors": [...], "warnings": [...], "info": {...}}
 *
 * Exit-Code ist immer 0, solange der Lauf selbst geklappt hat — über
 * Fehler/Warnungen entscheidet der Aufrufer (brettspiele-test).
 */
import { chromium } from "playwright";

const job = JSON.parse(process.argv[2] || "{}");
const url = job.url;
const langs = Array.isArray(job.langs) ? job.langs : [];
const timeout = job.timeout || 30000;
const settle = job.settle == null ? 1500 : job.settle;

const errors = [];
const warnings = [];
const info = {};
const origin = new URL(url).origin;

const seen = new Set();
function push(list, msg) {
  const key = msg.slice(0, 200);
  if (seen.has(key)) return;      // dieselbe Meldung nicht pro Sprache wiederholen
  seen.add(key);
  list.push(msg);
}

/* Läuft eine Seite an und sammelt alles, was dabei schiefgeht.
   lang = null → Standardsprache (keine Vorbelegung im localStorage). */
async function visit(browser, label, { lang = null, viewport = null } = {}) {
  const context = await browser.newContext({
    viewport: viewport || { width: 1280, height: 800 },
    userAgent: viewport ? undefined : undefined,
  });
  if (lang) {
    await context.addInitScript((value) => {
      try { localStorage.setItem("brettspiele.languageMode", value); } catch (e) {}
    }, lang);
  }
  const page = await context.newPage();

  page.on("pageerror", (err) => push(errors, `${label}: JS-Ausnahme — ${String(err.message || err).slice(0, 300)}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text().slice(0, 300);
    // Fehlgeschlagene Requests meldet der Browser zusätzlich auf der Konsole —
    // die zählen wir unten schon einmal, hier also überspringen.
    if (/Failed to load resource/i.test(text)) return;
    push(errors, `${label}: Konsolenfehler — ${text}`);
  });
  page.on("requestfailed", (req) => {
    const failure = (req.failure() && req.failure().errorText) || "unbekannt";
    if (failure === "net::ERR_ABORTED") return;   // z. B. abgebrochene Medien-Streams
    const line = `${label}: Request fehlgeschlagen (${failure}) — ${req.url().slice(0, 200)}`;
    push(req.url().startsWith(origin) ? errors : warnings, line);
  });
  page.on("response", (res) => {
    if (res.status() < 400) return;
    const line = `${label}: HTTP ${res.status()} — ${res.url().slice(0, 200)}`;
    push(res.url().startsWith(origin) ? errors : warnings, line);
  });

  let response = null;
  try {
    response = await page.goto(url, { waitUntil: "load", timeout });
  } catch (err) {
    push(errors, `${label}: Seite lädt nicht — ${String(err.message || err).split("\n")[0].slice(0, 200)}`);
    await context.close();
    return null;
  }
  if (response && response.status() >= 400) {
    push(errors, `${label}: Seite antwortet mit HTTP ${response.status()}`);
  }
  // Kurz laufen lassen: Spiele bauen ihre Oberfläche oft erst nach dem load-Event.
  await page.waitForTimeout(settle);

  const probe = await page.evaluate((wanted) => {
    const doc = document;
    const html = doc.documentElement;
    const lang = wanted || html.getAttribute("lang") || "de";
    const data = window.BFI18N_DATA || {};
    const dict = (data[lang] && data[lang].dict) || {};
    const attrs = ["data-i18n", "data-i18n-placeholder", "data-i18n-title", "data-i18n-aria"];
    const missing = [];
    const seenKeys = new Set();
    doc.querySelectorAll("[" + attrs.join("],[") + "]").forEach((el) => {
      for (const attr of attrs) {
        const key = el.getAttribute(attr);
        if (!key || seenKeys.has(key)) continue;
        seenKeys.add(key);
        if (!(key in dict)) missing.push(key);
      }
    });
    return {
      title: doc.title || "",
      lang,
      dictSize: Object.keys(dict).length,
      keysUsed: seenKeys.size,
      missing: missing.slice(0, 25),
      missingCount: missing.length,
      overflow: html.scrollWidth - window.innerWidth,
      textLength: ((doc.body && doc.body.innerText) || "").trim().length,
    };
  }, lang).catch(() => null);

  if (probe) {
    if (!probe.title) push(warnings, `${label}: Seite hat keinen Titel`);
    if (probe.textLength < 20) push(errors, `${label}: Seite bleibt praktisch leer (${probe.textLength} Zeichen sichtbarer Text)`);
    if (probe.missingCount) {
      push(warnings, `${label}: ${probe.missingCount} Übersetzungsschlüssel fehlen — ${probe.missing.slice(0, 8).join(", ")}`);
    }
    if (probe.overflow > 4) {
      push(warnings, `${label}: horizontaler Überlauf (${probe.overflow}px breiter als der Viewport)`);
    }
    info[label] = { title: probe.title, keysUsed: probe.keysUsed, dictSize: probe.dictSize };
  }

  await context.close();
  return probe;
}

let browser;
try {
  browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
} catch (err) {
  process.stdout.write(JSON.stringify({
    errors: [`Browser startet nicht — ${String(err.message || err).split("\n")[0]}`],
    warnings: [], info: {},
  }));
  process.exit(0);
}

try {
  await visit(browser, "Start");
  for (const lang of langs) {
    await visit(browser, `Sprache ${lang}`, { lang });
  }
  if (job.mobile) {
    await visit(browser, "Handy 390×844", { viewport: { width: 390, height: 844 } });
  }
} catch (err) {
  errors.push(`Testlauf abgebrochen — ${String(err.message || err).split("\n")[0]}`);
} finally {
  await browser.close().catch(() => {});
}

process.stdout.write(JSON.stringify({ errors, warnings, info }));
