// Offline unit checks for the shared helpers. Run: node tests/unit.js
const assert = require("assert");
const { unpackAll } = require("../src/lib/unpack");
const { cleanTitle, seasonOf, episodeOf, titleScore, prepWanted, rank } = require("../src/lib/match");
const { findMedia, snapHeight } = require("../src/lib/hosts");
const { b64decode } = require("../src/lib/html");
const { animeSeason, pickEntry } = require("../src/lib/anime");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };

t("unpack p.a.c.k.e.r with escaped quotes", () => {
  const packed = "eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1={2:\\'3://4.5/6.7\\'}',8,8,'var|cfg|file|https|cdn|net|master|m3u8'.split('|'),0,{}))";
  assert.strictEqual(unpackAll(packed), "var cfg={file:'https://cdn.net/master.m3u8'}");
});

t("arabic season/episode parsing", () => {
  assert.strictEqual(seasonOf("مسلسل Breaking Bad الموسم الخامس الحلقة 16"), 5);
  assert.strictEqual(seasonOf("الموسم الحادي عشر"), 11);
  assert.strictEqual(seasonOf("Season 3"), 3);
  assert.strictEqual(episodeOf("مسلسل المؤسس عثمان الحلقة 190"), 190);
  assert.strictEqual(episodeOf("الحلقه ١٢"), 12);
});

t("title cleaning strips noise, season, episode and ordinals", () => {
  assert.strictEqual(cleanTitle("فيلم Oppenheimer 2023 مترجم اون لاين"), "oppenheimer 2023");
  assert.strictEqual(cleanTitle("مسلسل Breaking Bad الموسم الخامس الحلقة 2 الثانية مترجمة"), "breaking bad");
  // hamza seats fold (ؤ -> و) on both sides, so site and TMDB spellings meet
  assert.strictEqual(cleanTitle("مسلسل المؤسس عثمان مدبلج"), cleanTitle("المؤسس عثمان"));
  assert.strictEqual(cleanTitle("المؤسس عثمان"), "الموسس عثمان");
});

t("title scoring + year gate", () => {
  const w = prepWanted(["The Blue Elephant 2", "الفيل الأزرق 2"]);
  assert.strictEqual(titleScore("فيلم الفيل الازرق 2 2019", w), 100);
  const info = { type: "movie", year: 2023, titles: ["Dune"] };
  const r = rank([{ title: "فيلم Dune 1984 مترجم" }, { title: "فيلم Dune 2021 مترجم" }], Object.assign({}, info, { year: 2021 }));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].year, 2021);
});

t("host page scan: jwplayer, streamwish hls2, mixdrop, junk filtered", () => {
  const a = findMedia('jwplayer("x").setup({sources:[{file:"https://c.x/hls/abc/master.m3u8"}],image:"https://c.x/thumb.jpg"})', "https://h.x/e/1");
  assert.deepStrictEqual(a.map((x) => x.url), ["https://c.x/hls/abc/master.m3u8"]);
  const b = findMedia('var links={"hls4":"/stream/abc/master.m3u8","hls2":"https://cdn.y/hls2/01/x_n/master.m3u8?t=1"}', "https://sw.y/e/1");
  // hls4 (embed's own domain) before the hls2 CDN, which can hang
  assert.strictEqual(b[0].url, "https://sw.y/stream/abc/master.m3u8");
  assert.strictEqual(b[1].url, "https://cdn.y/hls2/01/x_n/master.m3u8?t=1");
  const c = findMedia('MDCore.ref="x";MDCore.wurl="//s1.mxcontent.net/v2/abc.mp4?s=1";file="abc.mp4"', "https://mixdrop.ps/e/1");
  assert.deepStrictEqual(c.map((x) => x.url), ["https://s1.mxcontent.net/v2/abc.mp4?s=1"]);
  const d = findMedia('let streamUrl = "https://cdn2.z.shop/?token=abc";', "https://a4u/x");
  assert.strictEqual(d[0].url, "https://cdn2.z.shop/?token=abc");
  assert.strictEqual(d[0].hls, true);
});

t("quality snapping", () => {
  assert.strictEqual(snapHeight(1072), 1080);
  assert.strictEqual(snapHeight(864), 720);
  assert.strictEqual(snapHeight(360), 360);
});

t("base64 without atob", () => {
  assert.strictEqual(b64decode("aHR0cHM6Ly92b2Uuc3gvZS9maHBpeHloZHhmdHk"), "https://voe.sx/e/fhpixyhdxfty");
});

t("anime season entries", () => {
  assert.strictEqual(animeSeason("Jujutsu Kaisen 2nd Season"), 2);
  assert.strictEqual(animeSeason("Attack on Titan Season 3"), 3);
  assert.strictEqual(animeSeason("One Piece"), null);
  const scored = [{ title: "Jujutsu Kaisen (TV)", season: null }, { title: "Jujutsu Kaisen 2nd Season", season: 2 }, { title: "Jujutsu Kaisen 0", season: null }];
  assert.strictEqual(pickEntry(scored, { info: { type: "tv" }, season: 2, episode: 4, absolute: 28 }).entry.title, "Jujutsu Kaisen 2nd Season");
  const op = pickEntry([{ title: "One Piece", season: null }], { info: { type: "tv" }, season: 3, episode: 2, absolute: 79 });
  assert.strictEqual(op.episode, 79);
});

console.log(`\n${n} unit checks passed`);
