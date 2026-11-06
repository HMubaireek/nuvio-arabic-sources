// One TMDB lookup per request, shared by every source.
const { getJson } = require("./http");

const TMDB_KEY = "1c29a5198ee1854bd5eb45dbe8d17d92"; // public key used across Nuvio community scrapers
const TMDB = "https://api.themoviedb.org/3";

const yearOf = (d) => parseInt(String(d || "").slice(0, 4), 10) || null;

async function tmdbInfo(tmdbId, mediaType) {
  const type = mediaType === "tv" ? "tv" : "movie";
  const d = await getJson(`${TMDB}/${type}/${tmdbId}?api_key=${TMDB_KEY}&language=en-US&append_to_response=alternative_titles,translations,external_ids`, { timeout: 10000, retries: 2 });
  if (!d || (!d.title && !d.name)) throw new Error("tmdb lookup failed");

  const tr = ((d.translations || {}).translations) || [];
  const arT = tr.find((t) => t.iso_639_1 === "ar" && t.data && (t.data.title || t.data.name));
  const titleAr = arT ? (arT.data.title || arT.data.name) : "";
  const alt = d.alternative_titles || {};
  const altList = alt.results || alt.titles || [];
  // romaji / english-script alternates first (anime sites list "Kimi no Na wa." not "Your Name.")
  const latin = (t) => /^[\x20-\x7eÀ-ſ]+$/.test(t || "");
  const romaji = (altList.find((x) => /romaji/i.test(x.type || "") && latin(x.title)) || altList.find((x) => x.iso_3166_1 === "JP" && latin(x.title)) || {}).title || "";
  const alts = altList.slice().sort((a, b) => (latin(b.title) ? 1 : 0) - (latin(a.title) ? 1 : 0)).map((x) => x.title).filter(Boolean);
  const title = d.title || d.name;
  const original = d.original_title || d.original_name || "";

  const seen = {};
  const titles = [];
  for (const t of [title, titleAr, original, romaji].concat(alts)) {
    const v = String(t || "").trim();
    const k = v.toLowerCase();
    if (v && !seen[k]) { seen[k] = 1; titles.push(v); }
  }

  const seasons = (d.seasons || []).filter((s) => s.season_number > 0).map((s) => ({
    number: s.season_number,
    count: s.episode_count || 0,
    year: yearOf(s.air_date),
  }));

  const genres = (d.genres || []).map((g) => g.id);
  return {
    tmdbId: String(tmdbId),
    type,
    title,
    titleAr,
    original,
    romaji,
    titles,
    year: yearOf(d.release_date || d.first_air_date),
    seasons,
    imdbId: (d.external_ids && d.external_ids.imdb_id) || d.imdb_id || "",
    lang: d.original_language || "",
    isAnime: genres.indexOf(16) >= 0 && (d.original_language === "ja" || (d.origin_country || []).indexOf("JP") >= 0),
    isArabic: d.original_language === "ar",
    isTurkish: d.original_language === "tr",
  };
}

// absolute episode number for sites that number episodes continuously across seasons
function absoluteEpisode(info, season, episode) {
  let n = 0;
  for (const s of info.seasons) if (s.number < season) n += s.count;
  return n + episode;
}

module.exports = { tmdbInfo, absoluteEpisode };
