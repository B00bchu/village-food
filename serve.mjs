import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const types = {
  'index.html': 'text/html; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'app.mjs': 'text/javascript; charset=utf-8',
  'model.mjs': 'text/javascript; charset=utf-8',
  'sw.js': 'text/javascript; charset=utf-8',
  'app.webmanifest': 'application/manifest+json',
  'icon-192.png': 'image/png',
  'icon-512.png': 'image/png',
  'market-hero.webp': 'image/webp',
  'food-rice.webp': 'image/webp',
  'food-noodles.webp': 'image/webp',
  'food-dessert.webp': 'image/webp',
  'food-tea.webp': 'image/webp',
};
const port = Number(process.env.PORT ?? 4173);
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const name = path === '/' ? 'index.html' : path.slice(1);
  if (!Object.hasOwn(types, name)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const bytes = await readFile(new URL('./' + name, import.meta.url));
    response.writeHead(200, { 'Content-Type': types[name] }).end(bytes);
  } catch {
    response.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => console.log('http://localhost:' + port));
