// Personal TorBox build with the API key embedded, for Nuvio's Android TV app (it runs plugins with
// SCRAPER_SETTINGS but has no screen to set them). Writes a tiny plugin repository: manifest.json + torbox.js.
//   npm run build && node scripts/build-personal.js <file-with-api-key> [outDir=personal]
// Host the two files somewhere private (e.g. a secret gist) and add that manifest URL in Nuvio.
// Anyone with the URL can use the key, so never commit the output (personal/ is git-ignored).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const keyFile = process.argv[2];
const outDir = path.resolve(process.argv[3] || path.join(ROOT, "personal"));
if (!keyFile) {
  console.error("usage: node scripts/build-personal.js <file-with-api-key> [outDir]");
  process.exit(2);
}
const apiKey = fs.readFileSync(keyFile, "utf8").trim();
if (!/^[0-9a-f-]{20,}$/i.test(apiKey)) throw new Error("that doesn't look like a TorBox API key");

// TorBox isn't in the public manifest (it needs an API key), so its metadata lives here
const pkg = require(path.join(ROOT, "package.json"));
const base = {
  id: "torbox",
  name: "TorBox",
  description: "Plays files already in your TorBox library (torrents, usenet, web). Matches English, Arabic and transliterated titles; links are fetched fresh at play time.",
  version: pkg.torbox.version,
  author: "HMubaireek",
  supportedTypes: ["movie", "tv"],
  filename: "providers/torbox.js",
  enabled: true,
  formats: ["mkv", "mp4"],
  logo: "https://www.google.com/s2/favicons?domain=torbox.app&sz=256",
  contentLanguage: ["ar", "en"],
};
const bundle = fs.readFileSync(path.join(ROOT, base.filename), "utf8");

const settings = { apiKey, linkMode: process.env.TORBOX_LINK_MODE || "live" };
const code = `// Personal build: TorBox API key embedded. Do not share this file or its URL.\nglobalThis.TORBOX_EMBEDDED_SETTINGS = ${JSON.stringify(settings)};\n${bundle}`;

const personal = {
  name: "TorBox (personal)",
  version: base.version,
  scrapers: [Object.assign({}, base, {
    id: "torbox-personal",
    name: "TorBox",
    description: "Your TorBox library (API key built in). Matches English, Arabic and transliterated titles; links are fetched fresh at play time.",
    filename: "torbox.js",
    hasSettings: false,
  })],
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(personal, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "torbox.js"), code);
console.log(`personal TorBox build v${base.version} -> ${outDir} (manifest.json, torbox.js)`);
