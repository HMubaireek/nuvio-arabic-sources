// Dean Edwards' p.a.c.k.e.r unpacker:
//   eval(function(p,a,c,k,e,d){...}('payload',62,123,'w|o|r|d|s'.split('|'),0,{}))
// Used by most embed hosts (streamwish, vidtube, updown, uqload, mixdrop, filemoon, ...).

const ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function unbase(str, base) {
  if (base <= 36) return parseInt(str, base);
  let n = 0;
  for (let i = 0; i < str.length; i++) n = n * base + ALPHA.indexOf(str.charAt(i));
  return n;
}

// read a single-quoted JS string literal starting at s[i] === "'" ; returns [value, endIndex]
function readQuoted(s, i) {
  let out = "";
  for (let j = i + 1; j < s.length; j++) {
    const c = s.charAt(j);
    if (c === "\\") {
      out += s.charAt(j + 1);
      j++;
      continue;
    }
    if (c === "'") return [out, j + 1];
    out += c;
  }
  return null;
}

function unpackAt(s, start) {
  const head = s.indexOf("}(", start);
  if (head < 0) return null;
  let i = head + 2;
  while (/\s/.test(s.charAt(i))) i++;
  if (s.charAt(i) !== "'") return null;
  const p = readQuoted(s, i);
  if (!p) return null;
  const tail = /^\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'/.exec(s.slice(p[1], p[1] + 40));
  if (!tail) return null;
  const k = readQuoted(s, p[1] + tail[0].length - 1);
  if (!k) return null;
  const a = +tail[1];
  const c = +tail[2];
  const words = k[0].split("|");
  return p[0].replace(/\b\w+\b/g, (w) => {
    const n = unbase(w, a);
    return n < c && words[n] ? words[n] : w;
  });
}

// every packed block in the page, unpacked and joined by newlines ("" if none)
function unpackAll(html) {
  const s = String(html || "");
  const out = [];
  const re = /eval\(function\(p,a,c,k,e,[dr]\)/g;
  let m;
  while ((m = re.exec(s))) {
    try {
      const u = unpackAt(s, m.index);
      if (u) out.push(u);
    } catch (e) {}
  }
  return out.join("\n");
}

module.exports = { unpackAll };
