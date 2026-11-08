const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../out");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain" };
http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/NextQuest/")) { res.writeHead(404).end(); return; }
  let rel;
  try { rel = decodeURIComponent(url.pathname.slice("/NextQuest/".length)); } catch { res.writeHead(400).end(); return; }
  let file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404).end(); return; } res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }).end(data); });
}).listen(4173, "127.0.0.1", () => console.log("Demo: http://127.0.0.1:4173/NextQuest/"));
