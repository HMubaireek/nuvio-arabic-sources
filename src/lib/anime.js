// Anime sites list each season as its own entry ("Jujutsu Kaisen 2nd Season"), while TMDB keeps one
// show with many seasons (and splits long runners like One Piece into arcs). These helpers pick the
// site entry + episode number for a TMDB (season, episode).
const { normAr, seasonOf, rank, queries } = require("./match");
const { uniqBy } = require("./common");

const ORD_EN = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 };

function animeSeason(title) {
  const t = normAr(title);
  let m = /(\d+)(?:st|nd|rd|th)\s+season/.exec(t) || /season\s*(\d+)/.exec(t) || /\bs(\d+)\b/.exec(t);
  if (m) return +m[1];
  m = /(first|second|third|fourth|fifth|sixth)\s+season/.exec(t);
  if (m) return ORD_EN[m[1]];
  return seasonOf(title) || null;
}

const isExtra = (t) => /recap|special|\bova\b|\bona\b|movie|film|فيلم|\b0\b|picture drama|fanmeeting|- part/i.test(t);

const SEASON_WORDS = /\b\d+(?:st|nd|rd|th)\s+season\b|\bseason\s*\d+\b|\((?:tv)\)/gi;

// rank listings with season words stripped (so "X 2nd Season" still matches TMDB "X")
function rankAnime(pool, info) {
  return rank(pool.map((p) => Object.assign({}, p, { raw: p.title, title: p.title.replace(SEASON_WORDS, " ") })), info, { minScore: 80, yearSlack: 99 })
    .map((p) => Object.assign(p, { title: p.raw, season: animeSeason(p.raw) }));
}

// -> { entry, episode } or null
function pickEntry(scored, ctx) {
  const isMovie = ctx.info.type === "movie";
  if (isMovie) {
    const e = scored.find((c) => /movie|film|فيلم/i.test(c.title)) || scored[0];
    return e ? { entry: e, episode: 1 } : null;
  }
  const main = scored.filter((c) => !isExtra(c.title));
  let entry = main.find((c) => c.season === ctx.season) || (ctx.season === 1 ? main.find((c) => c.season == null) : null);
  if (entry) return { entry, episode: ctx.episode };
  // one long-running entry: TMDB seasons are arcs -> absolute episode number
  entry = main.find((c) => c.season == null);
  return entry ? { entry, episode: ctx.absolute || ctx.episode } : null;
}

// latin-script search terms, romaji first
function animeQueries(info) {
  return uniqBy([info.romaji].concat(queries(info, 6)).filter((q) => q && /^[\x20-\x7e]+$/.test(q)), (q) => q.toLowerCase()).slice(0, 4);
}

module.exports = { animeSeason, isExtra, rankAnime, pickEntry, animeQueries };
