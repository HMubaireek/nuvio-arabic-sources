// Release-name parsing and matching for files in a TorBox library:
//   "Al.Sada.Al.Afadel.2025.1080p.YANGO.WEB-DL.DDP5.1.H.264-FIGHTER.mkv"
//   "[ArabP2P].El.Gawahergy.2026.1080p.YANGO.WEB-DL.H.264-Mody"
//   "El.Nos.2025.S01.1080p.ADTV.WEB-DL.AAC2.0.H.264-FIGHTER/El.Nos.S01E03.1080p....mkv"
const { normAr } = require("../lib/match");
const { arabicSkeleton, latinSkeleton } = require("../lib/translit");

const VIDEO_EXT = /\.(?:mkv|mp4|m4v|avi|mov|wmv|ts|m2ts|webm|mpg|mpeg|flv)$/i;

// tokens that end the title part of a release name
const STOP = /^(?:(?:19|20)\d{2}|s\d{1,2}(?:e\d{1,4})?|\d{1,2}x\d{1,3}|season|series|complete|ep?\d{1,4}|episode|part|\d{3,4}p|4k|uhd|hdr|web|webrip|web-?dl|bluray|blu-ray|bdrip|brrip|hdrip|dvdrip|hdtv|remux|x26[45]|h26[45]|hevc|avc|repack|proper|extended|uncut|imax|multi|dual|arabic|ar|الموسم|الحلقه|حلقه)$/i;

function baseName(path) {
  return String(path || "").split("/").pop().replace(VIDEO_EXT, "");
}

// "www.site.com - Title (2020) ..." / "[Group] Title ..." -> "Title (2020) ..."
function stripPrefix(name) {
  return String(name || "")
    .replace(/^\s*(?:\[[^\]]*\]|\([^)]*\)|【[^】]*】)[\s._-]*/g, "")
    .replace(/^\s*www\.[^\s]+\s*-\s*/i, "")
    .trim();
}

function parseRelease(rawName) {
  const name = stripPrefix(baseName(rawName));
  const tokens = normAr(name).replace(/[()[\]{}]/g, " ").split(/[\s._]+|-(?=[a-z؀-ۿ])/i).filter(Boolean);
  const title = [];
  for (let i = 0; i < tokens.length; i++) {
    // a year can be part of the title only when it opens it ("2012", "1917")
    // ... or when the release year follows it ("Blade Runner 2049 (2017)")
    const yearInTitle = /^(?:19|20)\d{2}$/.test(tokens[i]) && /^(?:19|20)\d{2}$/.test(tokens[i + 1] || "");
    if (STOP.test(tokens[i]) && title.length && !yearInTitle) break;
    title.push(tokens[i]);
  }
  const plain = normAr(name).replace(/[._]/g, " ");
  const ym = /(?:^|[^\d])((?:19|20)\d{2})(?!\d)/.exec(plain.slice(title.join(" ").length));
  return { title: title.join(" ").replace(/[^\w؀-ۿ ]+/g, " ").replace(/\s+/g, " ").trim(), year: ym ? +ym[1] : null };
}

// season / episode from a file path, with the pack (torrent) name as a fallback for the season
function episodeInfo(path, packName) {
  const s = normAr(String(path || "")).replace(/[._]/g, " ");
  // multi-episode files: S02E05E06 / S02E05-E06 / S02E05-06
  let m = /\bs(\d{1,2})\s?e(\d{1,4})(?:-?e(\d{1,4})|-(\d{1,3})(?![\dp]))?/i.exec(s);
  if (m) {
    const last = +(m[3] || m[4] || m[2]);
    return { season: +m[1], episode: +m[2], last: last >= +m[2] && last - +m[2] < 10 ? last : +m[2] };
  }
  m = /\b(\d{1,2})x(\d{1,3})\b/.exec(s);
  if (m) return { season: +m[1], episode: +m[2], last: +m[2] };
  m = /season\s?(\d{1,2})\s?(?:episode|ep)\s?(\d{1,4})/i.exec(s);
  if (m) return { season: +m[1], episode: +m[2], last: +m[2] };
  const packSeason = (() => {
    const p = normAr(String(packName || "") + " " + s).replace(/[._]/g, " ");
    const k = /\bs(\d{1,2})\b|season\s?(\d{1,2})/i.exec(p);
    return k ? +(k[1] || k[2]) : null;
  })();
  m = /\b(?:episode|ep|e)\s?(\d{1,4})\b/i.exec(baseName(s)) || /(?:الحلقه|حلقه)\s?(\d{1,4})/.exec(baseName(s)) || /\s-\s(\d{1,4})(?:\s|$)/.exec(baseName(s));
  if (m) return { season: packSeason, episode: +m[1], last: +m[1] };
  return null;
}

function looksLikeSeries(path, packName) {
  const s = (String(packName || "") + " " + String(path || "")).replace(/[._]/g, " ");
  return /\bs\d{1,2}(?:e\d{1,4})?\b|\bseason\s?\d|\b\d{1,2}x\d{2}\b|\bcomplete series\b|الموسم|الحلقه|الحلقة/i.test(s);
}

const latinKey = (s) => normAr(s).replace(/&/g, " and ").replace(/[^a-z0-9؀-ۿ]+/g, " ").replace(/^(?:the|a)\s+/, "").trim();

// every way the wanted item can be written in a release name
function wantedKeys(info) {
  const exact = {};
  const skel = {};
  for (const t of info.titles || []) {
    const k = latinKey(t);
    if (k) exact[k] = 1;
    // "Title: Subtitle" releases often drop the subtitle
    const head = latinKey(String(t).split(/[:\-–]/)[0]);
    if (head && head.length >= 4 && head !== k) exact[head] = 1;
    const sk = /[؀-ۿ]/.test(t) ? arabicSkeleton(t) : latinSkeleton(t);
    // very short skeletons ("ns") are only trusted together with the year / episode gates
    if (sk && sk.replace(/ /g, "").length >= 2) skel[sk] = 1;
  }
  return { exact, skel };
}

// 2 = exact title, 1 = transliteration skeleton, 0 = no match
function titleMatch(release, keys) {
  if (!release.title) return 0;
  if (keys.exact[latinKey(release.title)]) return 2;
  const sk = /[؀-ۿ]/.test(release.title) ? arabicSkeleton(release.title) : latinSkeleton(release.title);
  return sk && keys.skel[sk] ? 1 : 0;
}

// "النص التاني" / "El Nos El Tani" / "Title 2" / "Title II" -> "النص" / "El Nos" / "Title" (null when not a sequel title).
// Metadata sources disagree on sequels: AIOMetadata (TVDB) lists "El Nos" with both seasons under the IMDb id
// that TMDB maps to the separate show "El Nos El Tani", so plugins get the sequel's TMDB id with the parent's numbering.
function sequelBase(title) {
  const t = String(title || "").trim();
  const ar = /^(.{2,}?)\s+(?:ال)?(?:تاني|تانى|ثاني|ثانى|٢)$/.exec(normAr(t));
  if (ar) return ar[1].trim();
  const la = /^(.{2,}?)\s+(?:(?:el|al)[\s-]+(?:tani|tany|thani|thany)|2|ii|part\s*(?:2|two|ii))$/i.exec(t);
  return la ? la[1].trim() : null;
}

function qualityOf(name) {
  const s = String(name || "");
  if (/\b(?:2160p|4k|uhd)\b/i.test(s)) return 2160;
  if (/\b1440p\b/i.test(s)) return 1440;
  if (/\b1080[pi]\b/i.test(s)) return 1080;
  if (/\b720p\b/i.test(s)) return 720;
  if (/\b576p\b/i.test(s)) return 576;
  if (/\b480p\b/i.test(s)) return 480;
  if (/\b360p\b/i.test(s)) return 360;
  return 0;
}

function tagsOf(name) {
  const s = String(name || "");
  const tags = [];
  if (/\b(?:dv|dovi|dolby\s?vision)\b/i.test(s)) tags.push("DV");
  if (/\bhdr10\+|\bhdr10plus\b/i.test(s)) tags.push("HDR10+");
  else if (/\bhdr(?:10)?\b/i.test(s)) tags.push("HDR");
  if (/\b(?:x265|h\.?265|hevc)\b/i.test(s)) tags.push("HEVC");
  else if (/\bav1\b/i.test(s)) tags.push("AV1");
  if (/\bremux\b/i.test(s)) tags.push("REMUX");
  else if (/\bblu-?ray\b/i.test(s)) tags.push("BluRay");
  else if (/\bweb-?dl\b/i.test(s)) tags.push("WEB-DL");
  else if (/\bwebrip\b/i.test(s)) tags.push("WEBRip");
  if (/\batmos\b/i.test(s)) tags.push("Atmos");
  return tags;
}

module.exports = { VIDEO_EXT, parseRelease, episodeInfo, looksLikeSeries, wantedKeys, titleMatch, sequelBase, qualityOf, tagsOf, baseName };
