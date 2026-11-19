import { gradeAnalysis, riskLevel, riskLevels, riskScore, riskRatingVerdict, validAxis } from './risk-scoring.js?v=constructive-feedback';
import { apiRequest } from './training-api.js';

const likelihood = ['Bardzo niskie', 'Niskie', 'Średnie', 'Wysokie', 'Bardzo wysokie'];
const impact = ['Minimalny', 'Niski', 'Umiarkowany', 'Wysoki', 'Krytyczny'];
const reasons = {
  A: 'Najwyższe prawdopodobieństwo.',
  B: 'Największy potencjalny wpływ.',
  C: 'Połączenie prawdopodobieństwa, wpływu i znaczenia dla szpitala.',
  D: 'Inny powód.',
};
const numbers = [1, 2, 3, 4, 5];
const storageKey = 'cyber-risk-commander';
const stageNames = { intro: 'Wprowadzenie', assess: 'Ocena ryzyk', priorities: 'Priorytety', report: 'Raport' };
const html = (text) => String(text).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const empty = () => ({ ratings: {}, priorities: ['', '', ''], reason: '', justification: '', submitted: false });

function restore(risks) {
  const state = empty();
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (!saved) return state;
    const ids = new Set(risks.map(({ id }) => id));
    for (const id of ids) {
      const rating = saved.ratings?.[id];
      if (validAxis(rating?.likelihood) && validAxis(rating?.impact)) state.ratings[id] = rating;
    }
    if (Array.isArray(saved.priorities)) {
      const selected = new Set();
      state.priorities = state.priorities.map((_, index) => {
        const id = saved.priorities[index];
        if (!ids.has(id) || selected.has(id)) return '';
        selected.add(id);
        return id;
      });
    }
    if (Object.hasOwn(reasons, saved.reason)) state.reason = saved.reason;
    if (typeof saved.justification === 'string') state.justification = saved.justification.slice(0, 200);
    state.submitted = saved.submitted === true;
  } catch {
    // Session storage may be unavailable.
  }
  return state;
}

function scoreBadge(score) {
  const level = riskLevel(score);
  return `<span class="rc-badge rc-${level.key}">${score} · ${level.label}</span>`;
}

function matrix(ratings, { interactive = false, pending = {}, animate = '', title } = {}) {
  const rows = [...numbers].reverse().map((row) => `<tr>
    <th scope="row" title="${likelihood[row - 1]}">${row}<span class="rc-axis-text">${likelihood[row - 1]}</span></th>
    ${numbers.map((column) => {
      const score = row * column;
      const level = riskLevel(score);
      const ids = Object.keys(ratings).filter((id) => ratings[id].likelihood === row && ratings[id].impact === column);
      const label = `Prawdopodobieństwo ${row} — ${likelihood[row - 1]}, wpływ ${column} — ${impact[column - 1]}, wynik ${score}, ${level.label}${ids.length ? `, ryzyka ${ids.join(', ')}` : ''}`;
      const content = `<span class="rc-cell-score">${score}</span><span class="rc-cell-markers">${ids.map((id) =>
        `<span class="rc-marker${id === animate ? ' rc-marker-new' : ''}">${id}</span>`).join('')}</span>`;
      const selected = pending.likelihood === row && pending.impact === column;
      return `<td class="rc-${level.key}">${interactive
        ? `<button type="button" data-rc-cell="${row}-${column}" aria-label="${label}" aria-pressed="${selected}">${content}</button>`
        : `<div class="rc-cell-static"><span class="sr-only">${label}</span><span aria-hidden="true">${content}</span></div>`}</td>`;
    }).join('')}
  </tr>`).join('');
  return `<div class="rc-matrix">
    <p class="rc-axis">Prawdopodobieństwo ↑</p>
    <table aria-label="${title}">
      <thead><tr><td></td>${numbers.map((column) => `<th scope="col" title="${impact[column - 1]}">${column}<span class="rc-axis-text">${impact[column - 1]}</span></th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="rc-axis rc-axis-x">Wpływ →</p>
  </div>`;
}

function legend() {
  return `<ul class="rc-legend" aria-label="Poziomy ryzyka">${riskLevels.map(({ key, label, range }) =>
    `<li><span class="rc-badge rc-${key}">${range} · ${label}</span></li>`).join('')}</ul>`;
}

function introView() {
  return `<h2 id="screen-title" tabindex="-1">RISK COMMANDER – Które ryzyko jest najważniejsze?</h2>
    <p class="lead">Jesteś menedżerem ds. ryzyka cyberbezpieczeństwa w dużym szpitalu wojewódzkim. Zarząd prosi Cię o ocenę pięciu ryzyk i wskazanie trzech, którymi trzeba zająć się w pierwszej kolejności.</p>
    <div class="rc-intro-grid">
      <section class="rc-box"><h3>Szpital wojewódzki</h3>
        <p>1200 pracowników · 450 łóżek</p>
        <p>Elektroniczna dokumentacja medyczna, systemy diagnostyczne i laboratoryjne oraz ograniczone zasoby IT.</p>
        <h4>Priorytety szpitala</h4>
        <ol><li>Bezpieczeństwo pacjentów</li><li>Ciągłość świadczenia usług medycznych</li><li>Ochrona danych medycznych</li><li>Zgodność z wymaganiami prawnymi</li></ol>
      </section>
      <section class="rc-box"><h3>Twoja misja</h3>
        <ol><li>Oceń pięć ryzyk.</li><li>Umieść je na macierzy ryzyka.</li><li>Wybierz trzy najważniejsze.</li><li>Porównaj decyzje z oceną agenta AI.</li></ol>
        <p class="rc-note">Zarezerwuj około 10–12 minut. Ocena ma pomóc Ci uzasadnić decyzje w kontekście szpitala.</p>
      </section>
    </div>
    <div class="actions"><button class="primary" type="button" data-rc-action="assess">Rozpocznij analizę</button></div>`;
}

function axisSelect(name, title, labels, value) {
  return `<label>${title}<select data-rc-axis="${name}">
    <option value="">Wybierz poziom</option>
    ${labels.map((label, index) => `<option value="${index + 1}" ${value === index + 1 ? 'selected' : ''}>${index + 1} · ${label}</option>`).join('')}
  </select></label>`;
}

function assessmentView(risks, ratings, current, pending, animate) {
  const risk = risks.find(({ id }) => id === current);
  const sorted = risks.filter(({ id }) => ratings[id]).sort((a, b) => riskScore(ratings[b.id]) - riskScore(ratings[a.id]));
  const ready = validAxis(pending.likelihood) && validAxis(pending.impact);
  return `<div class="rc-title"><h2 id="screen-title" tabindex="-1">Oceń ryzyka</h2>
    <div class="rc-progress"><span>Oceniono ${sorted.length} z ${risks.length} ryzyk</span><progress aria-label="Ocenione ryzyka" value="${sorted.length}" max="${risks.length}"></progress></div></div>
    <div class="rc-jump" aria-label="Przejdź do panelu">
      <button type="button" data-rc-jump="rc-cards">Karty ryzyk</button>
      <button type="button" data-rc-jump="rc-matrix">Macierz</button>
      <button type="button" data-rc-jump="rc-ranking">Ranking</button>
    </div>
    <div class="rc-workspace">
      <section class="rc-box rc-cards" id="rc-cards"><h3>Karty ryzyk</h3>
        <div class="rc-risk-list">${risks.map(({ id, title, icon }) => `<button type="button" class="rc-risk" data-rc-risk="${id}" aria-pressed="${id === current}">
          <span aria-hidden="true">${icon}</span><span><strong>${id} · ${html(title)}</strong>${ratings[id] ? scoreBadge(riskScore(ratings[id])) : ''}</span></button>`).join('')}</div>
        <div class="rc-editor" id="rc-editor"><h4>${current} · ${html(risk.title)}</h4><p>${html(risk.description)}</p>
          ${axisSelect('likelihood', 'Prawdopodobieństwo', likelihood, pending.likelihood)}
          ${axisSelect('impact', 'Wpływ', impact, pending.impact)}
          <div class="rc-preview" aria-live="polite">${ready ? scoreBadge(riskScore(pending)) : 'Wybierz prawdopodobieństwo i wpływ.'}</div>
          <button class="primary" type="button" data-rc-action="save" ${ready ? '' : 'disabled'}>Zatwierdź ocenę ${current}</button>
        </div>
      </section>
      <section class="rc-box" id="rc-matrix"><h3>Macierz ryzyka 5 × 5</h3>
        <p class="rc-note">Wybierz pole, aby od razu zapisać ocenę ${current}.</p>
        ${matrix(ratings, { interactive: true, pending, animate, title: 'Macierz ryzyka do oceny' })}
        <button class="rc-mobile-review admin-secondary" type="button" data-rc-jump="rc-editor">Wróć do szczegółów ryzyka</button>
        ${legend()}
        <p class="rc-note">Wynik to prawdopodobieństwo × wpływ. Wartości od 1 do 5 są kategoriami porządkowymi. Iloczyn służy do klasyfikacji w ćwiczeniu i stanowi uproszczenie.</p>
      </section>
      <section class="rc-box" id="rc-ranking"><h3>Ranking</h3>
        ${sorted.length ? `<ol class="rc-ranking">${sorted.map(({ id, title }) => {
          const score = riskScore(ratings[id]);
          const place = sorted.findIndex((entry) => riskScore(ratings[entry.id]) === score) + 1;
          return `<li value="${place}"><strong>${id} · ${html(title)}</strong>${scoreBadge(score)}</li>`;
        }).join('')}</ol>` : '<p class="rc-note">Ranking pojawi się po zatwierdzeniu pierwszej oceny.</p>'}
        <p class="rc-note">Równe wyniki oznaczają remis w rankingu. Kolejność priorytetów ustalisz w następnym kroku.</p>
      </section>
    </div>
    <div class="actions"><button class="primary" type="button" data-rc-action="priorities" ${sorted.length === risks.length ? '' : 'disabled'}>Przejdź do priorytetów</button></div>`;
}

function priorityView(risks, state, valid) {
  return `<h2 id="screen-title" tabindex="-1">Teraz Ty decydujesz</h2>
    <p class="lead">Zarząd może najpierw zająć się tylko trzema ryzykami. Wybierz te, które wymagają najpilniejszej reakcji, i ustal ich kolejność.</p>
    <p class="rc-note">Możliwe, że wybrane ryzyka mają tę samą wartość w macierzy. Mimo remisu musisz zdecydować, którym zająć się wcześniej. Porównaj możliwe skutki dla zdrowia i życia pacjentów, czas do zakłócenia leczenia oraz możliwość utrzymania świadczeń w trybie awaryjnym.</p>
    <div class="rc-podium">${state.priorities.map((value, index) => `<label class="rc-box">
      <span>Priorytet ${index + 1}</span><select data-rc-priority="${index}"><option value="">Wybierz ryzyko</option>
      ${risks.map(({ id, title }) => `<option value="${id}" ${id === value ? 'selected' : ''} ${id !== value && state.priorities.includes(id) ? 'disabled' : ''}>${id} · ${html(title)} · ${riskScore(state.ratings[id])} pkt</option>`).join('')}</select>
    </label>`).join('')}</div>
    <fieldset class="rc-box rc-reasons"><legend>Dlaczego wskazałeś to ryzyko jako priorytet numer 1?</legend>
      ${Object.entries(reasons).map(([id, text]) => `<label><input type="radio" name="rc-reason" value="${id}" ${state.reason === id ? 'checked' : ''}> <span>${id}. ${text}</span></label>`).join('')}
      ${state.reason === 'D' ? `<label class="rc-justification">Krótkie uzasadnienie (do 200 znaków)
        <textarea rows="3" maxlength="200" data-rc-justification>${html(state.justification)}</textarea></label>` : ''}
    </fieldset>
    <div class="actions"><button class="admin-secondary" type="button" data-rc-action="assess">Wróć do macierzy</button>
      <button class="primary" type="button" data-rc-action="report" ${valid ? '' : 'disabled'}>Zakończ analizę i zobacz raport</button></div>`;
}

function feedbackDetails(actual, expected) {
  const verdict = riskRatingVerdict(actual, expected);
  return `<p class="rc-note">Ocena odpowiedzi odnosi się do założeń tego scenariusza.</p>
    <section class="rc-verdict rc-verdict-${verdict.key}" aria-label="Ocena odpowiedzi uczestnika">
      <strong>${html(verdict.label)}</strong><p>${html(verdict.explanation)}</p>
    </section>
    <table class="rc-feedback-comparison" aria-label="Porównanie ocen ryzyka">
      <thead><tr><td></td><th scope="col">Twoja ocena</th><th scope="col">Agent AI</th></tr></thead>
      <tbody>
        <tr><th scope="row">Prawdopodobieństwo</th><td>${actual.likelihood}</td><td>${expected.likelihood}</td></tr>
        <tr><th scope="row">Wpływ</th><td>${actual.impact}</td><td>${expected.impact}</td></tr>
        <tr><th scope="row">Wynik</th><td>${riskScore(actual)}</td><td>${riskScore(expected)}</td></tr>
      </tbody>
    </table>
    <h4>Przesłanki agenta AI</h4>
    <p><strong>Prawdopodobieństwo.</strong> ${html(expected.likelihoodFactor)}</p>
    <p><strong>Wpływ i pilność.</strong> ${html(expected.impactFactor)}</p>`;
}

function reportView(risks, state, reference, failed, canOpenSummary) {
  if (!reference) return `<h2 id="screen-title" tabindex="-1">Raport analizy</h2>
    <p class="lead" role="status">${failed ? 'Nie udało się pobrać oceny agenta AI.' : 'Pobieram ocenę agenta AI.'}</p>
    ${failed ? '<div class="actions"><button type="button" class="primary" data-rc-action="retry">Spróbuj ponownie</button></div>' : ''}`;
  const { ratings, priorities, reason, justification } = state;
  const grade = gradeAnalysis(ratings, priorities, reason, reference);
  const riskName = (id) => `${id} · ${html(risks.find((risk) => risk.id === id).title)}`;
  const counts = Object.values(ratings).map((rating) => riskLevel(riskScore(rating)).key);
  const breakdown = [['Prawdopodobieństwo', grade.likelihood, 30], ['Wpływ', grade.impact, 30],
    ['Priorytety', grade.priorities, 30], ['Uzasadnienie', grade.reason, 10]];
  return `<div class="rc-title"><h2 id="screen-title" tabindex="-1">Raport analizy ryzyka</h2><strong class="rc-total">${grade.total} / 100 pkt</strong></div>
    <p class="lead">Wynik porównuje Twoje decyzje z oceną agenta AI przygotowaną dla tego scenariusza. Głównym celem szpitala jest bezpieczne leczenie oraz ochrona zdrowia i życia pacjentów. Przy ustalaniu pilności uwzględnij wpływ ryzyka na realizację tego celu.</p>
    <section class="rc-report-section"><h3>Podsumowanie Twojej analizy</h3>
      <ul class="rc-stats"><li><strong>${counts.length}</strong>Przeanalizowane</li>${riskLevels.map(({ key, label }) => `<li class="rc-${key}"><strong>${counts.filter((value) => value === key).length}</strong>${label}</li>`).join('')}</ul>
      <ul class="rc-breakdown">${breakdown.map(([label, points, max]) => `<li>${label} <strong>${points} / ${max}</strong></li>`).join('')}</ul>
    </section>
    <section class="rc-report-section"><h3>Porównanie macierzy</h3><div class="rc-report-grid">
      <div class="rc-box"><h4>Twoja ocena</h4>${matrix(ratings, { title: 'Twoja macierz ryzyka' })}</div>
      <div class="rc-box"><h4>Ocena agenta AI</h4>${matrix(reference.ratings, { title: 'Macierz ryzyka agenta AI' })}</div>
    </div>${legend()}</section>
    <section class="rc-report-section"><h3>Porównanie priorytetów</h3><div class="rc-report-grid">
      <div class="rc-box"><h4>Twoje TOP 3</h4><ol>${priorities.map((id) => `<li>${riskName(id)}</li>`).join('')}</ol>
        <p class="rc-note">Uzasadnienie: ${html(reason === 'D' ? justification : reasons[reason])}</p></div>
      <div class="rc-box"><h4>TOP 3 agenta AI</h4>
        <ol class="rc-ai-priorities">${reference.priorities.map((id) => `<li>${riskName(id)}</li>`).join('')}</ol>
        ${reference.priorityArguments.map(({ title, text }) => `<p><strong>${html(title)}</strong><br>${html(text)}</p>`).join('')}
        <p class="rc-note rc-priority-context"><span aria-hidden="true">*</span><span class="sr-only">Adnotacja. </span> ${html(reference.priorityContext)}</p>
      </div>
    </div></section>
    <section class="rc-report-section"><h3>Informacja zwrotna od agenta AI</h3>
      <p class="rc-note">Wybierz ryzyko, aby zobaczyć ocenę odpowiedzi i jej uzasadnienie.</p>
      <ul class="rc-feedback-list">${risks.map(({ id }) => `<li>
        <button type="button" data-rc-feedback="${id}" aria-haspopup="dialog">
          <strong>${riskName(id)}</strong><span>Zobacz ocenę</span>
        </button></li>`).join('')}</ul>
      <dialog class="rc-feedback-dialog" aria-labelledby="rc-feedback-title">
        <div class="rc-dialog-header"><h3 id="rc-feedback-title"></h3>
          <form method="dialog"><button class="admin-secondary" type="submit">Zamknij</button></form></div>
        <div class="rc-feedback-body"></div>
      </dialog>
    </section>
    <div class="actions"><button class="admin-secondary" type="button" data-rc-action="restart">Rozpocznij ponownie</button>
      ${canOpenSummary ? '<button class="primary" type="button" data-rc-action="summary">Podsumowanie ćwiczenia</button>' : ''}</div>`;
}

export function createRiskCommander({ screen, render, announce, summaryAvailable }) {
  let risks = [];
  let state = empty();
  let stage = 'intro';
  let current;
  let pending = {};
  let reference;
  let referenceRequest;
  let failed = false;
  let animate = '';

  function save() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Keep in-memory progress. */ }
  }

  const fullyRated = () => Object.keys(state.ratings).length === risks.length && risks.length > 0;
  const validPriorities = () => state.priorities.every(Boolean) && Boolean(state.reason)
    && (state.reason !== 'D' || Boolean(state.justification.trim()));
  const completed = () => state.submitted && fullyRated() && validPriorities();

  function renderReference() {
    if (screen.querySelector('[data-rc-stage="report"]')) render();
  }

  async function loadReference() {
    if (reference || referenceRequest) return;
    failed = false;
    referenceRequest = (async () => {
      try {
        const response = await apiRequest('/api/tasks/risk-commander/reference', { cache: 'no-store' });
        if (!response.ok) throw new Error('Reference request failed.');
        reference = await response.json();
      } catch {
        failed = true;
      } finally {
        referenceRequest = null;
        renderReference();
      }
    })();
    await referenceRequest;
  }

  function normalizeStage(requested) {
    if (!Object.hasOwn(stageNames, requested)) return 'intro';
    if (requested === 'report' && !completed()) return fullyRated() ? 'priorities' : 'assess';
    if (requested === 'priorities' && !fullyRated()) return 'assess';
    return requested;
  }

  function goTo(requested, replace = false) {
    stage = normalizeStage(requested);
    history[replace ? 'replaceState' : 'pushState'](null, '', `#risk-${stage}`);
    render('#screen-title');
    if (stage === 'report') loadReference();
  }

  function selectRisk(id) {
    current = id;
    pending = { ...state.ratings[id] };
  }

  function saveRating(focusSelector) {
    state.ratings[current] = { ...pending };
    state.submitted = false;
    animate = current;
    save();
    render(focusSelector);
    announce(`Zapisano ocenę ${current}. Oceniono ${Object.keys(state.ratings).length} z ${risks.length} ryzyk.`);
  }

  function screenMarkup() {
    const view = {
      intro: introView,
      assess: () => assessmentView(risks, state.ratings, current, pending, animate),
      priorities: () => priorityView(risks, state, validPriorities()),
      report: () => reportView(risks, state, reference, failed, summaryAvailable()),
    }[stage]();
    animate = '';
    return `<section class="panel rc-panel" data-rc-stage="${stage}" aria-labelledby="screen-title">
      <p class="kicker">RISK COMMANDER · ${stageNames[stage]}</p>${view}</section>`;
  }

  function click(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const { rcRisk, rcCell, rcAction, rcJump, rcFeedback } = button.dataset;
    if (rcFeedback && stage === 'report' && reference) {
      const risk = risks.find(({ id }) => id === rcFeedback);
      if (!risk) return;
      const dialog = screen.querySelector('.rc-feedback-dialog');
      dialog.querySelector('h3').textContent = `${risk.id} · ${risk.title}`;
      dialog.querySelector('.rc-feedback-body').innerHTML = feedbackDetails(state.ratings[risk.id], reference.ratings[risk.id]);
      dialog.showModal();
    } else if (rcJump) {
      const panel = screen.querySelector(`#${rcJump}`);
      const target = panel.querySelector('h3, h4');
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      panel.scrollIntoView({ block: 'start' });
    } else if (rcRisk) {
      selectRisk(rcRisk);
      render(`[data-rc-risk="${rcRisk}"]`);
    } else if (rcCell) {
      const [likelihood, impact] = rcCell.split('-').map(Number);
      pending = { likelihood, impact };
      saveRating(`[data-rc-cell="${rcCell}"]`);
    } else if (rcAction === 'save' && validAxis(pending.likelihood) && validAxis(pending.impact)) {
      saveRating('[data-rc-action="save"]');
    } else if (rcAction === 'report' && fullyRated() && validPriorities()) {
      state.submitted = true;
      save();
      goTo('report');
    } else if (rcAction === 'restart') {
      state = empty();
      reference = null;
      failed = false;
      selectRisk(risks[0].id);
      save();
      goTo('intro', true);
    } else if (rcAction === 'retry') {
      failed = false;
      render('#screen-title');
      loadReference();
    } else if (rcAction === 'assess' || rcAction === 'priorities') {
      goTo(rcAction);
    }
  }

  function change(event) {
    const field = event.target;
    const { rcAxis, rcPriority } = field.dataset;
    if (rcAxis) {
      pending[rcAxis] = Number(field.value);
      render(`[data-rc-axis="${rcAxis}"]`);
    } else if (rcPriority !== undefined) {
      state.priorities[Number(rcPriority)] = field.value;
      state.submitted = false;
      save();
      render(`[data-rc-priority="${rcPriority}"]`);
    } else if (field.name === 'rc-reason') {
      state.reason = field.value;
      state.submitted = false;
      save();
      render(field.value === 'D' ? '[data-rc-justification]' : `[name="rc-reason"][value="${field.value}"]`);
    }
  }

  function input(event) {
    if (!event.target.matches('[data-rc-justification]')) return;
    state.justification = event.target.value.slice(0, 200);
    state.submitted = false;
    save();
    screen.querySelector('[data-rc-action="report"]').disabled = !validPriorities();
  }

  return {
    open(data, requested) {
      if (!risks.length) {
        risks = data.risks;
        state = restore(risks);
        selectRisk(risks[0].id);
      }
      if (requested) stage = normalizeStage(requested);
      if (stage === 'report') loadReference();
      return stage;
    },
    completed,
    screenMarkup,
    click,
    change,
    input,
  };
}
