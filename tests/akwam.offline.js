// Offline Akwam test: real pages captured from akwam.ss (tests/fixtures/akwam) + a synthetic
// go.* redirector chain, served by a mocked fetch. Run: node tests/akwam.offline.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const fx = (f) => fs.readFileSync(path.join(__dirname, "fixtures", "akwam", f), "utf8");

const SEARCH = fx("search.html");
const MOVIE = fx("movie.html");
const WATCH = fx("watch.html");

// 1) direct: link-show -> /watch/... (has <source>)
// 2) redirect: link-show -> go.ak.sv/watch/1 -> page with a.download-link -> akwam.ss/watch/... (has <source>)
const REDIRECT_MOVIE = MOVIE.replace(/https:\/\/akwam\.ss\/watch\/180909\/11389\/fight-against-evil-3/g, "https://go.ak.sv/watch/777");
const GO_PAGE = `<html><body><div class="content"><a href="https://akwam.ss/watch/180909/11389/fight-against-evil-3" class="download-link">اضغط هنا</a></div></body></html>`;

function mockFetch(routes) {
  return async (url) => {
    const u = String(url);
    const hit = routes.find(([re]) => re.test(u));
    const body = hit ? hit[1] : "";
    return { status: hit ? 200 : 404, url: u, headers: { get: () => null }, text: async () => body };
  };
}

const TMDB = {
  title: "Fight Against Evil 3", original_title: "Fight Against Evil 3", release_date: "2026-01-01",
  translations: { translations: [] }, alternative_titles: { titles: [] }, genres: [], original_language: "en",
};

async function run(movieHtml, label) {
  global.fetch = mockFetch([
    [/themoviedb\.org/, JSON.stringify(TMDB)],
    [/akwam\.ss\/search/, SEARCH],
    [/akwam\.ss\/movie\/11389/, movieHtml],
    [/go\.ak\.sv\/watch\/777/, GO_PAGE],
    [/akwam\.ss\/watch\//, WATCH],
  ]);
  delete require.cache[require.resolve("../src/index")];
  const { getStreams } = require("../src/index");
  const log = console.log;
  console.log = () => {};
  const streams = await getStreams(1, "movie", null, null, { only: ["akwam"] });
  console.log = log;
  assert(streams.length >= 3, `${label}: expected 3 files, got ${streams.length}`);
  assert(streams.every((s) => /^http:\/\/s\d+d\d\.downet\.net\//.test(s.url)), `${label}: downet urls must be forced to http`);
  assert.strictEqual(streams[0].quality, "1080p", `${label}: quality must come from the file name (size attr says 720)`);
  assert(streams.some((s) => s.quality === "360p"), `${label}: 360p missing`);
  console.log(`PASS ${label}: ${streams.map((s) => s.quality).join(", ")}`);
}

(async () => {
  await run(MOVIE, "direct watch page");
  await run(REDIRECT_MOVIE, "go.* redirect hop");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
