// Small helpers shared by source modules.
const { seasonOf, episodeOf, normAr } = require("./match");
const { decodeUri } = require("./html");

const pathKey = (p) => decodeUri(String(p || "")).toLowerCase().replace(/^https?:\/\/[^\/]+/, "").replace(/\/+$/, "");

function uniqBy(list, keyFn) {
  const seen = {};
  const out = [];
  for (const x of list) {
    const k = keyFn(x);
    if (!k || seen[k]) continue;
    seen[k] = 1;
    out.push(x);
  }
  return out;
}

// [{title, href}] season listings -> the one for season `s` (unnumbered single entry counts as S1)
function pickSeason(list, s) {
  const tagged = list.map((x) => Object.assign({}, x, { n: x.n != null ? x.n : seasonOf(x.title + " " + decodeUri(x.href)) }));
  const exact = tagged.filter((x) => x.n === s);
  if (exact.length) return exact[0];
  const plain = tagged.filter((x) => x.n == null);
  if (s === 1 && plain.length) return plain[0];
  return null;
}

// [{title, href}] episode listings -> the one for episode `e`
function pickEpisode(list, e, absolute) {
  const tagged = list.map((x) => Object.assign({}, x, { n: x.n != null ? x.n : episodeOf(x.title) || episodeOf(decodeUri(x.href)) }));
  let hit = tagged.find((x) => x.n === e);
  if (!hit && absolute && absolute !== e) hit = tagged.find((x) => x.n === absolute);
  return hit || null;
}

// does a listing title name the wanted season (or carry no season at all)?
function seasonFits(title, s) {
  const n = seasonOf(title);
  return n == null ? s === 1 || true : n === s;
}

const isArabicText = (s) => /[؀-ۿ]/.test(String(s || ""));

module.exports = { pathKey, uniqBy, pickSeason, pickEpisode, seasonFits, isArabicText, normAr };
