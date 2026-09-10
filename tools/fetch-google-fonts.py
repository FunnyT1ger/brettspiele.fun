"""Holt die von der Seite genutzten Google-Fonts einmalig herunter und baut
lokale @font-face-Stylesheets. Danach braucht die Seite fonts.googleapis.com
und fonts.gstatic.com nicht mehr — kein Verbindungsaufbau der Besucher zu
Google, kein Drittlandtransfer beim bloßen Seitenaufruf."""
import re, subprocess, pathlib, sys, collections

OUT = pathlib.Path(__file__).resolve().parent.parent / "www" / "assets" / "fonts"
OUT.mkdir(parents=True, exist_ok=True)
# Chrome-UA, sonst liefert Google TTF statt woff2.
UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/126.0.0.0 Safari/537.36")

BUNDLES = {
  "core": "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500&display=swap",
  "gold-mile": "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Jost:wght@300;400;500;600&display=swap",
  "gruftgesindel": "https://fonts.googleapis.com/css2?family=Creepster&family=Fredoka:wght@500;600;700&family=Nunito:wght@600;700;800&display=swap",
  "nitpicker": "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;700&display=swap",
}

def fetch(url, binary=False):
    r = subprocess.run(["curl", "-sS", "-L", "-m", "60", "-A", UA, url],
                       capture_output=True)
    if r.returncode != 0:
        sys.exit("Abruf fehlgeschlagen: %s\n%s" % (url, r.stderr.decode()[:300]))
    return r.stdout if binary else r.stdout.decode("utf-8")

def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")

downloaded = {}          # gstatic-URL → lokaler Dateiname
stats = collections.Counter()

for name, url in BUNDLES.items():
    css = fetch(url)
    subset = "x"
    out_lines = []
    face = []
    for line in css.splitlines():
        m = re.match(r"\s*/\*\s*(.+?)\s*\*/\s*$", line)
        if m:
            subset = slug(m.group(1))
            out_lines.append(line)
            continue
        face.append(line)
        if "}" in line:
            block = "\n".join(face)
            face = []
            fam = re.search(r"font-family:\s*'([^']+)'", block)
            sty = re.search(r"font-style:\s*(\S+?);", block)
            wgt = re.search(r"font-weight:\s*([^;]+);", block)
            src = re.search(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", block)
            if not (fam and src):
                out_lines.append(block)
                continue
            gurl = src.group(1)
            if gurl not in downloaded:
                weight = slug(wgt.group(1)) if wgt else "400"
                style = sty.group(1) if sty else "normal"
                fname = "%s-%s-%s-%s.woff2" % (slug(fam.group(1)), style, weight, subset)
                data = fetch(gurl, binary=True)
                if len(data) < 200:
                    sys.exit("verdächtig kleine Datei: %s (%d B)" % (gurl, len(data)))
                (OUT / fname).write_bytes(data)
                downloaded[gurl] = fname
                stats[slug(fam.group(1))] += len(data)
            out_lines.append(block.replace(gurl, "./" + downloaded[gurl]))
    header = ("/* Selbst gehostete Schriften — heruntergeladen von Google Fonts,\n"
              "   lizenziert unter der SIL Open Font License 1.1 (LICENSES/OFL-1.1.txt).\n"
              "   Erzeugt aus: %s\n"
              "   Beim Aktualisieren einer Schrift die Datei neu erzeugen, nicht von Hand pflegen. */\n" % url)
    (OUT / ("%s.css" % name)).write_text(header + "\n".join(out_lines) + "\n", encoding="utf-8")
    print("%-12s → %s.css" % (name, name))

# Variable Schriften liefern EINE Datei für alle Gewichte — dann ist das Gewicht
# im Dateinamen irreführend und fliegt raus.
import collections as _c
weights = _c.defaultdict(set)
for css in OUT.glob("*.css"):
    for b in re.findall(r"@font-face\s*\{(.*?)\}", css.read_text(encoding="utf-8"), re.S):
        u = re.search(r"url\(\./([^)]+)\)", b)
        w = re.search(r"font-weight:\s*([^;]+);", b)
        if u and w:
            weights[u.group(1)].add(w.group(1).strip())
rename = {f: re.sub(r"-(\d+)-([a-z0-9-]+\.woff2)$", r"-\2", f)
          for f, w in weights.items() if len(w) > 1}
for old, new in rename.items():
    (OUT / old).rename(OUT / new)
for css in OUT.glob("*.css"):
    t = css.read_text(encoding="utf-8")
    for old, new in rename.items():
        t = t.replace("./" + old, "./" + new)
    css.write_text(t, encoding="utf-8")
if rename:
    print("%d Dateien ohne Gewicht im Namen (variable Schriften)" % len(rename))

total = sum(stats.values())
print("\n%d Schriftdateien, %.1f KB gesamt" % (len(downloaded), total / 1024))
for fam, size in sorted(stats.items(), key=lambda kv: -kv[1]):
    print("  %-22s %6.1f KB" % (fam, size / 1024))
