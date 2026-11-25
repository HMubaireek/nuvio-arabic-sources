// TorBox provider tests.
//   node tests/torbox.js            offline: matching against real release names from a TorBox library
//   TORBOX_API_KEY=... node tests/torbox.js --live [tmdbId type season episode]
//                                   the BUILT providers/torbox.js in a Nuvio-like sandbox, real account
const assert = require("assert");
const R = require("../src/torbox/release");
const { matches } = require("../src/torbox/index");
const { arabicSkeleton, latinSkeleton } = require("../src/lib/translit");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };

const torrent = (id, name, files) => ({
  k: { kind: "torrents", label: "Torrent", idParam: "torrent_id" },
  it: { id, name, download_present: true, files: (files || [name]).map((f, i) => ({ id: i, name: f, size: 1e9 })) },
});
const pack = (id, folder, eps, fmt) => torrent(id, folder, eps.map((e) => `${folder}/${fmt(e)}`));
const pad = (x) => String(x).padStart(2, "0");

const LIB = [
  torrent(1, "Al.Sada.Al.Afadel.2025.1080p.YANGO.WEB-DL.DDP5.1.H.264-FIGHTER.mkv"),
  pack(2, "The.Gentlemen.S01.1080p.NF.WEB-DL.DDP5.1.Atmos.H.264-FLUX", [1, 2, 3], (e) => `The.Gentlemen.S01E${pad(e)}.Some.Title.1080p.NF.WEB-DL.DDP5.1.Atmos.H.264-FLUX.mkv`),
  torrent(3, "The.Gentlemen.2019.2160p.UHD.BluRay.x265-TERMINAL", ["The.Gentlemen.2019.2160p.UHD.BluRay.x265-TERMINAL/The.Gentlemen.2019.2160p.UHD.BluRay.x265-TERMINAL.mkv", "The.Gentlemen.2019.2160p.UHD.BluRay.x265-TERMINAL/Sample/sample.mkv"]),
  torrent(4, "[ArabP2P].El.Gawahergy.2026.1080p.YANGO.WEB-DL.H.264-Mody", ["[ArabP2P].El.Gawahergy.2026.1080p.YANGO.WEB-DL.H.264-Mody.mkv"]),
  pack(5, "El.Nos.2025.S01.1080p.ADTV.WEB-DL.AAC2.0.H.264-FIGHTER", [1, 2, 3, 4], (e) => `El.Nos.2025.S01E${pad(e)}.1080p.ADTV.WEB-DL.AAC2.0.H.264-FIGHTER.mkv`),
  pack(6, "El.Nos.S01.1080p.YANGO.WEB-DL.AAC2.0.x264-POWER", [1, 2, 3, 4], (e) => `El.Nos.S01E${pad(e)}.1080p.YANGO.WEB-DL.AAC2.0.x264-POWER.mkv`),
  pack(7, "Мастер Омюр  Omur Usta  Сезон 1  Серии 1-2 из  [2026, WEBRip 1080p] DVO (DeziDenizi)", [1, 2], (e) => `Omur Usta.s01.e${pad(e)}.WEB-DLRip1080p.mkv`),
  torrent(8, "Dexter Resurrection S02E01 Risky Business 2160p ATV WEB-DL DDP5 1 Atmos DV HDR H 265-FLUX [ UIndex.org ]", [
    "www.UIndex.org    -    Dexter Resurrection S02E01 Risky Business 2160p ATV WEB-DL DDP5 1 Atmos DV HDR H 265-FLUX/Dexter Resurrection S02E01 Risky Business 2160p ATV WEB-DL DDP5 1 Atmos DV HDR H 265-FLUX.mkv",
    "www.UIndex.org    -    Dexter Resurrection S02E01 Risky Business 2160p ATV WEB-DL DDP5 1 Atmos DV HDR H 265-FLUX/Dexter Resurrection S02E01 Risky Business 2160p ATV WEB-DL DDP5 1 Atmos DV HDR H 265-FLUX.mkv.nfo",
  ]),
  torrent(9, "Mickey 17 2025 bluray hdr 2160p av1 5 1 eac3 Dust"),
];
const ids = (ms) => ms.map((m) => `${m.it.id}:${m.f.id}`).sort();

t("skeletons: Arabic title meets its transliteration", () => {
  assert.strictEqual(arabicSkeleton("السادة الأفاضل"), latinSkeleton("Al Sada Al Afadel"));
  assert.strictEqual(arabicSkeleton("الجواهرجي"), latinSkeleton("El Gawahergy"));
  assert.strictEqual(arabicSkeleton("النص"), latinSkeleton("El Nos"));
  assert.notStrictEqual(arabicSkeleton("السادة الأفاضل"), latinSkeleton("The Gentlemen"));
});

t("release parsing", () => {
  assert.deepStrictEqual(R.parseRelease("Al.Sada.Al.Afadel.2025.1080p.YANGO.WEB-DL.DDP5.1.H.264-FIGHTER.mkv"), { title: "al sada al afadel", year: 2025 });
  assert.deepStrictEqual(R.parseRelease("[ArabP2P].El.Gawahergy.2026.1080p.YANGO.WEB-DL.H.264-Mody"), { title: "el gawahergy", year: 2026 });
  assert.deepStrictEqual(R.parseRelease("www.UIndex.org    -    Dexter Resurrection S02E01 Risky/x.mkv").title, "x");
  assert.strictEqual(R.parseRelease("Blade Runner 2049 (2017) 1080p").title, "blade runner 2049");
  assert.strictEqual(R.parseRelease("2012.2009.1080p.BluRay").title, "2012");
  assert.deepStrictEqual(R.episodeInfo("Omur Usta.s01.e02.WEB-DLRip1080p.mkv"), { season: 1, episode: 2, last: 2 });
  assert.deepStrictEqual(R.episodeInfo("Show.S02E05E06.mkv"), { season: 2, episode: 5, last: 6 });
  assert.strictEqual(R.qualityOf("Mickey 17 2025 bluray hdr 2160p av1"), 2160);
});

t("Arabic movie whose English title collides (السادة الأفاضل = The Gentlemen 2025)", () => {
  const info = { type: "movie", year: 2025, title: "The Gentlemen", titles: ["The Gentlemen", "السادة الأفاضل", "Al Sada Al Afadel", "السادة الافاضل", "الساده الافاضل"], seasons: [] };
  assert.deepStrictEqual(ids(matches(LIB, info, "movie")), ["1:0"]);
});

t("English movie with the same name (The Gentlemen 2019) skips the series and the 2025 film", () => {
  const info = { type: "movie", year: 2019, title: "The Gentlemen", titles: ["The Gentlemen"], seasons: [] };
  assert.deepStrictEqual(ids(matches(LIB, info, "movie")), ["3:0"]); // sample.mkv excluded
});

t("English series episode from a season pack", () => {
  const info = { type: "tv", year: 2024, title: "The Gentlemen", titles: ["The Gentlemen"], seasons: [{ number: 1, count: 8 }] };
  assert.deepStrictEqual(ids(matches(LIB, info, "tv", 1, 3)), ["2:2"]);
  assert.deepStrictEqual(ids(matches(LIB, info, "tv", 2, 3)), []);
});

t("Arabic-only titles via transliteration (movie + series)", () => {
  const movie = { type: "movie", year: 2026, title: "The Jeweler", titles: ["The Jeweler", "الجواهرجي"], seasons: [] };
  assert.deepStrictEqual(ids(matches(LIB, movie, "movie")), ["4:0"]);
  const show = { type: "tv", year: 2025, title: "The Script", titles: ["The Script", "النص"], seasons: [{ number: 1, count: 15 }] };
  assert.deepStrictEqual(ids(matches(LIB, show, "tv", 1, 3)), ["5:2", "6:2"]);
});

t("Latin title inside a non-Latin pack name, and junk files", () => {
  const omur = { type: "tv", year: 2026, title: "Ömür Usta", titles: ["Omur Usta", "Ömür Usta"], seasons: [{ number: 1, count: 10 }] };
  assert.deepStrictEqual(ids(matches(LIB, omur, "tv", 1, 2)), ["7:1"]);
  const dexter = { type: "tv", year: 2025, title: "Dexter: Resurrection", titles: ["Dexter: Resurrection"], seasons: [{ number: 1, count: 10 }, { number: 2, count: 10 }] };
  assert.deepStrictEqual(ids(matches(LIB, dexter, "tv", 2, 1)), ["8:0"]); // .nfo skipped
});

console.log(`${n} offline checks passed`);

if (process.argv.indexOf("--live") >= 0) live();

function live() {
  const vm = require("vm");
  const fs = require("fs");
  const path = require("path");
  const nodeFetch = require("node-fetch");
  const key = process.env.TORBOX_API_KEY || (process.env.TORBOX_API_KEY_FILE && fs.readFileSync(process.env.TORBOX_API_KEY_FILE, "utf8").trim());
  if (!key) { console.error("set TORBOX_API_KEY (or TORBOX_API_KEY_FILE) for --live"); process.exit(2); }
  const code = fs.readFileSync(path.join(__dirname, "..", "providers", "torbox.js"), "utf8");
  let queue = Promise.resolve();
  const fetch = (url, init) => {
    const run = () => nodeFetch(url, Object.assign({ timeout: 30000 }, init)).then(
      (res) => res.text().then((body) => ({ status: res.status, ok: res.ok, url: res.url, headers: { get: (k) => res.headers.get(k) }, text: () => Promise.resolve(body), json: () => Promise.resolve(JSON.parse(body)) })),
      () => ({ status: 0, ok: false, url, headers: { get: () => null }, text: () => Promise.resolve(""), json: () => Promise.reject(new Error("no body")) }));
    const p = queue.then(run, run);
    queue = p.then(() => {}, () => {});
    return p;
  };
  const args = process.argv.slice(process.argv.indexOf("--live") + 1);
  const cases = args.length ? [args] : [["1489674", "movie"], ["522627", "movie"]];
  (async () => {
    let failed = 0;
    for (const [id, type, s, e] of cases) {
      for (const mode of ["live", "resolved"]) {
        const logs = [];
        const box = { fetch, console: { log: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push("ERR " + a.join(" ")), warn: () => {} }, module: { exports: {} }, SCRAPER_SETTINGS: { apiKey: key, linkMode: mode } };
        box.exports = box.module.exports;
        box.globalThis = box;
        vm.createContext(box);
        vm.runInContext(code, box, { filename: "torbox.js" });
        const layout = box.module.exports.onSettings();
        assert.ok(layout.some((f) => f.key === "apiKey"), "onSettings exposes apiKey");
        const streams = await box.module.exports.getStreams(id, type, s && +s, e && +e);
        let playable = 0;
        for (const st of streams.slice(0, 2)) {
          const r = await nodeFetch(st.url, { headers: { Range: "bytes=0-1023" }, timeout: 30000 }).catch(() => null);
          if (r && (r.status === 206 || r.status === 200)) playable++;
        }
        const ok = streams.length > 0 && playable > 0;
        if (!ok) failed++;
        console.log(`${ok ? "PASS" : "FAIL"} ${type} ${id}${s ? ` S${s}E${e}` : ""} [${mode}]: ${streams.length} streams, ${playable} probed playable`);
        for (const st of streams.slice(0, 4)) console.log("   ", st.title.replace(/\n/, " | "));
        for (const l of logs) console.log("   ·", l.replace(/token=[^&\s]+/g, "token=…"));
      }
    }
    process.exit(failed ? 1 : 0);
  })();
}
