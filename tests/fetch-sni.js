// node-fetch with Android/OkHttp TLS behaviour: SNI comes from the URL's hostname, never from a Host
// header. Node derives SNI from the Host header, which would defeat the fronting in src/lib/http.js.
const https = require("https");
const nodeFetch = require("node-fetch");

const agents = {};
function sniFetch(url, init) {
  const o = Object.assign({}, init || {});
  const h = o.headers || {};
  const hostHeader = h.Host || h.host;
  const m = /^https:\/\/([^\/?#:]+)/i.exec(String(url));
  if (hostHeader && m && m[1].toLowerCase() !== String(hostHeader).toLowerCase()) {
    const sni = m[1].toLowerCase();
    o.agent = agents[sni] || (agents[sni] = new https.Agent({ servername: sni, keepAlive: true }));
  }
  return nodeFetch(url, o);
}
module.exports = sniFetch;
