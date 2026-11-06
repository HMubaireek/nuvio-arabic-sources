// Static decoder for javascript-obfuscator output ("string array" + base64 encoding + rotation + wrapper
// functions), as used by FaselHD's player. Nothing from the page is executed: string literals and pure
// numeric arithmetic are parsed as data, and every call to the string-array decoder is replaced by its
// value, so URLs assembled as 'https://r4'+_0xab(0x1,0x2,0x3,0x4)+'.m3u8' become readable.

const ID = "_0x[0-9a-fA-F]+";

// ---------- string literals ----------
function readString(s, i) {
  const q = s.charAt(i);
  let out = "";
  for (let j = i + 1; j < s.length; j++) {
    const c = s.charAt(j);
    if (c === "\\") {
      const n = s.charAt(j + 1);
      if (n === "x") { out += String.fromCharCode(parseInt(s.substr(j + 2, 2), 16)); j += 3; continue; }
      if (n === "u") { out += String.fromCharCode(parseInt(s.substr(j + 2, 4), 16)); j += 5; continue; }
      out += n === "n" ? "\n" : n === "t" ? "\t" : n === "r" ? "\r" : n;
      j++;
      continue;
    }
    if (c === q) return { value: out, end: j + 1 };
    out += c;
  }
  return null;
}

// ---------- numeric expressions: 0x1f, 12, .75, + - * / unary, parens, parseInt(call) ----------
function evalExpr(src, callFn) {
  let i = 0;
  const s = String(src);
  const ws = () => { while (/\s/.test(s.charAt(i))) i++; };
  function primary() {
    ws();
    const c = s.charAt(i);
    if (c === "(") { i++; const v = expr(); ws(); if (s.charAt(i) !== ")") throw new Error("paren"); i++; return v; }
    if (c === "-") { i++; return -primary(); }
    if (c === "+") { i++; return +primary(); }
    if (c === "!") { i++; return !primary(); }
    if (c === "'" || c === '"') { const r = readString(s, i); i = r.end; return r.value; }
    let m = /^(0x[0-9a-fA-F]+|\d*\.\d+|\d+)/.exec(s.slice(i));
    if (m) { i += m[0].length; return m[0].indexOf("0x") === 0 ? parseInt(m[0], 16) : parseFloat(m[0]); }
    m = /^parseInt\(/.exec(s.slice(i));
    if (m) { i += m[0].length; const v = expr(); ws(); i++; return parseInt(v, 10); }
    m = new RegExp(`^(${ID})\\(`).exec(s.slice(i));
    if (m && callFn) {
      i += m[0].length;
      const args = [];
      for (;;) { ws(); if (s.charAt(i) === ")") { i++; break; } args.push(expr()); ws(); if (s.charAt(i) === ",") i++; }
      return callFn(m[1], args);
    }
    if (/^!!\[\]/.test(s.slice(i))) { i += 4; return true; }
    if (/^!\[\]/.test(s.slice(i))) { i += 3; return false; }
    throw new Error(`unexpected ${s.slice(i, i + 12)}`);
  }
  function term() {
    let v = primary();
    for (;;) {
      ws();
      const c = s.charAt(i);
      if (c === "*") { i++; v = v * primary(); } else if (c === "/") { i++; v = v / primary(); } else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      ws();
      const c = s.charAt(i);
      if (c === "+") { i++; v = v + term(); } else if (c === "-") { i++; v = v - term(); } else return v;
    }
  }
  const v = expr();
  ws();
  if (i < s.length) throw new Error(`trailing ${s.slice(i, i + 12)}`);
  return v;
}

// balanced (...) starting at s[i] === "("
function balanced(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s.charAt(j);
    if (c === "'" || c === '"') { const r = readString(s, j); if (!r) return -1; j = r.end - 1; continue; }
    if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return j;
  }
  return -1;
}

const ALPHA = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";
function b64(str) {
  let bits = 0, buf = 0, bytes = "";
  for (let k = 0; k < str.length; k++) {
    const v = ALPHA.indexOf(str.charAt(k));
    if (v < 0 || v === 64) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes += "%" + ("00" + ((buf >> bits) & 0xff).toString(16)).slice(-2); }
  }
  try { return decodeURIComponent(bytes); } catch (e) { return unescape(bytes); }
}

/**
 * decodeScript(js) -> js with every string-array lookup replaced by a string literal (or null when the
 * script isn't in the expected shape).
 */
function decodeScript(js) {
  const s = String(js || "");
  // 1. string array: function _0xA(){var _0xB=['..','..'];_0xA=function(){return _0xB;};return _0xA();}
  const arrM = new RegExp(`function (${ID})\\(\\)\\{var ${ID}=\\[`).exec(s);
  if (!arrM) return null;
  const arrName = arrM[1];
  const arr = [];
  let i = arrM.index + arrM[0].length;
  for (;;) {
    while (/[\s,]/.test(s.charAt(i))) i++;
    if (s.charAt(i) === "]") break;
    const r = readString(s, i);
    if (!r) return null;
    arr.push(r.value);
    i = r.end;
  }

  // 2. decoder: function _0xD(a,b){var x=_0xA();return _0xD=function(c,d){c=c-(EXPR);var e=x[c];...
  const decM = new RegExp(`function (${ID})\\(${ID},${ID}\\)\\{var ${ID}=${arrName}\\(\\);return \\1=function\\((${ID}),${ID}\\)\\{\\2=\\2-\\(([^;]+?)\\);`).exec(s);
  if (!decM) return null;
  const decName = decM[1];
  const offset = evalExpr(decM[3]);

  // 3. wrappers: function _0xW(p,q,r,t){return _0xD|_0xV(r - -0xbf, t);}  (may chain to other wrappers)
  const wrappers = {};
  const wre = new RegExp(`function (${ID})\\((${ID}(?:,${ID})*)\\)\\{return (${ID})\\((${ID})\\s*([-+])\\s*([^,]+?),(${ID})\\);\\}`, "g");
  let m;
  while ((m = wre.exec(s))) {
    const params = m[2].split(",");
    let delta;
    try { delta = evalExpr(m[6]); } catch (e) { continue; }
    wrappers[m[1]] = { params, target: m[3], idx: params.indexOf(m[4]), sign: m[5], delta, keyIdx: params.indexOf(m[7]) };
  }

  const lookup = (n) => b64(arr[n - offset]);
  function call(name, args) {
    if (name === decName) return lookup(args[0]);
    const w = wrappers[name];
    if (!w) throw new Error(`unknown fn ${name}`);
    const v = w.sign === "-" ? args[w.idx] - w.delta : args[w.idx] + w.delta;
    return call(w.target, [v, args[w.keyIdx]]);
  }

  // 4. rotation: (function(_0xA,TARGET){... while(!![]){try{var x=EXPR;if(x===TARGET)break;...}}(_0xArr,TARGETEXPR))
  const rotM = new RegExp(`while\\(!!\\[\\]\\)\\{try\\{var ${ID}=([\\s\\S]+?);if\\(${ID}===${ID}\\)break;`).exec(s);
  const tgtM = new RegExp(`\\}\\(${arrName},([^)]+?)\\)\\);`).exec(s);
  if (!rotM || !tgtM) return null;
  const target = evalExpr(tgtM[1]);
  let ok = false;
  for (let n = 0; n <= arr.length; n++) {
    try { if (evalExpr(rotM[1], call) === target) { ok = true; break; } } catch (e) {}
    arr.push(arr.shift());
  }
  if (!ok) return null;

  // 5. replace every decoder / wrapper call with a literal
  const names = [decName].concat(Object.keys(wrappers));
  const callRe = new RegExp(`(${names.join("|")})\\(`, "g");
  let out = "";
  let last = 0;
  while ((m = callRe.exec(s))) {
    if (/[\w$]/.test(s.charAt(m.index - 1)) || /function\s*$/.test(s.slice(Math.max(0, m.index - 9), m.index))) continue;
    const close = balanced(s, m.index + m[1].length);
    if (close < 0) continue;
    let v;
    try { v = evalExpr(s.slice(m.index, close + 1), call); } catch (e) { continue; }
    if (typeof v !== "string") continue;
    out += s.slice(last, m.index) + JSON.stringify(v);
    last = close + 1;
    callRe.lastIndex = close + 1;
  }
  return out + s.slice(last);
}

// every run of literals joined by + ('a'+"b"+'c' -> "abc")
function joinedStrings(js) {
  const s = String(js || "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);
    if (c !== "'" && c !== '"') { i++; continue; }
    let r = readString(s, i);
    if (!r) { i++; continue; }
    let val = r.value;
    let j = r.end;
    for (;;) {
      const m = /^\s*\+\s*/.exec(s.slice(j, j + 8));
      if (!m) break;
      const k = j + m[0].length;
      const q = s.charAt(k);
      if (q !== "'" && q !== '"') break;
      const r2 = readString(s, k);
      if (!r2) break;
      val += r2.value;
      j = r2.end;
    }
    out.push(val);
    i = j;
  }
  return out;
}

module.exports = { decodeScript, joinedStrings, evalExpr };
