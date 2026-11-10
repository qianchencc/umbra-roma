import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const base = process.cwd();
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (req,res)=>{
  const path = decodeURIComponent((req.url||'/').split('?')[0]);
  const file = resolve(base, '.' + (path === '/' ? '/index.html' : path));
  if(file !== base && !file.startsWith(base + sep)){res.writeHead(403);res.end('Forbidden');return;}
  try { const body = await readFile(file); res.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(body); }
  catch { res.writeHead(404);res.end('Not found'); }
}).listen(port,()=>console.log(`UMBRA available at http://localhost:${port}`));