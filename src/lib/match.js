// Title matching between TMDB and Arabic site listings like
//   "فيلم Oppenheimer 2023 مترجم اون لاين" / "مسلسل Breaking Bad الموسم الخامس الحلقة 16"
const { unesc, toLatinDigits } = require("./html");

function normAr(s) {
  let t = toLatinDigits(unesc(s));
  try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
  return t
    .replace(/[ً-ٰٟـ]/g, "")         // harakat + tatweel
    .replace(/[أإآٱ]/g, "ا")      // alef variants
    .replace(/ى/g, "ي")                          // alef maqsura -> yaa
    .replace(/ة/g, "ه")                          // taa marbuta -> haa
    .toLowerCase();
}

// Arabic ordinals; longest first so "الحادي عشر" wins over "الحادي"
const ORD_WORDS = [
  ["الاول", 1], ["الثاني", 2], ["الثالث", 3], ["الرابع", 4], ["الخامس", 5], ["السادس", 6], ["السابع", 7],
  ["الثامن", 8], ["التاسع", 9], ["العاشر", 10], ["الحادي عشر", 11], ["الثاني عشر", 12], ["الثالث عشر", 13],
  ["الرابع عشر", 14], ["الخامس عشر", 15], ["السادس عشر", 16], ["السابع عشر", 17], ["الثامن عشر", 18],
  ["التاسع عشر", 19], ["العشرون", 20],
].map((x) => [normAr(x[0]), x[1]]).sort((a, b) => b[0].length - a[0].length);
const ORD_ALT = ORD_WORDS.map((x) => x[0]).join("|");

const SEASON_RE = new RegExp(`(?:الموسم|الجزء|موسم|season|part|s)\\s*[:\\-]?\\s*(\\d{1,2}(?!\\d)|${ORD_ALT})`, "i");
const EPISODE_RE = /(?:الحلقه|حلقه|episode|ep|e)\s*[:\-]?\s*(\d{1,4})(?!\d)/i;

function ordValue(w) {
  if (/^\d+$/.test(w)) return +w;
  const hit = ORD_WORDS.find((x) => x[0] === w);
  return hit ? hit[1] : null;
}

function seasonOf(text) {
  const t = normAr(text);
  const m = SEASON_RE.exec(t);
  return m ? ordValue(m[1]) : null;
}

function episodeOf(text) {
  const m = EPISODE_RE.exec(normAr(text));
  return m ? +m[1] : null;
}

const NOISE = /(?:^|\s)(?:فيلم|افلام|مسلسل|مسلسلات|انمي|برنامج|عرض|مترجم|مترجمه|مدبلج|مدبلجه|مدبلجة|كامل|كامله|اون\s*لاين|اونلاين|حصريا|بجوده|عاليه|مشاهده|تحميل|والاخيره|الاخيره|الاخير|و?الاخيرة|hd|fhd|full|online|web-dl|webrip|bluray|brrip|hdrip|hdcam|cam|1080p|720p|480p|360p|4k|uhd|arabic|subbed|dubbed)(?=\s|$)/g;

function cleanTitle(t) {
  let s = normAr(t)
    .replace(/[–—|_]+/g, " ")
    .replace(new RegExp(`(?:الموسم|الجزء|season|part)\\s*[:\\-]?\\s*(?:\\d{1,2}(?!\\d)|${ORD_ALT})`, "g"), " ")
    .replace(/(?:الحلقه|حلقه|episode|ep)\s*[:\-]?\s*\d{1,4}(?:\s*(?:و|-|to)\s*\d{1,4})?/g, " ")
    .replace(/\b(?:s\d{1,2}e\d{1,4}|s\d{1,2}|e\d{1,4})\b/g, " ");
  for (const [w] of ORD_WORDS) s = s.split(w + "ه").join(" ").split(w).join(" "); // "الثانيه" (fem.) then "الثاني"
  s = s.replace(/(?:^|\s)(?:الحاديه|الحادي|عشر|عشره|والعشرون|العشرون)(?=\s|$)/g, " ");
  s = s.replace(/[^\w؀-ۿ\s]+/g, " ").replace(NOISE, " ").replace(NOISE, " ");
  return s.replace(/\s+/g, " ").trim();
}

const yearIn = (t) => {
  const all = toLatinDigits(t).match(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/g) || [];
  const y = all.length ? parseInt(all[all.length - 1].replace(/\D/g, ""), 10) : NaN;
  return y >= 1920 && y <= 2100 ? y : null;
};

const compact = (s) => s.replace(/\s+/g, "");
const stripYear = (s) => s.replace(/\b(?:19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();

function prepWanted(titles) {
  const out = [];
  const seen = {};
  for (const t of titles) {
    const c = stripYear(cleanTitle(t));
    const k = compact(c);
    if (k.length < 2 || seen[k]) continue;
    seen[k] = 1;
    out.push({ c, k, words: c.split(" ").filter(Boolean) });
  }
  return out;
}

// 0..100 similarity between a listing title and any wanted title.
// "Kimi no Na wa (Your name)" is also scored as "Kimi no Na wa" and as "Your name".
function titleScore(candidate, wanted) {
  const raw = String(candidate || "");
  const parts = [raw];
  const paren = /\(([^()]{2,})\)/.exec(raw);
  if (paren && !/^\s*(?:19|20)\d{2}\s*$/.test(paren[1])) {
    parts.push(raw.replace(paren[0], " "));
    parts.push(raw.replace(/\([^()]*\)/, " ").replace(/^(\S*\s)?[\s\S]*$/, "$1") + paren[1]); // keep a leading "فيلم"
  }
  let best = 0;
  for (const p of parts) best = Math.max(best, titleScoreOne(p, wanted));
  return best;
}

function titleScoreOne(candidate, wanted) {
  const c = stripYear(cleanTitle(candidate));
  const ck = compact(c);
  if (!ck) return 0;
  const cw = c.split(" ").filter(Boolean);
  let best = 0;
  for (const w of wanted) {
    if (w.k === ck) return 100;
    const short = Math.min(ck.length, w.k.length);
    const long = Math.max(ck.length, w.k.length);
    if (short >= 4 && (ck.indexOf(w.k) >= 0 || w.k.indexOf(ck) >= 0)) best = Math.max(best, Math.round(55 + 35 * short / long));
    if (w.words.length >= 2) {
      const hit = w.words.filter((x) => cw.indexOf(x) >= 0).length;
      const ratio = hit / Math.max(w.words.length, cw.length);
      if (ratio >= 0.6) best = Math.max(best, Math.round(40 + 50 * ratio));
    }
  }
  return best;
}

/**
 * Rank site listings [{title, ...}] against TMDB info. Year in the listing (if any) must be within
 * `yearSlack` of TMDB's year for movies; for series the year is only a tie-breaker.
 */
function rank(cands, info, opts) {
  const o = opts || {};
  const wanted = prepWanted(info.titles.slice(0, 30));
  const minScore = o.minScore || 70;
  const slack = o.yearSlack == null ? 1 : o.yearSlack;
  return cands
    .map((c) => {
      const score = titleScore(c.title, wanted);
      const y = c.year || yearIn(c.title);
      let s = score;
      // "انمي One Piece" vs live-action "مسلسل One Piece": the label decides between same-name shows
      if (s > 0 && info.isAnime != null) {
        const tagged = /(?:^|\s)انمي|\banime\b/i.test(normAr(c.title));
        if (info.isAnime && tagged) s += 6;
        if (!info.isAnime && tagged) s -= 30;
      }
      if (y && info.year) {
        const diff = Math.abs(y - info.year);
        if (info.type === "movie" && diff > slack) s = 0;
        else s += diff === 0 ? 5 : 0;
      }
      return Object.assign({}, c, { score: s, year: y || null });
    })
    .filter((c) => c.score >= minScore)
    // ties: the plainest title wins ("Jujutsu Kaisen" over "Jujutsu Kaisen: Shimetsu Kaiyuu")
    .sort((a, b) => b.score - a.score || cleanTitle(a.title).length - cleanTitle(b.title).length);
}

// search queries to try, best first: English, Arabic, original, then a couple of alternates
function queries(info, max) {
  const out = [];
  const add = (q) => {
    const v = String(q || "").replace(/[:\-–—!?.,'"()]+/g, " ").replace(/\s+/g, " ").trim();
    if (v.length >= 2 && out.indexOf(v) < 0) out.push(v);
  };
  add(info.title);
  if (info.isAnime && info.romaji) add(info.romaji); // "Kimi no Na wa" rather than "Your Name"
  if (info.titleAr) {
    // WordPress search doesn't fold hamza: "أرطغرل" misses "ارطغرل", so try the folded spelling first
    const folded = info.titleAr.replace(/[أإآ]/g, "ا");
    add(folded);
    add(info.titleAr);
  }
  if (/^[\x00-\x7f]+$/.test(info.original) || /[؀-ۿ]/.test(info.original)) add(info.original);
  for (const t of info.titles.slice(3)) if (/^[\x00-\x7f]+$/.test(t) || /[؀-ۿ]/.test(t)) add(t);
  return out.slice(0, max || 3);
}

module.exports = { normAr, cleanTitle, seasonOf, episodeOf, yearIn, titleScore, prepWanted, rank, queries };
