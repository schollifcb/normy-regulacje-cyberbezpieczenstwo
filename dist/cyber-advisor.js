import { advisorReport, categories, decisionScore } from './advisor-scoring.js';

const storageKey = 'cyber-advisor-progress-v1';
const blank = () => ({
  view: 'intro', index: 0, answers: {}, selection: [], retry: null, submitted: false,
  questionVersion: 3, legacyAnswers: [], legacyAnswersV2: [], optionOrder: [], answerOrders: {},
});

export function createCyberAdvisor({ screen, render, escapeHtml: html, icon, showSummary }) {
  let data;
  let questions = [];
  let state = blank();
  let reviewIndex = null;

  function save() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Progress is still available while this page is open.
    }
  }

  const completed = () => questions.length > 0 && questions.every(({ id }) => Object.hasOwn(state.answers, id));
  const current = () => state.retry
    ? questions.find(({ id }) => id === state.retry[state.index])
    : questions[state.index];
  const missionComplete = ({ questions }) => questions.every(({ id }) => Object.hasOwn(state.answers, id));
  const savedQuestion = (question) => state.legacyAnswers.includes(question.id)
    ? { ...question, ...data.previousQuestions[question.id] }
    : state.legacyAnswersV2.includes(question.id)
      ? { ...question, ...data.previousQuestionsV2[question.id] } : question;
  const resultForAnswers = () => advisorReport(questions.map(savedQuestion), state.answers);

  function shuffleOptions(question) {
    const order = question.options.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [order[index], order[other]] = [order[other], order[index]];
    }
    if (order.every((value, index) => value === state.optionOrder[index])) order.push(order.shift());
    state.optionOrder = order;
  }

  function missionMenu() {
    const selected = (questions[reviewIndex] ?? current())?.mission;
    return `<nav class="advisor-missions" aria-label="Misje Cyber Advisor">
      <ul>${data.missions.map((mission, index) => {
        const finished = missionComplete(mission);
        const currentMission = index === selected && state.view !== 'report' && state.view !== 'intro';
        const detail = finished ? 'Ukończona' : currentMission ? 'W toku' : 'Zablokowana';
        return `<li><button type="button" data-advisor-action="review" data-mission-index="${index}"
          ${finished ? '' : 'disabled'} ${index === selected && (currentMission || reviewIndex !== null) ? 'aria-current="step"' : ''}>
          ${icon(mission.icon)}<span>${html(mission.title)}<small>${detail}</small></span>
        </button></li>`;
      }).join('')}</ul></nav>`;
  }

  function progress(question) {
    const done = state.retry ? state.index + Number(state.submitted) : Object.keys(state.answers).length;
    const total = state.retry?.length ?? questions.length;
    const label = state.retry
      ? `Powtórka · Decyzja ${state.index + 1} z ${state.retry.length}`
      : `Misja ${question.mission + 1} z ${data.missions.length} · Decyzja ${question.number + 1} z ${data.missions[question.mission].questions.length}`;
    return `<div class="advisor-progress"><strong>${label}</strong>
      <progress aria-label="Zatwierdzone decyzje" value="${done}" max="${total}"></progress>
      <span>${done} z ${total} zatwierdzonych decyzji</span></div>`;
  }

  function intro() {
    return `<p class="kicker">CYBER ADVISOR</p>
      <h2 id="screen-title" tabindex="-1">Zostań doradcą cyberbezpieczeństwa</h2>
      <p class="lead">Twoja pierwsza misja jako konsultanta cyberbezpieczeństwa.</p>
      <div class="advisor-message"><h3>Witaj w CyberShield Consulting!</h3>
        <p>Cztery organizacje potrzebują Twojej pomocy. Każda mierzy się z innym problemem. Dobierz przepisy, normy, frameworki i dobre praktyki do ich potrzeb.</p>
        <p>Przepisy określają obowiązki w swoim zakresie. Normy, frameworki i dobre praktyki pomagają je realizować.</p></div>
      <p class="advisor-meta">4 misje · 12 decyzji · około 10–12 minut</p>
      <div class="actions"><button class="primary" type="button" data-advisor-action="start">Rozpocznij misję</button></div>`;
  }

  function missionContext(question) {
    const mission = data.missions[question.mission];
    return `<aside class="case-context advisor-context" aria-label="Kontekst misji">
      <span class="context-icon" aria-hidden="true">${icon(mission.icon)}</span>
      <div><h3>${html(mission.title)}</h3><p><strong>${html(mission.client)}</strong></p><p>${html(mission.context)}</p></div>
    </aside>`;
  }

  function optionClass(correct, selected, submitted) {
    if (!submitted) return '';
    if (correct) return ' advisor-correct';
    return selected ? ' advisor-incorrect' : '';
  }

  function choices(question, selected, submitted) {
    if (question.pairs) {
      const documents = question.options.map((label, index) => ({ label, index }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pl'));
      return `<div class="advisor-pairs">
        <p class="advisor-meta">Dokumenty: ${documents.map(({ label }) => html(label)).join(' · ')}</p>
        ${question.pairs.map((problem, row) => {
          const choice = selected[row];
          const correct = choice === question.answer[row];
          return `<label class="advisor-option advisor-pair${optionClass(correct, true, submitted)}">
            <strong>${html(problem)}</strong>
            <select data-advisor-pair="${row}" ${submitted ? 'disabled' : ''}>
              <option value="">Wybierz dokument</option>
              ${documents.map(({ label, index }) => `<option value="${index}" ${choice === index ? 'selected' : ''}
                ${choice !== index && selected.includes(index) ? 'disabled' : ''}>${html(label)}</option>`).join('')}
            </select>
            ${submitted ? `<span class="advisor-mark">${correct ? '✓ Poprawne dopasowanie' : `✗ Poprawne dopasowanie: ${html(question.options[question.answer[row]])}`}</span>` : ''}
          </label>`;
        }).join('')}</div>`;
    }
    const multiple = question.answer.length > 1;
    const storedOrder = submitted ? state.answerOrders[question.id] : state.optionOrder;
    const order = question.shuffle && storedOrder?.length === question.options.length
      ? storedOrder : question.options.map((_, index) => index);
    return `<fieldset class="advisor-options" ${submitted ? 'disabled' : ''}>
      <legend>${question.limit ? `Wybierz ${question.limit} odpowiedzi.` : multiple ? 'Wybierz wszystkie prawidłowe odpowiedzi.' : 'Wybierz jedną odpowiedź.'}</legend>
      ${order.map((index, position) => {
        const correct = question.answer.includes(index);
        const chosen = selected.includes(index);
        const limited = !chosen && question.limit && selected.length >= question.limit;
        return `<label class="advisor-option${optionClass(correct, chosen, submitted)}">
          <input type="${multiple ? 'checkbox' : 'radio'}" name="advisor-choice" value="${index}" ${chosen ? 'checked' : ''} ${limited ? 'disabled' : ''}>
          <span><strong>${String.fromCharCode(65 + position)}.</strong> ${html(question.options[index])}
          ${submitted && (correct || chosen) ? `<span class="advisor-mark">${correct ? '✓ Poprawna odpowiedź' : '✗ Błędna odpowiedź'}</span>` : ''}</span>
        </label>`;
      }).join('')}</fieldset>`;
  }

  function ready(question) {
    if (question.pairs) return question.pairs.every((_, index) => Number.isInteger(state.selection[index]));
    return question.limit ? state.selection.length === question.limit : state.selection.length > 0;
  }

  function feedback(question, selection) {
    const points = decisionScore(question, selection);
    return `<div class="advisor-feedback ${points === 100 ? 'advisor-correct' : ''}">
      <h3 id="advisor-feedback-title" tabindex="-1">${points} / 100 pkt</h3>
      ${question.feedback.map((paragraph) => `<p>${html(paragraph)}</p>`).join('')}
      <ul class="advisor-sources">${question.refs.map((id) => {
        const [label, url] = data.sources[id];
        return `<li><a href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(label)}</a></li>`;
      }).join('')}</ul></div>`;
  }

  function decision() {
    const question = state.submitted ? savedQuestion(current()) : current();
    return `${progress(question)}
      ${state.retry ? `<p class="advisor-meta">${html(data.missions[question.mission].title)}</p>` : missionContext(question)}
      <h2 id="screen-title" tabindex="-1">${html(question.title)}</h2>
      <p class="lead">${html(question.prompt)}</p>
      ${choices(question, state.selection, state.submitted)}
      ${state.submitted ? feedback(question, state.selection) : ''}
      <div class="actions advisor-actions">
        <button type="button" class="admin-secondary" data-advisor-action="hint">💡 Karta konsultanta</button>
        ${state.submitted
          ? '<button type="button" class="primary" data-advisor-action="next">Dalej</button>'
          : `<button type="button" class="primary" data-advisor-action="submit" ${ready(question) ? '' : 'disabled'}>Zatwierdź odpowiedź</button>`}
      </div>
      <dialog class="advisor-dialog" aria-labelledby="advisor-hint-title">
        <h3 id="advisor-hint-title">Karta konsultanta</h3><p>${html(question.hint)}</p>
        <form method="dialog"><button class="primary">Zamknij</button></form>
      </dialog>`;
  }

  function reviewMission() {
    const question = savedQuestion(questions[reviewIndex]);
    const mission = data.missions[question.mission];
    const selection = state.answers[question.id];
    return `<p class="advisor-meta">Przegląd misji · Decyzja ${question.number + 1} z ${mission.questions.length}</p>
      ${missionContext(question)}
      <h2 id="screen-title" tabindex="-1">${html(question.title)}</h2>
      <div class="actions advisor-review-actions">
        <button type="button" class="admin-secondary" data-advisor-action="resume">${state.view === 'report' ? 'Wróć do raportu' : 'Wróć do ćwiczenia'}</button>
        <button type="button" class="admin-secondary" data-advisor-action="review-prev" ${question.number === 0 ? 'disabled' : ''}>Poprzednia decyzja</button>
        <button type="button" class="admin-secondary" data-advisor-action="review-next" ${question.number === mission.questions.length - 1 ? 'disabled' : ''}>Następna decyzja</button>
      </div>
      <p class="lead">${html(question.prompt)}</p>
      ${choices(question, selection, true)}
      ${feedback(question, selection)}`;
  }

  function missionSummary() {
    const question = questions[state.index];
    const mission = data.missions[question.mission];
    const last = question.mission === data.missions.length - 1;
    return `${progress(question)}<h2 id="screen-title" tabindex="-1">Podsumowanie misji</h2>
      <p class="lead">${html(mission.title)}</p>
      <dl class="advisor-knowledge">${mission.takeaways.map(([title, value]) => `<div><dt>${html(title)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl>
      <div class="actions"><button type="button" class="primary" data-advisor-action="advance">${last ? 'Zobacz raport końcowy' : `Przejdź do misji ${question.mission + 2}`}</button></div>`;
  }

  function report() {
    const result = resultForAnswers();
    const missions = data.missions.filter(missionComplete);
    const review = result.categories.filter(({ score }) => score < 100);
    return `<p class="kicker">CYBER ADVISOR</p><h2 id="screen-title" tabindex="-1">Raport konsultanta</h2>
      <div class="advisor-result"><strong>${result.total}%</strong><span>${result.rank}</span></div>
      <ul class="advisor-stats">
        <li><strong>${missions.length} / ${data.missions.length}</strong>Ukończone misje</li>
        <li><strong>${result.correct}</strong>Poprawne decyzje</li>
        <li><strong>${result.partial}</strong>Częściowo poprawne decyzje</li>
      </ul>
      <h3>Wynik według kategorii</h3>
      <ul class="advisor-categories">${result.categories.map(({ id, score }) => `<li><span>${categories[id]}</span>
        <progress aria-label="${categories[id]}" value="${score}" max="100"></progress><strong>${score}%</strong></li>`).join('')}</ul>
      <p class="advisor-meta">Decyzja może należeć do kilku kategorii. W wyniku łącznym każdą decyzję liczymy raz.</p>
      <h3>Obszary do powtórzenia</h3>
      <p>${review.length ? review.map(({ id }) => categories[id]).join(', ') : 'Wszystkie decyzje otrzymały pełną punktację.'}</p>
      <div class="advisor-message"><h3>Gratulacje!</h3>
        <p>Ukończyłeś pierwszą serię konsultacji cyberbezpieczeństwa. Dobór zabezpieczeń zaczyna się od zrozumienia ryzyka i wymagań, które dotyczą danej organizacji.</p></div>
      <h3>Co warto zapamiętać?</h3>
      <dl class="advisor-knowledge">${data.knowledge.map(([title, value]) => `<div><dt>${html(title)}</dt><dd>${html(value)}</dd></div>`).join('')}</dl>
      <div class="actions advisor-actions">
        ${result.missed.length ? '<button type="button" class="primary" data-advisor-action="retry">Powtórz błędne odpowiedzi</button>' : ''}
        <button type="button" class="admin-secondary" data-advisor-action="restart">Rozpocznij od nowa</button>
        <button type="button" class="admin-secondary" data-advisor-action="summary">Podsumowanie ćwiczenia</button>
      </div>`;
  }

  function screenMarkup() {
    const view = { intro, decision, mission: missionSummary, report }[state.view];
    return `<section class="panel advisor-panel" aria-labelledby="screen-title">${missionMenu()}${reviewIndex === null ? view() : reviewMission()}</section>`;
  }

  function restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey));
      if (!saved || !['intro', 'decision', 'mission', 'report'].includes(saved.view)
        || !Number.isInteger(saved.index) || saved.index < 0 || !Array.isArray(saved.selection)
        || !saved.answers || !questions.every(({ id }) => !Object.hasOwn(saved.answers, id) || Array.isArray(saved.answers[id]))
        || (saved.retry !== null && !Array.isArray(saved.retry))) return;
      state = { ...blank(), ...saved };
      if ((state.view === 'decision' && !current()) || (state.view === 'mission' && !questions[state.index])
        || (state.view === 'report' && !completed())) state = blank();
      if (!saved.questionVersion || saved.questionVersion < 2) {
        state.legacyAnswers = Object.keys(data.previousQuestions).filter((id) => Object.hasOwn(state.answers, id));
        if (!state.submitted && data.previousQuestions[current()?.id]) state.selection = [];
      }
      if ((saved.questionVersion ?? 1) < 3) {
        state.legacyAnswersV2 = Object.keys(data.previousQuestionsV2).filter((id) =>
          Object.hasOwn(state.answers, id) && !state.legacyAnswers.includes(id));
        if (!state.submitted && data.previousQuestionsV2[current()?.id]) state.selection = [];
      }
      state.questionVersion = 3;
      if (state.view === 'decision' && !state.submitted && current().shuffle
        && state.optionOrder.length !== current().options.length) shuffleOptions(current());
      save();
    } catch {
      state = blank();
    }
  }

  function change(event) {
    if (reviewIndex !== null || state.view !== 'decision' || state.submitted) return;
    const { target } = event;
    if (target.matches('[data-advisor-pair]')) {
      state.selection[Number(target.dataset.advisorPair)] = target.value === '' ? null : Number(target.value);
    } else if (target.name === 'advisor-choice') {
      const value = Number(target.value);
      if (target.type === 'radio') state.selection = [value];
      else if (target.checked) state.selection.push(value);
      else state.selection = state.selection.filter((choice) => choice !== value);
    } else return;
    save();
    const selector = target.matches('[data-advisor-pair]')
      ? `[data-advisor-pair="${target.dataset.advisorPair}"]` : `[name="advisor-choice"][value="${target.value}"]`;
    render(selector);
  }

  function advance() {
    state.index += 1;
    state.selection = [];
    state.submitted = false;
    if (state.index < (state.retry?.length ?? questions.length)) state.view = 'decision';
    else {
      state.view = 'report';
      state.retry = null;
    }
  }

  function click(event) {
    const button = event.target.closest('[data-advisor-action]');
    const action = button?.dataset.advisorAction;
    if (!action) return;
    if (action === 'review') {
      const mission = Number(button.dataset.missionIndex);
      if (!missionComplete(data.missions[mission])) return;
      reviewIndex = questions.findIndex((question) => question.mission === mission);
      render('#screen-title');
      return;
    }
    if (reviewIndex !== null) {
      if (action === 'resume') reviewIndex = null;
      else if (action === 'review-prev' && questions[reviewIndex].number > 0) reviewIndex -= 1;
      else if (action === 'review-next' && questions[reviewIndex + 1]?.mission === questions[reviewIndex].mission) reviewIndex += 1;
      render('#screen-title');
      return;
    }
    if (action === 'hint') {
      screen.querySelector('dialog').showModal();
      return;
    }
    if (action === 'summary') {
      showSummary();
      return;
    }
    let focus = '#screen-title';
    if (action === 'start') state.view = 'decision';
    else if (action === 'submit' && !state.submitted && ready(current())) {
      const question = current();
      state.answers[question.id] = [...state.selection];
      if (question.shuffle) state.answerOrders[question.id] = state.optionOrder;
      state.legacyAnswers = state.legacyAnswers.filter((id) => id !== question.id);
      state.legacyAnswersV2 = state.legacyAnswersV2.filter((id) => id !== question.id);
      state.submitted = true;
      focus = '#advisor-feedback-title';
    } else if (action === 'next' && state.submitted) {
      const question = current();
      if (!state.retry && question.number === data.missions[question.mission].questions.length - 1) state.view = 'mission';
      else advance();
    } else if (action === 'advance') advance();
    else if (action === 'retry') {
      state.retry = resultForAnswers().missed;
      state.view = 'decision';
      state.index = 0;
      state.selection = [];
      state.submitted = false;
    } else if (action === 'restart') state = { ...blank(), optionOrder: state.optionOrder };
    else return;
    if (state.view === 'decision' && !state.submitted && current().shuffle) shuffleOptions(current());
    save();
    render(focus);
  }

  return {
    open(content) {
      if (data) return;
      data = content;
      questions = data.missions.flatMap((mission, index) => mission.questions.map((question, number) => ({
        ...question, mission: index, number,
      })));
      restore();
    },
    completed,
    screenMarkup,
    click,
    change,
  };
}
