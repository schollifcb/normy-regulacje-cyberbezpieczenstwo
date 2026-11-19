import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { trainingAssets as assets } from './assets.mjs';

const root = new URL('../', import.meta.url);
const files = await Promise.all(assets.map(async ([path, file, type, encoding = 'utf8']) => [
  path, { type, body: await readFile(new URL(file, root), encoding), ...(encoding === 'base64' ? { base64: true } : {}) },
]));
const worker = await readFile(new URL('worker/index.js', root), 'utf8');
const { allowedOrigins } = JSON.parse(await readFile(new URL('pages.config.json', root), 'utf8'));
const modules = JSON.parse(await readFile(new URL('worker/modules.json', root), 'utf8'));
const taskIds = modules.flatMap((module) => module.tasks.map((task) => task.id));
if (new Set(taskIds).size !== taskIds.length || taskIds.some((id) => !/^[a-z0-9-]+$/.test(id))) {
  throw new Error('Module task IDs must be unique and URL-safe.');
}
const taskPayloads = await Promise.all(taskIds.map(async (id) => [
  id, JSON.parse(await readFile(new URL(`worker/${id}.json`, root), 'utf8')),
]));
const serverDir = new URL('dist/server/', root);
const manifestDir = new URL('dist/.openai/', root);
await mkdir(serverDir, { recursive: true });
await mkdir(manifestDir, { recursive: true });
const bundled = [
  `const assets = ${JSON.stringify(Object.fromEntries(files))};`,
  `const moduleCatalog = ${JSON.stringify(modules)};`,
  `const taskData = ${JSON.stringify(Object.fromEntries(taskPayloads))};`,
  `const pagesOrigins = ${JSON.stringify(allowedOrigins)};`,
  worker,
].join('\n');
await writeFile(new URL('index.js', serverDir), bundled);
await copyFile(new URL('.openai/hosting.json', root), new URL('hosting.json', manifestDir));
