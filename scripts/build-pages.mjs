import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { trainingAssets } from './assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '_site');
// Only the generated, named output directory inside this checkout may be removed.
if (output !== join(root, '_site') || dirname(output) !== root) throw new Error('Unsafe output directory.');
const config = JSON.parse(await readFile(join(root, 'pages.config.json'), 'utf8'));
const backend = new URL(config.apiOrigin);
if (backend.protocol !== 'https:' || backend.origin !== config.apiOrigin) throw new Error('apiOrigin must be a plain HTTPS origin.');
const escape = value => value.replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const [url, file] of trainingAssets) {
  const target = join(output, url === '/' ? 'index.html' : url.slice(1));
  await mkdir(dirname(target), { recursive: true });
  if (url === '/') {
    const source = await readFile(join(root, file), 'utf8');
    if (source.includes('name="training-api-origin"')) throw new Error('Duplicate API origin configuration.');
    await writeFile(target, source.replace('</head>', `  <meta name="training-api-origin" content="${escape(config.apiOrigin)}">\n</head>`));
  } else await copyFile(join(root, file), target);
}
await writeFile(join(output, '.nojekyll'), '');
await mkdir(join(output, 'admin'), { recursive: true });
const admin = escape(`${config.apiOrigin}/admin`);
await writeFile(join(output, 'admin', 'index.html'), `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${admin}"><title>Panel administratora</title></head>
<body><p><a href="${admin}">Otwórz panel administratora</a></p></body></html>\n`);
console.log('GitHub Pages build ready in _site. Existing Sites API and administrator panel retained.');
