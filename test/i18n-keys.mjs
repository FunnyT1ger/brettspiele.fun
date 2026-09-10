/* brettspiele.fun — Übersetzungsschlüssel aus einem i18n-Paket auslesen.
 *
 * Die Pakete unter assets/i18n/<lang>.js bzw. games/<spiel>/i18n/<lang>.js sind
 * IIFEs, die window.BFI18N_DATA[<lang>].dict füllen. Statt sie mit einer Regex
 * zu zerlegen (bricht bei Kommas in Werten, Kommentaren, Sonderzeichen) werden
 * sie hier in einer LEEREN VM-Umgebung ausgeführt — kein Zugriff auf require,
 * process oder das Dateisystem — und die Schlüssel als JSON ausgegeben:
 *
 *   node i18n-keys.mjs <datei> [<datei> …]
 *   → {"<datei>": {"ok": true, "langs": {"de": ["key", …]}}, …}
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const result = {};

for (const file of process.argv.slice(2)) {
  try {
    const context = vm.createContext(Object.create(null));
    // Die Pakete greifen auf `window` zu, wenn es existiert, sonst globalThis.
    vm.runInContext("var window = globalThis;", context);
    vm.runInContext(readFileSync(file, "utf8"), context, { filename: file, timeout: 10000 });
    const data = vm.runInContext("globalThis.BFI18N_DATA || {}", context);
    const langs = {};
    for (const lang of Object.keys(data)) {
      const slot = data[lang];
      langs[lang] = slot && slot.dict ? Object.keys(slot.dict) : [];
    }
    result[file] = { ok: true, langs };
  } catch (err) {
    result[file] = { ok: false, error: String((err && err.message) || err) };
  }
}

process.stdout.write(JSON.stringify(result));
