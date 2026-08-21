// Local dev/test server.
//
// Netlify runs the two functions for us in production. This little server
// does the same job locally so the SAME function code can be exercised and
// tested without deploying. It is not part of the deployed site.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import getDay from './netlify/functions/get-day.js';
import saveDay from './netlify/functions/save-day.js';

const PORT = Number(process.env.PORT || 8888);
const PUBLIC = path.join(process.cwd(), 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

async function toNodeResponse(webRes, res) {
  res.statusCode = webRes.status;
  webRes.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await webRes.arrayBuffer()));
}

function toWebRequest(req, body) {
  const url = `http://${req.headers.host || 'localhost'}${req.url}`;
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (pathname === '/api/day' || pathname === '/api/save') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const handler = pathname === '/api/day' ? getDay : saveDay;
    try {
      await toNodeResponse(await handler(toWebRequest(req, body)), res);
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'handler_threw', detail: String(err) }));
    }
    return;
  }

  // Static files
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  try {
    const data = await fs.readFile(file);
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, () => console.log(`dev server on http://localhost:${PORT}`));
