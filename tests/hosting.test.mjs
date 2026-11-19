import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { trainingAssets } from '../scripts/assets.mjs';
import { apiRequest } from '../dist/training-api.js';

const root = new URL('../', import.meta.url);
const config = JSON.parse(await readFile(new URL('pages.config.json', root), 'utf8'));
const modules = JSON.parse(await readFile(new URL('worker/modules.json', root), 'utf8'));
const payloads = Object.fromEntries(await Promise.all(modules.flatMap(module => module.tasks).map(async task =>
  [task.id, JSON.parse(await readFile(new URL(`worker/${task.id}.json`, root), 'utf8'))])));
const workerSource = await readFile(new URL('worker/index.js', root), 'utf8');
const source = `const moduleCatalog=${JSON.stringify(modules)};const taskData=${JSON.stringify(payloads)};const assets={};const pagesOrigins=${JSON.stringify(config.allowedOrigins)};\n${workerSource}`;
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = active => ({ DB: { prepare: () => ({ all: async () => ({ results: [
  { task_id: 'scenarios', active: Number(active), revision: 1 },
] }) }) } });

test('Same-origin Sites and project-path Pages call the existing API without forwarding credentials', async () => {
  const previous = { document: globalThis.document, location: globalThis.location, fetch: globalThis.fetch };
  try {
    let configured = '';
    globalThis.document = { querySelector: () => configured ? { content: configured } : null };
    globalThis.location = { origin: 'https://sites.example', href: 'https://sites.example/#piramida' };
    const calls = [];
    globalThis.fetch = async (url, options) => { calls.push({ url:String(url), options }); return new Response('{}'); };
    await apiRequest('/api/stages', { cache:'no-store' });
    assert.equal(calls[0].url, 'https://sites.example/api/stages');
    configured = config.apiOrigin;
    globalThis.location = { origin: 'https://schollifcb.github.io', href:'https://schollifcb.github.io/normy-regulacje-cyberbezpieczenstwo/' };
    await apiRequest('/api/tasks/risk-commander/reference');
    assert.equal(calls[1].url, `${config.apiOrigin}/api/tasks/risk-commander/reference`);
    assert.equal(calls[1].options.credentials, 'omit');
    assert.throws(() => apiRequest('/admin'), /Unsupported/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('CORS grants only the named Pages origin and preserves release gating and administrator authentication', async () => {
  const origin = 'https://schollifcb.github.io';
  const stages = await worker.fetch(new Request('https://site.example/api/stages', { headers:{Origin:origin} }), env(false));
  assert.equal(stages.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(stages.headers.get('Access-Control-Allow-Credentials'), null);
  const body = await stages.json();
  assert.deepEqual(body.modules.map(module => module.tasks.map(task => task.id)), [
    ['definitions','scenarios','risk-commander'], ['piramida','pojecia-praktyka'], ['cyber-advisor'], ['operacja-mydr'],
  ]);
  const request = new Request('https://site.example/api/tasks/scenarios', { headers:{Origin:origin} });
  assert.equal((await worker.fetch(request, env(false))).status, 423);
  assert.equal((await worker.fetch(request, env(true))).status, 200);
  const preflight = await worker.fetch(new Request('https://site.example/api/stages', { method:'OPTIONS', headers:{Origin:origin} }), env(false));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  const denied = await worker.fetch(new Request('https://site.example/api/stages', { method:'OPTIONS', headers:{Origin:'https://unrelated.example'} }), env(false));
  assert.equal(denied.status, 403);
  const other = await worker.fetch(new Request('https://site.example/api/stages', { headers:{Origin:'https://unrelated.example'} }), env(false));
  assert.equal(other.headers.get('Access-Control-Allow-Origin'), null);
  const admin = await worker.fetch(new Request('https://site.example/admin', { headers:{Origin:origin} }), { ...env(false), TRAINING_ADMIN_EMAIL:'admin@example.test' });
  assert.equal(admin.status, 401);
  assert.equal(admin.headers.get('Access-Control-Allow-Origin'), null);
});

test('Pages output preserves all frontend assets, uses relative project links and excludes backend state and custom domain', async () => {
  const build = spawnSync(process.execPath, ['scripts/build-pages.mjs'], { cwd:fileURLToPath(root), encoding:'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const output = new URL('_site/', root);
  for (const [url, file] of trainingAssets) {
    const target = new URL(url === '/' ? 'index.html' : url.slice(1), output);
    const actual = await readFile(target);
    if (url === '/') {
      const text = actual.toString();
      assert.equal((text.match(/name="training-api-origin"/g) ?? []).length, 1);
      assert.ok(text.includes(config.apiOrigin));
      assert.ok(text.includes('CyberSkills'));
      assert.ok(!/\b(?:src|href)="\/(?!\/)/.test(text));
    } else assert.deepEqual(actual, await readFile(new URL(file, root)), url);
    if (url.endsWith('.js')) for (const match of actual.toString().matchAll(/from\s+['"](\.\/[\w.-]+\.js)(?:\?[^'"]*)?['"]/g)) {
      await access(new URL(match[1], output));
    }
  }
  const admin = await readFile(new URL('admin/index.html', output), 'utf8');
  assert.ok(admin.includes(`${config.apiOrigin}/admin`));
  for (const path of ['CNAME','.openai/hosting.json','server/index.js','worker/modules.json','.env']) {
    await assert.rejects(access(new URL(path, output)));
  }
});
