/**
 * LOKALNE PROXY JSON-RPC Z PONAWIANIEM - dla Arc mainnet.
 *
 * Jedyny publiczny RPC Arc mainnet 15.09.2026 (rpc.arc-scan.org) oddaje 503
 * mniej wiecej co drugie zapytanie. Pojedyncze skrypty z wlasnym retry
 * przechodza, ale hardhat robi dziesiatki zapytan na wdrozenie i jedno 503
 * przewraca calosc. To proxy stoi miedzy hardhatem a arc-scan i ponawia
 * kazde zapytanie do skutku (max RETRIES), z krotka przerwa.
 *
 * Uzycie (osobne okno):
 *   node scripts/arc/rpc-proxy.js            # nasluchuje na 127.0.0.1:8546
 * a potem:
 *   ARC_MAINNET_RPC_URL=http://127.0.0.1:8546 npm run launchpad:deploy:arc:mainnet
 *
 * Zmienne: UPSTREAM (domyslnie https://rpc.arc-scan.org), PORT (8546), RETRIES (12).
 * Do skasowania, gdy Circle opublikuje stabilne endpointy mainnetu.
 */
const http = require("http");

const UPSTREAM = process.env.UPSTREAM || "https://rpc.mainnet.arc.io";
const PORT = Number(process.env.PORT || 8546);
const RETRIES = Number(process.env.RETRIES || 12);

async function forward(body) {
  let last = "";
  for (let i = 0; i < RETRIES; i++) {
    try {
      const res = await fetch(UPSTREAM, { method: "POST", headers: { "content-type": "application/json" }, body });
      const text = await res.text();
      // arc-scan zwraca 503 z JSON-em o "unreachable" - traktujemy jak brak odpowiedzi.
      if (res.status === 200 && !text.includes("could not complete this request")) return text;
      last = `${res.status} ${text.slice(0, 80)}`;
    } catch (e) {
      last = String(e && e.message);
    }
    await new Promise((r) => setTimeout(r, 400 + i * 300));
  }
  throw new Error(`upstream po ${RETRIES} probach: ${last}`);
}

let n = 0;
http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const id = ++n;
      try {
        const out = await forward(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(out);
      } catch (e) {
        console.error(`#${id} BLAD:`, e.message);
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32603, message: e.message } }));
      }
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`proxy Arc: http://127.0.0.1:${PORT} -> ${UPSTREAM} (retries ${RETRIES})`));
