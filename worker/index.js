const adminHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
};
const knownTasks = new Set(moduleCatalog.flatMap((module) => module.tasks.map((task) => task.id)));
const testModeKey = '@test-mode';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function adminPage(content, status = 200) {
  return new Response(`<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Panel administratora | Normy i regulacje w cyberbezpieczeństwie</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="masthead">
    <div class="wrap masthead-inner">
      <a class="brand admin-link" href="/">Szkolenie z cyberbezpieczeństwa</a>
    </div>
  </header>
  <main class="wrap admin-wrap">
    <section class="panel" aria-labelledby="admin-title">
      <h1 id="admin-title">Panel administratora</h1>
      ${content}
    </section>
  </main>
</body>
</html>`, { status, headers: adminHeaders });
}

async function readAvailability(db) {
  const { results } = await db.prepare('SELECT task_id, active, revision FROM module_task_release').all();
  const releases = new Map(results.map((row) => [row.task_id, row]));
  const mode = releases.get(testModeKey);
  const modules = moduleCatalog.map(({ id, title, tasks }) => ({
    id,
    title,
    tasks: tasks.map((task) => {
      const release = releases.get(task.id);
      return {
        id: task.id,
        title: task.title,
        active: release ? Boolean(release.active) : task.activeByDefault,
        revision: release?.revision ?? 0,
      };
    }),
  }));
  return { modules, testMode: Boolean(mode?.active), testModeRevision: mode?.revision ?? 0 };
}

function renderAdmin({ modules, testMode, testModeRevision }, message = '', status = 200) {
  return adminPage(`
      <p class="lead">Ustaw dostępność zadań w poszczególnych ćwiczeniach.</p>
      ${message ? `<p class="admin-feedback ${status >= 400 ? 'admin-error' : 'good'}" role="status">${escapeHtml(message)}</p>` : ''}
      <section class="case-context admin-test-mode" aria-labelledby="test-mode-title">
        <div>
          <h2 id="test-mode-title">Tryb testowy</h2>
          <p class="admin-mode-state">${testMode ? 'Włączony' : 'Wyłączony'}</p>
          <p>Po włączeniu wszyscy uczestnicy mogą otworzyć dowolne ćwiczenie. Po wyłączeniu znów obowiązują ustawienia poniżej i kolejność zadań.</p>
        </div>
        <form method="post" action="/admin">
          <input type="hidden" name="task" value="${testModeKey}">
          <input type="hidden" name="active" value="${testMode ? 0 : 1}">
          <input type="hidden" name="revision" value="${testModeRevision}">
          <button class="${testMode ? 'admin-secondary' : 'primary'}" type="submit">
            ${testMode ? 'Wyłącz tryb testowy' : 'Włącz tryb testowy'}
          </button>
        </form>
      </section>
      ${modules.map((module) => `<section class="admin-module">
        <h2>${escapeHtml(module.title)}</h2>
        <ol class="admin-stages">
          ${module.tasks.map((task) => `<li class="${task.active || testMode ? 'task-available' : 'task-locked'}">
            <strong>${escapeHtml(task.title)}</strong>
            <span class="task-status">${task.active ? 'Aktywne' : testMode ? 'Dostępne w trybie testowym' : 'Zablokowane'}</span>
            <form method="post" action="/admin">
              <input type="hidden" name="task" value="${escapeHtml(task.id)}">
              <input type="hidden" name="active" value="${task.active ? 0 : 1}">
              <input type="hidden" name="revision" value="${task.revision}">
              <button class="${task.active ? 'admin-secondary' : 'primary'}" type="submit">
                ${task.active ? 'Wyłącz' : 'Aktywuj'} ${escapeHtml(task.id === 'risk-commander' ? task.title : task.title.toLocaleLowerCase('pl'))}
              </button>
            </form>
          </li>`).join('')}
        </ol>
      </section>`).join('')}
      <a class="admin-link admin-signout" href="/signout-with-chatgpt?return_to=%2Fadmin" target="_top">Wyloguj się</a>
  `, status);
}

async function updateRelease(request, db, url) {
  if (request.headers.get('Origin') !== url.origin) {
    return adminPage('<p class="lead">Otwórz panel bezpośrednio w przeglądarce i spróbuj ponownie.</p>', 403);
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) {
    return adminPage('<p class="lead">Nie można odczytać formularza.</p>', 415);
  }
  const form = await request.formData();
  const taskId = form.get('task');
  const active = form.get('active');
  const revision = Number(form.get('revision'));
  if ((!knownTasks.has(taskId) && taskId !== testModeKey) || (active !== '0' && active !== '1')
    || !form.has('revision') || !Number.isSafeInteger(revision) || revision < 0) {
    return renderAdmin(await readAvailability(db), 'Odśwież panel i spróbuj ponownie.', 400);
  }
  const result = await db.prepare(`
    INSERT INTO module_task_release (task_id, active, revision)
    SELECT ?, ?, 1 WHERE ? = 0 OR EXISTS (SELECT 1 FROM module_task_release WHERE task_id = ?)
    ON CONFLICT (task_id) DO UPDATE SET
      active = excluded.active, revision = module_task_release.revision + 1
    WHERE module_task_release.revision = ?
  `).bind(taskId, Number(active), revision, taskId, revision).run();
  if (result.meta.changes === 0) {
    return renderAdmin(await readAvailability(db), 'Ustawienia zmieniły się w innym oknie. Sprawdź aktualny stan.', 409);
  }
  const resultKey = taskId === testModeKey ? 'test-mode' : 'updated';
  return new Response(null, { status: 303, headers: { Location: `/admin?result=${resultKey}`, 'Cache-Control': 'no-store' } });
}

async function handleAdmin(request, env, url) {
  const adminEmail = env.TRAINING_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) return adminPage('<p class="lead">Konto administratora nie jest jeszcze skonfigurowane.</p>', 503);
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!userId) {
    return adminPage(`
      <p class="lead">Zaloguj się kontem ChatGPT przypisanym do panelu.</p>
      <a class="primary admin-signout" href="/signin-with-chatgpt?return_to=%2Fadmin" target="_top">Zaloguj się przez ChatGPT</a>
    `, 401);
  }
  if (email !== adminEmail) {
    return adminPage(`
      <p class="lead">To konto nie ma dostępu do panelu administratora.</p>
      <a class="admin-link admin-signout" href="/signout-with-chatgpt?return_to=%2Fadmin" target="_top">Wyloguj się</a>
    `, 403);
  }
  if (request.method === 'POST') return updateRelease(request, env.DB, url);
  if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  const result = url.searchParams.get('result');
  const message = result === 'test-mode' ? 'Zapisano ustawienie trybu testowego.'
    : result === 'updated' ? 'Zapisano dostępność zadania.' : '';
  return renderAdmin(await readAvailability(env.DB), message);
}

function publicData(request, value, status = 200) {
  const origin = request.headers.get('Origin');
  const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
  if (pagesOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return request.method === 'HEAD' || value == null
    ? new Response(null, { status, headers })
    : Response.json(value, { status, headers });
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/admin' || url.pathname === '/admin/') return handleAdmin(request, env, url);
  if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    const origin = request.headers.get('Origin');
    if (!pagesOrigins.includes(origin)) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Cache-Control, Pragma', Vary: 'Origin',
    } });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  if (url.pathname === '/api/stages') {
    const availability = await readAvailability(env.DB);
    const { testMode } = availability;
    const modules = availability.modules.map(({ id, title, tasks }) => ({
      id, title, tasks: tasks.map(({ id, title, active }) => ({ id, title, active })),
    }));
    // Retain the old fields for participants who have the preceding version open.
    const scenariosActive = testMode || modules.flatMap((module) => module.tasks).some((task) => task.id === 'scenarios' && task.active);
    return publicData(request, { modules, testMode, scenariosActive, tasks: [] });
  }
  const reference = url.pathname === '/api/tasks/risk-commander/reference';
  const taskPath = url.pathname.match(/^\/api\/tasks\/([a-z0-9-]+)$/);
  const taskId = reference ? 'risk-commander' : url.pathname === '/api/scenarios' ? 'scenarios' : taskPath?.[1];
  if (taskId && knownTasks.has(taskId)) {
    const { modules, testMode } = await readAvailability(env.DB);
    const task = modules.flatMap((module) => module.tasks).find((entry) => entry.id === taskId);
    if (!testMode && !task.active) return publicData(request, null, 423);
    const data = taskData[taskId];
    return publicData(request, reference ? data.reference : taskId === 'risk-commander' ? { risks: data.risks } : data);
  }

  const path = url.pathname === '/index.html' ? '/' : url.pathname;
  if (!Object.hasOwn(assets, path)) return new Response('Nie znaleziono strony.', { status: 404 });
  const asset = assets[path];
  const body = request.method === 'HEAD' ? null
    : asset.base64 ? Uint8Array.from(atob(asset.body), character => character.charCodeAt(0)) : asset.body;
  return new Response(body, {
    headers: { 'Content-Type': asset.base64 ? asset.type : `${asset.type}; charset=utf-8`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  });
}

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Training request failed', error);
      return new Response('Wystąpił błąd. Spróbuj ponownie za chwilę.', {
        status: 500, headers: { 'Cache-Control': 'no-store' },
      });
    }
  },
};
