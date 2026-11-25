// Consonant "skeletons" so an Arabic title and its loose Latin transliteration in a release name meet:
//   "السادة الأفاضل"  -> "sd fdl"  <-  "Al.Sada.Al.Afadel"
//   "الجواهرجي"       -> "ghrg"    <-  "El.Gawahergy"
// Vowels, long-vowel letters (ا و ي / w y), the article (ال / al el) and taa marbuta are dropped, and
// letters that are romanised several ways share one class (ج = g/j, ق = k/q, ز/ذ/ظ/ض = d/z, ...).
const { normAr } = require("./match");

const AR = {
  "ب": "b", "ت": "t", "ث": "t", "ج": "g", "ح": "h", "خ": "k", "د": "d", "ذ": "d", "ر": "r", "ز": "d",
  "س": "s", "ش": "s", "ص": "s", "ض": "d", "ط": "t", "ظ": "d", "غ": "g", "ف": "f", "ق": "k", "ك": "k",
  "ل": "l", "م": "m", "ن": "n", "ه": "h", "پ": "b", "چ": "g", "ڤ": "f", "گ": "g",
};

const collapse = (s) => s.replace(/(.)\1+/g, "$1");

function arabicSkeleton(text) {
  const words = normAr(text).split(/[^؀-ۿ]+/).filter(Boolean);
  return words.map((w) => {
    let x = w;
    if (x.length > 3 && x.slice(0, 2) === "ال") x = x.slice(2);
    else if (x.length > 4 && (x.slice(0, 3) === "وال" || x.slice(0, 3) === "بال")) x = x.slice(3);
    // final haa is usually taa marbuta (normAr folds ة -> ه), romanised as a vowel
    if (x.length > 2 && x.slice(-1) === "ه") x = x.slice(0, -1);
    return collapse(x.split("").map((c) => AR[c] || "").join(""));
  }).filter(Boolean).join(" ");
}

function latinSkeleton(text) {
  const words = String(text || "").toLowerCase().replace(/[`'’3]/g, "").split(/[^a-z]+/).filter(Boolean);
  return words.filter((w) => !/^(?:al|el|il|ul)$/.test(w)).map((w) => {
    let x = w.replace(/^(?:al|el)-/, "");
    x = x.replace(/kh/g, "k").replace(/sh/g, "s").replace(/ch/g, "s").replace(/th/g, "t").replace(/dh/g, "d").replace(/gh/g, "g");
    // word-final "ah"/"eh" is taa marbuta
    x = x.replace(/([aeiou])h$/, "$1");
    x = x.replace(/j/g, "g").replace(/[qc]/g, "k").replace(/z/g, "d").replace(/v/g, "f").replace(/p/g, "b").replace(/x/g, "ks");
    return collapse(x.replace(/[aeiouyw]/g, ""));
  }).filter(Boolean).join(" ");
}

module.exports = { arabicSkeleton, latinSkeleton };
