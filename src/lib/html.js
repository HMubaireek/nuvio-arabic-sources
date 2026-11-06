// Regex-level HTML helpers. Pages here are flat WordPress themes, so attribute/anchor scanning is
// enough and keeps the bundle dependency-free (no cheerio needed inside Nuvio).

function unesc(s) {
  return String(s == null ? "" : s)
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

const stripTags = (s) => unesc(String(s || "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function attr(tag, name) {
  const re = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const m = re.exec(tag);
  return m ? unesc(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]) : "";
}

const hasClass = (tag, cls) => (" " + attr(tag, "class").replace(/\s+/g, " ") + " ").indexOf(" " + cls + " ") >= 0;

// all opening tags of a kind: [{tag, index}]
function tags(html, name) {
  const re = new RegExp(`<${name}\\b(?:"[^"]*"|'[^']*'|[^'">])*>`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ tag: m[0], index: m.index });
  return out;
}

// anchors with href, title attr and inner text
function anchors(html) {
  const out = [];
  const re = /<a\b((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const open = "<a" + m[1] + ">";
    const href = attr(open, "href");
    if (!href) continue;
    out.push({ href, title: attr(open, "title"), text: stripTags(m[2]), cls: attr(open, "class"), inner: m[2], tag: open, index: m.index });
  }
  return out;
}

// slice of html starting at the first match of `startRe`, `len` chars long (cheap "scope" for sections)
function section(html, startRe, len) {
  const m = startRe.exec(html);
  return m ? html.slice(m.index, m.index + (len || 20000)) : "";
}

const toLatinDigits = (s) => String(s || "")
  .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660)
  .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0);

function decodeUri(s) {
  try { return decodeURIComponent(s); } catch (e) { return s; }
}

// base64 -> latin1 string without depending on atob/Buffer (Hermes builds differ)
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64decode(input) {
  const s = String(input || "").replace(/-/g, "+").replace(/_/g, "/").replace(/[^A-Za-z0-9+\/]/g, "");
  let out = "";
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((buf >> bits) & 0xff);
    }
  }
  try { return decodeURIComponent(escape(out)); } catch (e) { return out; } // utf-8 when possible
}

module.exports = { unesc, stripTags, attr, hasClass, tags, anchors, section, toLatinDigits, decodeUri, b64decode };
