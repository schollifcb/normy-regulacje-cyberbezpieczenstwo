import { apiRequest } from './training-api.js';
import { createRiskCommander } from './risk-commander.js?v=dual-hosting';
import { createCyberAdvisor } from './cyber-advisor.js?v=exercise-cards';
import { createPyramid } from './pyramid.js?v=exercise-cards';
import { createCaseStudy } from './operation-mydr.js?v=operation-mydr';

const shapes = {
  shield: '<path d="M12 22s7-3 7-10V5l-7-3-7 3v7c0 7 7 10 7 10Z"/><path d="m9 12 2 2 4-4"/>',
  box: '<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z"/><path d="m3 8 9 5 9-5m-9 5v8m-4.5-15.5 9 5"/>',
  warning: '<path d="M10.3 4.2 2.6 18a1.5 1.5 0 0 0 1.3 2.2h16.2a1.5 1.5 0 0 0 1.3-2.2L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3v.1"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0m-4 8v2"/>',
  gauge: '<path d="M4.5 18a9 9 0 1 1 15 0Zm7.5-3 4-5"/><path d="M6.5 14h.1M12 7h.1m5.3 7h.1"/>',
  pulse: '<path d="M2 12h5l3-7 4 14 3-7h5"/>',
  hospital: '<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M12 7v8m-4-4h8m-7 10v-3h6v3"/>',
  bank: '<path d="m3 9 9-6 9 6H3Zm2 11h14M7 12v5m5-5v5m5-5v5"/>',
  cart: '<path d="M2 4h3l2.5 11h11l2.5-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  camera: '<rect x="3" y="6" width="13" height="10" rx="2"/><path d="m16 10 5-3v8l-5-3m-9 4-2 4m7-4v4"/>',
  school: '<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v6c3 3 9 3 12 0v-6m4-2v7"/>',
  grip: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" stroke-width="3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  cross: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  stack: '<path d="m3 8 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5m-18 4 9 5 9-5"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name]}</svg>`;
}

const categories = [
  { id: 'aktywo', name: 'Aktywo', icon: 'box' },
  { id: 'zagrozenie', name: 'Zagrożenie', icon: 'warning' },
  { id: 'podatnosc', name: 'Podatność', icon: 'lock' },
  { id: 'ryzyko', name: 'Ryzyko', icon: 'gauge' },
  { id: 'skutek', name: 'Skutek', icon: 'pulse' },
];

let scenarios = {};
let scenarioEntries = [];
const scenarioIds = ['szpital', 'bank', 'uczelnia'];
const completedScenarios = new Set();
const previousOrders = new Map();

function makeRound(entries, deckId) {
  const cards = categories.map(({ id }, index) => ({ id, text: entries[index][0], hint: entries[index][1] }));
  const answerOrder = cards.map((card) => card.id).join(',');
  const orderKey = `cyber-risk-card-order:${deckId}`;
  let previousOrder = previousOrders.get(deckId);
  try {
    previousOrder ??= sessionStorage.getItem(orderKey);
  } catch {
    // Keep the order in memory if browser storage is unavailable.
  }
  let order;
  do {
    for (let index = cards.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [cards[index], cards[other]] = [cards[other], cards[index]];
    }
    order = cards.map((card) => card.id).join(',');
  } while (order === previousOrder || order === answerOrder);
  previousOrders.set(deckId, order);
  try {
    sessionStorage.setItem(orderKey, order);
  } catch {
    // The next attempt on this page can still use the in-memory order.
  }
  return { cards, matched: new Set(), selected: null, error: null, lastMatch: false };
}

const screen = document.querySelector('#screen');
const steps = document.querySelector('#steps');
const moduleNav = document.querySelector('#modules');
const announcement = document.querySelector('#announcement');
const stageFeedback = document.querySelector('#stage-feedback');
const progressKey = 'cyber-risk-completed-stages';
let firstRound;
let restoredDefinitions = false;
let scenarioRound;
let round;
let page = 'waiting';
let activeScenarioId = null;
let draggedCard = null;
let modules = [];
let testMode = false;
let moduleId;
let stageTimer;
let checkingStages = false;
let openingStage = false;
const riskCommander = createRiskCommander({ screen, render, announce, summaryAvailable });
const cyberAdvisor = createCyberAdvisor({ screen, render, escapeHtml, icon, showSummary });
const pyramid = createPyramid({ screen, render, escapeHtml, icon, announce, exit: showModuleTasks,
  next: () => openTask('pojecia-praktyka'), nextAvailable: () => taskAvailable('pojecia-praktyka') });
const pyramidPractice = createPyramid({ screen, render, escapeHtml, icon, announce, exit: showModuleTasks, part: 'practice' });
const caseStudy = createCaseStudy({ screen, render, escapeHtml, icon, announce, exit: showModuleTasks });
const advisorHash = '#cyber-advisor';
const pyramidHash = '#piramida';

function linkedTask() {
  if (location.hash.startsWith('#risk-')) return 'risk-commander';
  if (location.hash === advisorHash) return 'cyber-advisor';
  if (location.hash === pyramidHash) return 'piramida';
  if (location.hash === '#pojecia-praktyka') return 'pojecia-praktyka';
  if (location.hash === '#operacja-mydr' || location.hash === '#case-study') return 'operacja-mydr';
}

function restoreProgress() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(progressKey));
    if (!saved) return;
    restoredDefinitions = saved.definitions === true;
    for (const id of scenarioIds) {
      if (Array.isArray(saved.scenarios) && saved.scenarios.includes(id)) completedScenarios.add(id);
    }
  } catch {
    // Progress remains available in memory if browser storage is unavailable.
  }
}

function saveProgress() {
  try {
    sessionStorage.setItem(progressKey, JSON.stringify({
      definitions: definitionsPassed(),
      scenarios: [...completedScenarios],
    }));
  } catch {
    // The current page still keeps the completed stages.
  }
}

function definitionsPassed() {
  return restoredDefinitions || firstRound?.matched.size === categories.length;
}

function scenariosPassed() {
  return completedScenarios.size === scenarioIds.length;
}

const activities = {
  definitions: { pages: ['definitions'], completed: definitionsPassed, open: openDefinitions },
  scenarios: { pages: ['choose', 'scenario'], completed: scenariosPassed, open: openScenarios },
  'risk-commander': {
    pages: ['risk'], completed: riskCommander.completed,
    open(data, { riskStage }) {
      page = 'risk';
      return riskCommander.open(data, riskStage);
    },
  },
  piramida: {
    pages: ['pyramid'], completed: pyramid.completed,
    open(data) {
      pyramid.open(data);
      page = 'pyramid';
    },
  },
  'pojecia-praktyka': {
    pages: ['practice'], completed: pyramidPractice.completed,
    open(data) {
      pyramidPractice.open(data);
      page = 'practice';
    },
  },
  'cyber-advisor': {
    pages: ['advisor'], completed: cyberAdvisor.completed,
    open(data) {
      cyberAdvisor.open(data);
      page = 'advisor';
    },
  },
  'operacja-mydr': {
    pages: ['case-study'], completed: caseStudy.completed,
    open(data) {
      page = 'case-study';
      caseStudy.open(data);
    },
  },
};

function selectedModule() {
  return modules.find((module) => module.id === moduleId);
}

function taskComplete(id) {
  return Boolean(activities[id]?.completed());
}

function taskAvailable(id, module = selectedModule()) {
  const index = module?.tasks.findIndex((task) => task.id === id) ?? -1;
  return index >= 0 && Boolean(activities[id]) && (testMode || (
    module.tasks[index].active && module.tasks.slice(0, index).every((task) => taskComplete(task.id))
  ));
}

function firstAvailableTask(id) {
  const module = modules.find((entry) => entry.id === id);
  return module?.tasks.find((task) => taskAvailable(task.id, module));
}

function moduleComplete() {
  const module = selectedModule();
  return Boolean(module?.tasks.length && module.tasks.every((task) => taskComplete(task.id)));
}

function summaryAvailable() {
  return moduleId === 'intro' ? definitionsPassed() && scenariosPassed() : moduleComplete();
}

function currentTaskId() {
  return Object.keys(activities).find((id) => activities[id].pages.includes(page));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

document.querySelectorAll('[data-icon]').forEach((element) => {
  element.innerHTML = icon(element.dataset.icon);
});

function renderSteps() {
  const module = selectedModule();
  if (!module) return;
  moduleNav.parentElement.hidden = false;
  moduleNav.innerHTML = modules.length === 1
    ? `<h2>${escapeHtml(module.title)}</h2>`
    : modules.map((entry) => {
      const available = entry.tasks.some(({ id }) => taskAvailable(id, entry));
      return `<button type="button" class="module-choice ${available ? 'task-available' : 'task-locked'}"
        data-module="${escapeHtml(entry.id)}" ${entry.id === moduleId ? 'aria-current="true"' : ''}>
        ${escapeHtml(entry.title)}<small>${!entry.tasks.length ? 'W przygotowaniu' : available ? 'Dostępne' : 'Zablokowane'}</small>
      </button>`;
    }).join('');
  const items = module.tasks.map((task) => ({
    id: task.id, label: task.title, current: currentTaskId() === task.id, complete: taskComplete(task.id),
    locked: !taskAvailable(task.id), detail: task.id === 'scenarios' ? `${completedScenarios.size}/${scenarioIds.length}` : '',
  }));
  steps.hidden = module.tasks.length === 0;
  if (module.tasks.length) items.push({ id: 'summary', label: 'Podsumowanie', current: page === 'done', complete: moduleComplete(), locked: !summaryAvailable() });
  steps.innerHTML = items.map(({ id, label, current, complete, locked, detail }, index) => {
    const status = locked ? 'Zablokowane' : detail ? `Dostępne · ${detail}` : 'Dostępne';
    const marker = locked ? icon('lock') : complete ? icon('check') : String(index + 1).padStart(2, '0');
    const availability = locked ? ' task-locked' : ' task-available';
    return `<li><button type="button" data-step="${escapeHtml(id)}"
      class="step${complete ? ' step-complete' : ''}${availability}" ${current ? 'aria-current="step"' : ''} ${locked ? 'disabled' : ''}>
      <span class="step-index" aria-hidden="true">${marker}</span>
      <span class="step-label">${escapeHtml(label)}${status ? ` <span class="step-detail">${status}</span>` : ''}${complete ? '<span class="sr-only">, ukończono</span>' : ''}</span>
    </button>
    </li>`;
  }).join('');
}

function categorySlot(category, index) {
  const match = round.matched.has(category.id);
  const error = round.error?.target === category.id;
  const content = `<span class="category-icon">${icon(category.icon)}</span>
    <span class="category-copy"><span class="category-name">${category.name}</span>
    ${match ? `<span class="matched-text">${round.cards.find(({ id }) => id === category.id).text}</span>` : ''}</span>`;
  const marker = match ? `<span class="marker good">${icon('check')}<span>Dobrze</span></span>` :
    `<span class="slot-index" aria-hidden="true">0${index + 1}</span>`;
  if (match) return `<li class="slot slot-matched">${content}${marker}</li>`;
  return `<li><button type="button" class="slot${error ? ' slot-error' : ''}" data-category="${category.id}">${content}${marker}</button></li>`;
}

function cardTile(card) {
  const selected = round.selected === card.id;
  const error = round.error?.card === card.id;
  return `<li class="card-item">
    <button type="button" class="card" draggable="true" data-card="${card.id}" aria-pressed="${selected}" ${error ? 'aria-describedby="error-hint"' : ''}>
      <span class="grip">${icon('grip')}</span><span>${card.text}</span>
      ${selected ? `<span class="selected-check">${icon('check')}</span>` : ''}
    </button>
    ${error ? `<div class="card-error" id="error-hint"><strong>${icon('cross')}Spróbuj ponownie</strong><p>${card.hint}</p></div>` : ''}
  </li>`;
}

function roundScreen() {
  const isFirst = page === 'definitions';
  const scenario = scenarios[activeScenarioId];
  const count = round.matched.size;
  const full = count === categories.length;
  const selected = round.cards.find(({ id }) => id === round.selected);
  const title = isFirst ? 'Dopasuj definicje' : 'Dopasuj elementy zgłoszenia';
  const instruction = isFirst ? 'Przeciągnij każdą definicję do właściwego pojęcia' : 'Przeciągnij każdą kartę do właściwego pojęcia';
  return `<section class="panel exercise" aria-labelledby="screen-title">
    <div class="panel-heading">
      <div><p class="kicker">RUNDA 0${isFirst ? 1 : 2}</p><h2 id="screen-title" tabindex="-1">${title}</h2>
        <p class="lead" id="board-tip"><span class="desktop-instruction">${instruction} lub wybierz kartę, a potem kategorię.</span><span class="mobile-instruction">Wybierz kartę, a potem kategorię.</span></p></div>
      <div class="progress-box"><span><strong>${count} z ${categories.length}</strong> dopasowań</span>
        <div class="meter" role="progressbar" aria-label="Liczba poprawnych dopasowań" aria-valuemin="0" aria-valuemax="${categories.length}" aria-valuenow="${count}">
          ${categories.map((_, index) => `<i class="${index < count ? 'filled' : ''}" aria-hidden="true"></i>`).join('')}
        </div>
      </div>
    </div>
    ${isFirst ? '' : `<aside class="case-context" aria-label="Kontekst zgłoszenia"><span class="context-icon">${icon(scenario.icon)}</span>
      <div><h3>${scenario.name} · ${scenario.title}</h3><p>${scenario.context}</p></div></aside>`}
    <div class="board${round.selected ? ' card-selected' : ''}" aria-describedby="board-tip">
      <section class="pool" aria-labelledby="cards-title">
        <h3 class="column-heading" id="cards-title">${icon('stack')} Karty do dopasowania <span class="pool-count">${categories.length - count}</span></h3>
        ${round.lastMatch && !full ? `<p class="pool-update" aria-hidden="true">${icon('check')} Dobrze · ${count} z ${categories.length} dopasowań</p>` : ''}
        ${full ? `<div class="empty-pool">${icon('check')}<p>Wszystkie karty dopasowane</p></div>` :
          `<ul class="tiles">${round.cards.filter(({ id }) => !round.matched.has(id)).map(cardTile).join('')}</ul>`}
      </section>
      <section class="targets${count ? ' has-matches' : ''}" aria-labelledby="categories-title">
        <h3 class="column-heading" id="categories-title">${icon('box')} Kategorie</h3>
        ${selected ? `<p class="selection-note">Wybierz kategorię dla zaznaczonej karty.<span class="mobile-selection">${selected.text}</span></p>` : ''}
        <ul class="slots">${categories.map(categorySlot).join('')}</ul>
        ${selected ? '<button type="button" class="change-card" data-action="cancel-card">Zmień kartę</button>' : ''}
      </section>
    </div>
    ${full ? `<div class="actions">
      ${isFirst ? '' : `<p class="round-result">${icon('check')} <span>Scenariusz zaliczony. Ukończono ${completedScenarios.size} z ${scenarioEntries.length} scenariuszy.</span></p>`}
      ${isFirst && !taskAvailable('scenarios') ? '<p class="stage-wait">Definicje ukończone. Poczekaj, aż prowadzący aktywuje scenariusze.</p>' : ''}
      <button class="primary" type="button" data-action="choose" ${taskAvailable('scenarios') ? '' : 'disabled'}>${isFirst ? 'Wybierz scenariusz' : 'Wróć do listy scenariuszy'} ${icon('arrow')}</button>
    </div>` : ''}
  </section>`;
}

function chooseScreen() {
  return `<section class="panel chooser" aria-labelledby="screen-title">
    <div class="panel-heading">
      <div><p class="kicker">RUNDA 02</p><h2 id="screen-title" tabindex="-1">Wybierz scenariusz</h2>
      <p class="lead">Zalicz wszystkie trzy zgłoszenia w dowolnej kolejności, aby ukończyć tę część ćwiczenia.</p></div>
      <p class="scenario-tally">Zaliczone <strong>${completedScenarios.size} z ${scenarioEntries.length}</strong></p>
    </div>
    <div class="scenario-list">${scenarioEntries.map(([id, entry]) => {
      const complete = completedScenarios.has(id);
      return `<button class="scenario-option" type="button" data-scenario="${id}">
        <span class="scenario-icon">${icon(entry.icon)}</span>
        <span class="scenario-label"><strong>${entry.name}</strong><span>${entry.title}</span>
          <span class="scenario-state${complete ? ' good' : ''}">${complete ? icon('check') : ''}${complete ? 'Zaliczony · ćwicz ponownie' : 'Do zaliczenia'}</span>
        </span>
        <span class="scenario-arrow">${icon('arrow')}</span>
      </button>`;
    }).join('')}</div>
    ${summaryAvailable() ? `<div class="actions"><button class="primary" type="button" data-action="summary">Zobacz podsumowanie ${icon('arrow')}</button></div>` : ''}
  </section>`;
}

function doneScreen() {
  const finished = moduleComplete();
  const nextTask = firstAvailableTask('norms');
  return `<section class="panel completion" aria-labelledby="screen-title">
    <span class="completion-icon">${icon('check')}</span>
    <h2 id="screen-title" tabindex="-1">${finished ? `Gratulacje! Ukończono „${escapeHtml(selectedModule().title)}”` : 'Gratulacje! Definicje i scenariusze zaliczone'}</h2>
    ${moduleId === 'intro' ? `<p class="lead">${finished ? 'Analiza Risk Commander zakończona.' : 'Rozróżniasz aktywo, zagrożenie, podatność, ryzyko i skutek oraz potrafisz je rozpoznać w przykładowych zgłoszeniach.'}</p>
      <ul class="scenario-results" aria-label="Zaliczone scenariusze">${['Szpital', 'Bank', 'Uczelnia'].map((name) => `<li>${icon('check')} ${name}</li>`).join('')}</ul>
      <div class="actions rc-summary-actions">
        <button class="primary" type="button" data-action="next-module" ${nextTask ? '' : 'disabled'}>Przejdź do Ćwiczenia 2</button>
        ${!finished && taskAvailable('risk-commander') ? '<button class="primary" type="button" data-action="open-risk">Przejdź do Risk Commander</button>' : ''}
      </div>
      ${!nextTask ? '<p class="stage-wait">Ćwiczenie 2 jest obecnie zablokowane.</p>' : ''}
      ${!finished && !taskAvailable('risk-commander') ? '<p class="stage-wait">Risk Commander czeka na aktywację przez prowadzącego.</p>' : ''}` : ''}
  </section>`;
}

function waitingScreen() {
  const empty = selectedModule()?.tasks.length === 0;
  const available = selectedModule()?.tasks.some((task) => taskAvailable(task.id));
  const text = !modules.length ? 'Sprawdzam dostępność zadań.'
    : empty ? 'Nowe zadanie jest w przygotowaniu.'
    : available ? 'Wybierz dostępne zadanie z górnego paska.'
    : 'Poczekaj, aż prowadzący odblokuje zadanie.';
  return `<section class="panel" aria-labelledby="screen-title">
    <h2 id="screen-title" tabindex="-1">${empty ? escapeHtml(selectedModule().title) : 'Zadania w ćwiczeniu'}</h2>
    <p class="lead">${text}</p>
  </section>`;
}

function render(focusSelector) {
  renderSteps();
  const views = { choose: chooseScreen, done: doneScreen, waiting: waitingScreen,
    risk: riskCommander.screenMarkup, advisor: cyberAdvisor.screenMarkup, pyramid: pyramid.screenMarkup,
    practice: pyramidPractice.screenMarkup,
    'case-study': caseStudy.screenMarkup };
  const view = views[page] ?? roundScreen;
  screen.innerHTML = view();
  if (!focusSelector) return;
  const focusTarget = screen.querySelector(focusSelector);
  if (screen.querySelector('.mobile-selection')?.getClientRects().length) {
    focusTarget?.focus({ preventScroll: true });
    screen.querySelector('.targets').scrollIntoView({ block: 'start' });
  } else {
    focusTarget?.focus();
    screen.querySelector('.card-error')?.scrollIntoView({ block: 'nearest' });
  }
}

function announce(message) {
  announcement.textContent = message;
}

function showStageFeedback(message = '') {
  stageFeedback.textContent = message;
  stageFeedback.hidden = !message;
}

async function refreshStages() {
  if (checkingStages) return;
  checkingStages = true;
  clearTimeout(stageTimer);
  try {
    if (document.hidden) return;
    const response = await apiRequest('/api/stages', { cache: 'no-store' });
    if (!response.ok) return;
    const { modules: updated, testMode: bypass } = await response.json();
    const mode = bypass === true;
    if (!Array.isArray(updated) || (mode === testMode && JSON.stringify(updated) === JSON.stringify(modules))) return;
    const firstLoad = !modules.length;
    const wasReady = taskAvailable('scenarios');
    modules = updated;
    testMode = mode;
    if (!selectedModule()) moduleId = modules[0]?.id;
    const linked = linkedTask();
    if (firstLoad && linked) {
      moduleId = modules.find(({ tasks }) => tasks.some(({ id }) => id === linked))?.id
        ?? modules.find(({ id }) => id === linked)?.id ?? moduleId;
    }
    showStageFeedback();
    const task = currentTaskId();
    if (task && !taskAvailable(task)) {
      endDrag();
      if (page === 'pyramid') pyramid.leave();
      if (page === 'practice') pyramidPractice.leave();
      if (page === 'case-study') caseStudy.leave();
      if (linked) history.replaceState(null, '', location.pathname + location.search);
      page = 'waiting';
      render('#screen-title');
      announce('Prowadzący zablokował dostęp do zadania.');
    } else if (page === 'waiting' || page === 'done' || (page === 'definitions' && definitionsPassed())) {
      render();
    } else {
      renderSteps();
    }
    if (page === 'definitions' && taskAvailable('scenarios') && !wasReady) {
      announce('Scenariusze są dostępne w górnym pasku.');
    }
    if (firstLoad) {
      if (linked && taskAvailable(linked)) {
        await openTask(linked, null, { focus: false, riskStage: location.hash.slice(6), replace: true });
        return;
      }
      const first = selectedModule()?.tasks.find((entry) => taskAvailable(entry.id));
      if (first) await openTask(first.id, null, { focus: false, replace: true });
    }
  } catch {
    // Keep the last confirmed release state until the next check.
    if (!modules.length) showStageFeedback('Nie udało się sprawdzić dostępności ćwiczeń. Spróbujemy ponownie za chwilę.');
  } finally {
    checkingStages = false;
    stageTimer = setTimeout(refreshStages, 5000);
  }
}

async function loadStage(path, button) {
  if (openingStage) return null;
  openingStage = true;
  if (button) button.disabled = true;
  showStageFeedback();
  try {
    const response = await apiRequest(path, { cache: 'no-store' });
    if (response.status === 423) {
      refreshStages();
      showStageFeedback('Ten etap czeka na odblokowanie przez prowadzącego.');
      return null;
    }
    if (!response.ok) throw new Error('Stage request failed.');
    return await response.json();
  } catch {
    showStageFeedback('Nie udało się otworzyć zadania. Spróbuj ponownie za chwilę.');
    return null;
  } finally {
    openingStage = false;
    if (button?.isConnected) button.disabled = false;
  }
}

function openDefinitions(data) {
  if (!firstRound) {
    firstRound = makeRound(data, 'definitions');
    if (restoredDefinitions) {
      for (const category of categories) firstRound.matched.add(category.id);
    }
  }
  round = firstRound;
  page = 'definitions';
}

function openScenarios(data, { choose }) {
  scenarios = data;
  scenarioEntries = Object.entries(scenarios);
  if (scenarioRound && !choose && scenarioRound.matched.size < categories.length) {
    round = scenarioRound;
    page = 'scenario';
  } else {
    page = 'choose';
  }
}

async function openTask(id, button, options = {}) {
  if (!taskAvailable(id)) return;
  const fromModule = moduleId;
  const data = await loadStage(`/api/tasks/${id}`, button);
  if (!data || fromModule !== moduleId || !taskAvailable(id)) return;
  endDrag();
  const previousPage = page;
  if (page === 'pyramid') pyramid.leave();
  if (page === 'practice') pyramidPractice.leave();
  if (page === 'case-study') caseStudy.leave();
  const stage = activities[id].open(data, options);
  if (id === 'risk-commander') {
    const hash = `#risk-${stage}`;
    if (previousPage !== 'risk' && !options.replace) history.replaceState({ trainingPage: previousPage }, '');
    if (location.hash !== hash) history[options.replace ? 'replaceState' : 'pushState'](null, '', hash);
  } else if (['cyber-advisor', 'piramida', 'pojecia-praktyka', 'operacja-mydr'].includes(id)) {
    const hash = `#${id}`;
    if (location.hash !== hash) history[options.replace ? 'replaceState' : 'pushState'](null, '', hash);
  } else if (linkedTask()) {
    history[options.replace ? 'replaceState' : 'pushState']({ trainingPage: page }, '', location.pathname + location.search);
  }
  render(options.focus === false ? null : '#screen-title');
}

function showSummary() {
  if (!summaryAvailable()) return;
  endDrag();
  if (page === 'pyramid') pyramid.leave();
  if (page === 'practice') pyramidPractice.leave();
  if (page === 'case-study') caseStudy.leave();
  if (linkedTask()) history.pushState({ trainingPage: 'done', moduleId }, '', location.pathname + location.search);
  page = 'done';
  render('#screen-title');
}

steps.addEventListener('click', (event) => {
  const button = event.target.closest('[data-step]');
  if (!button || button.disabled) return;
  const id = button.dataset.step;
  if (id === 'summary') showSummary();
  else if (id !== currentTaskId()) openTask(id, button);
});

function showModuleTasks(id = moduleId) {
  endDrag();
  if (page === 'pyramid') pyramid.leave();
  if (page === 'practice') pyramidPractice.leave();
  if (page === 'case-study') caseStudy.leave();
  if (linkedTask()) history.pushState({ moduleId: id }, '', location.pathname + location.search);
  moduleId = id;
  page = 'waiting';
  showStageFeedback();
  render('#screen-title');
}

moduleNav.addEventListener('click', (event) => {
  const id = event.target.closest('[data-module]')?.dataset.module;
  if (!id || id === moduleId || !modules.some((module) => module.id === id)) return;
  showModuleTasks(id);
});

function chooseCard(id) {
  round.selected = round.selected === id ? null : id;
  round.error = null;
  round.lastMatch = false;
  render(round.selected ? '[data-category]' : `[data-card="${id}"]`);
  announce(round.selected ? 'Karta wybrana. Wybierz kategorię.' : 'Wybór karty anulowany.');
}

function matchCard(id, target) {
  if (!taskAvailable(currentTaskId()) || round.matched.has(id) || round.matched.has(target)) return;
  const category = categories.find((entry) => entry.id === target);
  const card = round.cards.find((entry) => entry.id === id);
  if (!card || !category) return;

  round.selected = null;
  round.lastMatch = id === target;
  if (id !== target) {
    round.error = { card: id, target };
    render(`[data-card="${id}"]`);
    announce(`Spróbuj ponownie. ${card.hint}`);
    return;
  }

  round.error = null;
  round.matched.add(id);
  const complete = round.matched.size === categories.length;
  const newlyCompleted = complete && page === 'scenario' && !completedScenarios.has(activeScenarioId);
  if (newlyCompleted) {
    completedScenarios.add(activeScenarioId);
    if (summaryAvailable()) page = 'done';
  }
  if (complete) saveProgress();
  render(complete ? (page === 'done' ? '#screen-title' : '[data-action="choose"]') : '[data-card]');
  const result = newlyCompleted ? ` Zaliczone scenariusze: ${completedScenarios.size} z ${scenarioEntries.length}.` : '';
  announce(`Dobrze. ${category.name}. ${round.matched.size} z ${categories.length} dopasowań.${result}`);
}

screen.addEventListener('click', async (event) => {
  if (page === 'practice') {
    pyramidPractice.click(event);
    return;
  }
  if (page === 'case-study') {
    caseStudy.click(event);
    return;
  }
  if (page === 'pyramid') {
    pyramid.click(event);
    return;
  }
  if (page === 'advisor') {
    cyberAdvisor.click(event);
    return;
  }
  if (page === 'risk') {
    if (event.target.closest('[data-rc-action="summary"]')) {
      showSummary();
      return;
    }
    riskCommander.click(event);
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  const { action, scenario: scenarioId, card, category } = button.dataset;
  if (action === 'choose') {
    await openTask('scenarios', button, { choose: true });
  } else if (action === 'next-module') {
    const task = firstAvailableTask('norms');
    if (!task) return;
    history.replaceState({ moduleId, trainingPage: page }, '');
    showModuleTasks('norms');
    await openTask(task.id);
  } else if (action === 'open-risk') {
    await openTask('risk-commander', button);
  } else if (action === 'summary') {
    showSummary();
  } else if (scenarioId && page === 'choose' && taskAvailable('scenarios') && Object.hasOwn(scenarios, scenarioId)) {
    activeScenarioId = scenarioId;
    scenarioRound = makeRound(scenarios[scenarioId].cards, scenarioId);
    round = scenarioRound;
    page = 'scenario';
    render('#screen-title');
  } else if (action === 'cancel-card' && round.selected) {
    chooseCard(round.selected);
  } else if (card) {
    chooseCard(card);
  } else if (category && round.selected) {
    matchCard(round.selected, category);
  } else if (category) {
    screen.querySelector('[data-card]')?.focus();
    announce('Najpierw wybierz kartę, a potem kategorię.');
  }
});

screen.addEventListener('keydown', (event) => {
  if (page === 'risk' || page === 'advisor' || page === 'pyramid' || page === 'practice' || page === 'case-study') return;
  if (event.key !== 'Escape' || !round?.selected) return;
  event.preventDefault();
  chooseCard(round.selected);
});

screen.addEventListener('dragstart', (event) => {
  if (page === 'case-study') { caseStudy.dragStart(event); return; }
  const card = event.target.closest('[data-card]');
  if (!card) return;
  draggedCard = card.dataset.card;
  event.dataTransfer.setData('text/plain', draggedCard);
  event.dataTransfer.effectAllowed = 'move';
  screen.querySelector('.board').classList.add('dragging');
  card.addEventListener('dragend', endDrag, { once: true });
});

screen.addEventListener('dragover', (event) => {
  if (page === 'case-study') { caseStudy.dragOver(event); return; }
  const target = event.target.closest('[data-category]');
  if (!draggedCard || !target) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  screen.querySelector('.drop-over')?.classList.remove('drop-over');
  target.classList.add('drop-over');
});

screen.addEventListener('dragleave', (event) => {
  const target = event.target.closest('[data-category]');
  if (target && !target.contains(event.relatedTarget)) target.classList.remove('drop-over');
});

screen.addEventListener('drop', (event) => {
  if (page === 'case-study') { caseStudy.drop(event); return; }
  const target = event.target.closest('[data-category]');
  if (!draggedCard || !target) return;
  event.preventDefault();
  const id = draggedCard;
  endDrag();
  matchCard(id, target.dataset.category);
});

function endDrag() {
  draggedCard = null;
  screen.querySelector('.dragging')?.classList.remove('dragging');
  screen.querySelector('.drop-over')?.classList.remove('drop-over');
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshStages();
});

screen.addEventListener('change', (event) => {
  if (page === 'risk') riskCommander.change(event);
  if (page === 'advisor') cyberAdvisor.change(event);
  if (page === 'case-study') caseStudy.change(event);
});
screen.addEventListener('input', (event) => {
  if (page === 'risk') riskCommander.input(event);
});
screen.addEventListener('pointerdown', (event) => { if (page === 'pyramid') pyramid.pointerDown(event); });
screen.addEventListener('pointermove', (event) => { if (page === 'pyramid') pyramid.pointerMove(event); });
screen.addEventListener('pointerup', (event) => { if (page === 'pyramid') pyramid.pointerEnd(event); });
screen.addEventListener('pointercancel', (event) => { if (page === 'pyramid') pyramid.pointerEnd(event); });
window.addEventListener('popstate', (event) => {
  const id = linkedTask();
  if (page === 'pyramid') pyramid.leave();
  if (page === 'practice') pyramidPractice.leave();
  if (page === 'case-study') caseStudy.leave();
  if (id) {
    const module = modules.find(({ tasks }) => tasks.some((task) => task.id === id))
      ?? modules.find((module) => module.id === id);
    if (!module) return;
    moduleId = module.id;
    if (taskAvailable(id)) openTask(id, null, { riskStage: location.hash.slice(6), replace: true });
    else {
      page = 'waiting';
      render('#screen-title');
    }
  } else if (page === 'advisor' || page === 'pyramid' || page === 'practice' || page === 'case-study' || event.state?.moduleId) {
    moduleId = event.state?.moduleId ?? moduleId;
    page = event.state?.trainingPage === 'done' && summaryAvailable() ? 'done' : 'waiting';
    render('#screen-title');
  } else if (page === 'risk') {
    if (event.state?.trainingPage === 'done' && summaryAvailable()) {
      page = 'done';
      render('#screen-title');
      return;
    }
    const previous = event.state?.trainingPage === 'definitions' ? 'definitions' : 'scenarios';
    const available = taskAvailable(previous) ? previous : 'definitions';
    openTask(available, null, { choose: event.state?.trainingPage === 'choose', replace: true });
  }
});

restoreProgress();
render();
refreshStages();
