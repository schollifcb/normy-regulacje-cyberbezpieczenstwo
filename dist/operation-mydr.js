import { mydrStorageKey, newMyDrState, assessMyDr, recordMyDr, mydrReport, restoreMyDr } from './mydr-model.js';

export function createCaseStudy({ screen, render, escapeHtml: html, icon, announce, exit }) {
  let data;
  let state = newMyDrState();
  let selectedCard = null;
  let draggedCard = null;
  const current = () => data.questions[state.index];
  const completed = () => Boolean(data && data.questions.every(question => Object.hasOwn(state.records, question.id)));
  const save = () => {
    try { sessionStorage.setItem(mydrStorageKey, JSON.stringify(state)); } catch { /* Keep the current mission in memory. */ }
  };
  function shuffled(length) {
    const order = Array.from({ length }, (_, index) => index);
    for (let index = order.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [order[index], order[other]] = [order[other], order[index]];
    }
    return order;
  }
  function draft(question = current()) {
    return state.drafts[question.id] ??= {
      selected: [], assignments: question.items?.map(() => null) ?? [],
      order: shuffled(question.items?.length ?? question.options.length), submitted: false,
    };
  }
  const sourceList = ids => `<ul class="mydr-sources">${ids.map(id => {
    const [label, url] = data.sources[id];
    return `<li><a href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(label)}</a></li>`;
  }).join('')}</ul>`;
  function facts() {
    return `<details class="mydr-facts"><summary>Na jakim zdarzeniu oparto scenariusz?</summary>
      ${data.facts.map(text => `<p>${html(text)}</p>`).join('')}
      <p class="mydr-note">Stan opisu historycznego: komunikaty z 12–13 sierpnia 2026 r.</p>
      ${sourceList(['mc', 'uodo', 'prokuratura'])}<p class="mydr-fiction">${html(data.disclaimer)}</p></details>`;
  }
  function indicators() {
    const report = mydrReport(data, state);
    return `<div class="mydr-indicators">${report.indicators.map(item => `<div>
      <span>${icon(item.icon)}${html(item.label)}</span>
      <progress aria-label="Postęp wiedzy: ${html(item.label)}" value="${item.points}" max="${item.maximum}"></progress>
      <small>${item.percent}% punktów w tym obszarze</small></div>`).join('')}</div>
      <p class="mydr-note">Wskaźniki dotyczą Twojej wiedzy w symulacji. Nie mierzą rzeczywistego bezpieczeństwa szpitala.</p>`;
  }
  function selection() {
    const started = Object.keys(state.drafts).length > 0;
    return `<p class="kicker">ĆWICZENIE 4 · CASE STUDY</p><h2 id="screen-title" tabindex="-1">Wybierz scenariusz</h2>
      <article class="mydr-scenario"><div class="mydr-scenario-icon">${icon('hospital')}</div><div>
        <h3>${html(data.title)}</h3><p class="lead">${html(data.subtitle)}</p>
        <ul class="mydr-meta"><li>15–20 minut</li><li>Poziom podstawowy</li><li>6 etapów</li><li>Interaktywna symulacja</li></ul>
        <p>Pomóż fikcyjnemu szpitalowi podjąć decyzje po incydencie u dostawcy.</p>
        <div class="actions"><button type="button" class="primary" data-mydr-action="brief">${completed() ? 'Zobacz scenariusz' : started ? 'Wznów' : 'Rozpocznij'}</button>
        ${completed() && !state.retryIds ? '<button type="button" class="admin-secondary" data-mydr-action="report">Zobacz swój wynik</button>' : ''}</div>
      </div></article>`;
  }
  function brief() {
    return `<p class="kicker">ALERT · ${html(data.date)}</p><h2 id="screen-title" tabindex="-1">🚨 ${html(data.title)}</h2>
      <p class="lead">${html(data.subtitle)}</p><div class="case-context mydr-alert">${icon('hospital')}<p>${html(data.brief)}</p></div>
      <p class="mydr-fiction">${html(data.disclaimer)}</p>
      <h3>Twoja misja</h3><p>${html(data.mission)}</p>${indicators()}
      <p class="mydr-note">Bez limitu czasu. Możesz poprawiać decyzje lub przejść dalej po informacji zwrotnej. 2 pkt za poprawną pierwszą próbę, 1 pkt za częściową lub poprawioną odpowiedź, 0 pkt za brak poprawnego rozwiązania. Bez punktów ujemnych.</p>
      <div class="actions"><button type="button" class="primary" data-mydr-action="start">${state.retryIds ? 'Wznów powtórkę' : completed() ? 'Zobacz wynik misji' : Object.keys(state.records).length ? 'Wznów misję' : 'Rozpocznij misję'}</button>
      <button type="button" class="admin-secondary" data-mydr-action="list">Wróć do Ćwiczenia 4</button></div>${facts()}`;
  }
  function navigation() {
    const question = current();
    const done = Object.keys(state.records).length;
    return `<div class="mydr-progress"><span>${state.retryIds ? `Powtórka · Zadanie ${state.retryPosition + 1} z ${state.retryIds.length}` : `Etap ${question.stage + 1} z 6 · ${html(data.stages[question.stage].title)}`}</span>
      <progress aria-label="Postęp misji" value="${state.retryIds ? state.retryPosition : done}" max="${state.retryIds?.length ?? data.questions.length}"></progress>
      <small>${done} z ${data.questions.length} rozpatrzonych zadań · etap orientacyjnie ${html(data.stages[question.stage].time)} · bez limitu czasu</small></div>
      ${state.retryIds ? '' : `<nav class="mydr-stage-nav" aria-label="Etapy Operacji MyDr">${data.stages.map((stage, index) => {
        const first = data.questions.findIndex(question => question.stage === index);
        const done = data.questions.filter(question => question.stage === index).every(question => state.records[question.id]);
        return `<button type="button" data-mydr-action="stage" data-index="${first}" ${first > state.furthest ? 'disabled' : ''} ${question.stage === index ? 'aria-current="step"' : ''}>
          <span>${done ? '✓' : index + 1}</span>${html(stage.short)}</button>`;
      }).join('')}</nav>`}`;
  }
  function matching(question, value) {
    return `<p class="mydr-note">Wybierz kartę, a potem obszar. Możesz też przeciągnąć kartę. Dopasowanie można zmienić przed zatwierdzeniem.</p>
      <div class="mydr-matching"><div><h3>Karty do przyporządkowania</h3><div class="mydr-cards">${value.order.map(index => {
        const assigned = value.assignments[index];
        const checked = value.submitted ? assigned === question.answer[index] ? ' mydr-correct' : ' mydr-reconsider' : '';
        return `<button type="button" class="mydr-card${checked}" data-mydr-card="${index}" draggable="${!value.submitted}"
          aria-pressed="${selectedCard === index}" ${value.submitted ? 'disabled' : ''}>
          <span>${html(question.items[index])}</span><small>${assigned === null ? 'Nieprzyporządkowana' : html(question.targets[assigned])}</small>
          ${value.submitted ? `<small>${checked === ' mydr-correct' ? '✓ Poprawne dopasowanie' : '◇ Sprawdź dopasowanie'}</small>` : ''}</button>`;
      }).join('')}</div></div><div><h3>Obszary dopasowania</h3><div class="mydr-targets">${question.targets.map((target, index) => {
        const assigned = question.items.map((item, card) => value.assignments[card] === index ? item : null).filter(Boolean);
        return `<button type="button" data-mydr-target="${index}" ${value.submitted ? 'disabled' : ''}>
          <strong>${html(target)}</strong>${assigned.length ? assigned.map(item => `<span>${html(item)}</span>`).join('') : '<small>Umieść kartę tutaj</small>'}</button>`;
      }).join('')}</div></div></div>`;
  }
  function choices(question, value) {
    const multiple = question.type === 'multi';
    return `<fieldset class="mydr-choices" ${value.submitted ? 'disabled' : ''}><legend>${multiple ? `Wybierz ${question.limit} odpowiedzi.` : 'Wybierz jedną odpowiedź.'}</legend>
      ${value.order.map((index, position) => {
        const selected = value.selected.includes(index);
        const mark = value.submitted && selected ? question.answer.includes(index) ? ' mydr-correct' : ' mydr-reconsider' : '';
        return `<label class="${mark}"><input type="${multiple ? 'checkbox' : 'radio'}" name="mydr-choice" value="${index}"
          ${selected ? 'checked' : ''} ${multiple && !selected && value.selected.length >= question.limit ? 'disabled' : ''}>
          <span><strong>${String.fromCharCode(65 + position)}.</strong> ${html(question.options[index])}
          ${value.submitted && selected ? `<small>${mark === ' mydr-correct' ? '✓ Trafny wybór' : '◇ Warto przemyśleć'}</small>` : ''}</span></label>`;
      }).join('')}</fieldset>`;
  }
  function feedback(question, value) {
    const quality = assessMyDr(question, value);
    const record = state.records[question.id];
    const consequence = question.type === 'single' ? question.consequences[value.selected[0]]
      : quality < 1 ? question.consequence : 'Rozpoznane elementy pomagają szpitalowi dobrać działania chroniące dane pacjentów.';
    const stage = data.stages[question.stage];
    const stageKnown = mydrReport(data, state).badges.includes(stage);
    return `<section class="mydr-feedback ${quality === 1 ? 'mydr-correct' : 'mydr-reconsider'}" aria-labelledby="mydr-feedback-title">
      <h3 id="mydr-feedback-title" tabindex="-1">${quality === 1 ? '✓ Dobra decyzja' : quality > 0 ? '◇ Częściowo poprawnie' : '◇ Spójrz na to jeszcze raz'} · ${record.points}/2 pkt</h3>
      <p><strong>Konsekwencja decyzji.</strong> ${html(consequence)}</p>
      ${question.explanation.map(text => `<p>${html(text)}</p>`).join('')}
      ${question.reasons ? `<details><summary>Uzasadnienie poszczególnych elementów</summary><ul class="mydr-reasons">${question.reasons.map((reason, index) => {
        const selected = question.type === 'match' || value.selected.includes(index);
        const good = question.type === 'match' ? value.assignments[index] === question.answer[index] : question.answer.includes(index);
        return selected ? `<li><strong>${html((question.items ?? question.options)[index])}</strong><span>${good ? html(reason) : `Sprawdź ten element. ${html(reason)}`}</span></li>` : '';
      }).join('')}</ul></details>` : ''}
      <p class="mydr-principle"><strong>Poznana zasada.</strong> ${html(question.principle)}</p>
      ${quality < 1 ? `<p class="mydr-note">${html(question.hint)} Możesz poprawić decyzję albo przejść dalej.</p>` : ''}
      ${stageKnown ? `<span class="mydr-badge">${icon('check')} ${html(stage.badge)}</span>` : ''}
      ${question.refs.length ? `<details class="mydr-facts"><summary>Źródła i materiały</summary>${sourceList(question.refs)}</details>` : ''}
    </section>`;
  }
  function ready(question, value) {
    return question.type === 'match' ? value.assignments.every(index => index !== null)
      : question.type === 'multi' ? value.selected.length === question.limit : value.selected.length === 1;
  }
  function mission() {
    const question = current();
    const value = draft();
    return `${navigation()}<div class="mydr-toolbar"><button type="button" class="admin-secondary" data-mydr-action="list">Wróć do Ćwiczenia 4</button>
      ${completed() && !state.retryIds ? '<button type="button" class="admin-secondary" data-mydr-action="report">Wróć do wyniku</button>' : ''}</div>
      <aside class="case-context mydr-alert"><div><p class="kicker">${html(question.sceneTitle)}</p>
        ${question.fictionalMessage ? '<p class="mydr-fiction">Fikcyjny element symulacji dydaktycznej. To nie jest rzeczywista korespondencja MyDr.</p>' : ''}
        <p>${html(question.scene)}</p></div></aside>
      <h2 id="screen-title" tabindex="-1">${html(question.title)}</h2><p class="lead">${html(question.prompt)}</p>
      ${question.warning ? `<p class="mydr-fiction">${html(question.warning)}</p>` : ''}
      ${question.type === 'match' ? matching(question, value) : choices(question, value)}
      ${question.id === 'cia' ? `<ul class="mydr-cia" aria-label="Triada CIA">${['Confidentiality · Poufność', 'Integrity · Integralność', 'Availability · Dostępność'].map((label, index) => `<li class="${value.submitted && index === 0 ? 'mydr-cia-active' : ''}">${icon(['lock', 'stack', 'pulse'][index])}${label}</li>`).join('')}</ul>` : ''}
      ${value.submitted ? feedback(question, value) : ''}
      <div class="actions mydr-actions">
        <button type="button" class="admin-secondary" data-mydr-action="back" ${(state.retryIds ? state.retryPosition : state.index) === 0 ? 'disabled' : ''}>Poprzednie zadanie</button>
        ${value.submitted ? `${assessMyDr(question, value) < 1 ? '<button type="button" class="admin-secondary" data-mydr-action="edit">Popraw decyzję</button>' : ''}
          <button type="button" class="primary" data-mydr-action="next">${(state.retryIds ? state.retryPosition === state.retryIds.length - 1 : state.index === data.questions.length - 1) ? 'Zobacz podsumowanie' : 'Dalej'}</button>`
          : `<button type="button" class="primary" data-mydr-action="submit" ${ready(question, value) ? '' : 'disabled'}>Zatwierdź decyzję</button>`}
      </div><p class="mydr-note">Symulacja dydaktyczna. Postęp zapisuje się w tej sesji przeglądarki. Nie ma odliczania czasu.</p>`;
  }
  function report() {
    const result = mydrReport(data, state);
    return `<p class="kicker">🏆 MISSION COMPLETE</p><h2 id="screen-title" tabindex="-1">${html(data.title)}</h2>
      <p class="lead">Pomogłeś szpitalowi przejść przez incydent u dostawcy.</p>
      <div class="mydr-result"><div><strong>${result.percent}%</strong><span>${result.points} z ${result.maximum} pkt · 6 etapów zakończonych</span></div>
        <div><h3>${result.rank}</h3><p>${html(result.description)}</p></div></div>
      ${state.retryFinished ? `<p class="mydr-review-done" role="status">Powtórka zakończona. Liczba utrwalonych zagadnień w tej rundzie: ${state.retryDone}. Wynik uwzględnia zdobyte punkty; poprawiona odpowiedź otrzymuje do 1 pkt.</p>` : ''}
      <h3>Twoja karta wyników</h3><ul class="mydr-results">${result.areas.map(area => `<li><span>${html(area.label)}</span>
        <strong class="${area.status === 'Opanowane' ? 'mydr-text-good' : 'mydr-text-review'}">${area.status === 'Opanowane' ? '✅' : area.status === 'Do utrwalenia' ? '🟡' : '🔴'} ${area.status} <small>${area.points}/${area.maximum} pkt</small></strong></li>`).join('')}</ul>
      <h3>Odznaki za rozpoznane zasady</h3><div class="mydr-badges">${result.badges.length ? result.badges.map(stage => `<span class="mydr-badge">${icon('check')} ${html(stage.badge)}</span>`).join('') : '<p>Wróć do pytań, aby utrwalić zasady i zdobyć odznaki.</p>'}</div>
      ${indicators()}<h3>Twój dziennik decyzji</h3><div class="mydr-decision-log">${data.questions.map((question, index) => `<details><summary>${html(question.title)} · ${state.records[question.id].points}/2 pkt</summary>
        <p>${html(question.principle)}</p><button type="button" class="admin-secondary" data-mydr-action="review" data-index="${index}">Zobacz decyzję i wyjaśnienie</button></details>`).join('')}</div>
      <p class="mydr-note">Model dydaktyczny zależności, a nie hierarchia prawna.</p><ol class="mydr-chain" aria-label="Od celu organizacji do działania">${['Biznes', 'Ryzyko', 'Regulacje', 'Zabezpieczenia', 'Technologia'].map(label => `<li>${label}</li>`).join('')}</ol>
      <div class="actions mydr-actions">${result.missed.length ? '<button type="button" class="primary" data-mydr-action="retry">Powtórz błędne pytania</button>' : '<p class="mydr-text-good">Wszystkie zadania rozwiązane poprawnie!</p>'}
        <button type="button" class="admin-secondary" data-mydr-action="list">Wróć do Ćwiczenia 4</button>
        <button type="button" class="admin-secondary" data-mydr-action="restart">Rozpocznij całą misję od nowa</button></div>${facts()}`;
  }
  function update(focus = '#screen-title') {
    save(); render(focus);
  }
  function assign(index, target) {
    const question = current();
    const value = draft();
    if (state.view !== 'mission' || value.submitted || !Number.isInteger(index) || index < 0 || index >= question.items.length
      || !Number.isInteger(target) || target < 0 || target >= question.targets.length) return;
    if (question.unique) value.assignments = value.assignments.map((assigned, card) => card !== index && assigned === target ? null : assigned);
    value.assignments[index] = target;
    selectedCard = null;
    update(`[data-mydr-card="${index}"]`);
    announce(`Przyporządkowano kartę do: ${question.targets[target]}.`);
  }
  function click(event) {
    const card = event.target.closest('[data-mydr-card]');
    if (card && !draft().submitted) {
      selectedCard = selectedCard === Number(card.dataset.mydrCard) ? null : Number(card.dataset.mydrCard);
      render(`[data-mydr-card="${card.dataset.mydrCard}"]`);
      announce(selectedCard === null ? 'Anulowano wybór karty.' : 'Wybrano kartę. Teraz wybierz obszar dopasowania.');
      return;
    }
    const target = event.target.closest('[data-mydr-target]');
    if (target) {
      if (selectedCard !== null) assign(selectedCard, Number(target.dataset.mydrTarget));
      else announce('Najpierw wybierz kartę do przyporządkowania.');
      return;
    }
    const button = event.target.closest('[data-mydr-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.mydrAction;
    let focus = '#screen-title';
    if (action === 'brief') state.view = 'brief';
    else if (action === 'list') state.view = 'select';
    else if (action === 'exit') { exit(); return; }
    else if (action === 'start') { state.view = completed() && !state.retryIds ? 'report' : 'mission'; if (state.view === 'mission') draft(); }
    else if (action === 'report' && completed()) state.view = 'report';
    else if (action === 'restart') { state = newMyDrState(); state.view = 'brief'; }
    else if (action === 'retry' && completed()) {
      state.retryIds = mydrReport(data, state).missed;
      if (!state.retryIds.length) return;
      state.retryPosition = 0; state.retryDone = 0; state.retryFinished = false;
      state.index = data.questions.findIndex(question => question.id === state.retryIds[0]);
      for (const id of state.retryIds) delete state.drafts[id];
      // Keep records for scoring; create fresh drafts for the questions in this review.
      for (const id of state.retryIds) draft(data.questions.find(question => question.id === id));
      state.view = 'mission';
    } else if ((action === 'stage' || action === 'review') && !state.retryIds) {
      const index = Number(button.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index > state.furthest || index >= data.questions.length) return;
      state.index = index; state.view = 'mission'; draft();
    } else if (action === 'edit' && state.view === 'mission') {
      draft().submitted = false; focus = current().type === 'match' ? '[data-mydr-card]' : '[name="mydr-choice"]';
    } else if (action === 'submit' && state.view === 'mission' && !draft().submitted && ready(current(), draft())) {
      const question = current();
      state.records[question.id] = recordMyDr(question, draft(), state.records[question.id]);
      draft().submitted = true; focus = '#mydr-feedback-title';
      announce(`Decyzja zapisana. ${state.records[question.id].points} z 2 punktów.`);
    } else if (action === 'next' && state.view === 'mission' && draft().submitted) {
      if (state.retryIds) {
        state.retryPosition += 1;
        if (state.retryPosition === state.retryIds.length) {
          state.retryDone = state.retryIds.filter(id => state.records[id].quality === 1).length;
          state.retryFinished = true;
          state.retryIds = null; state.retryPosition = 0; state.view = 'report';
        } else state.index = data.questions.findIndex(question => question.id === state.retryIds[state.retryPosition]);
      } else if (state.index === data.questions.length - 1) state.view = 'report';
      else { state.index += 1; state.furthest = Math.max(state.furthest, state.index); }
      if (state.view === 'mission') draft();
    } else if (action === 'back' && state.view === 'mission') {
      if (state.retryIds && state.retryPosition > 0) {
        state.retryPosition -= 1;
        state.index = data.questions.findIndex(question => question.id === state.retryIds[state.retryPosition]);
      } else if (!state.retryIds && state.index > 0) state.index -= 1;
      else return;
    } else return;
    selectedCard = null; draggedCard = null;
    update(focus);
  }
  function change(event) {
    if (state.view !== 'mission' || draft().submitted || event.target.name !== 'mydr-choice') return;
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value < 0 || value >= current().options.length) return;
    if (current().type === 'single') draft().selected = [value];
    else if (event.target.checked && !draft().selected.includes(value) && draft().selected.length < current().limit) draft().selected.push(value);
    else if (!event.target.checked) draft().selected = draft().selected.filter(index => index !== value);
    update(`[name="mydr-choice"][value="${value}"]`);
  }
  return {
    completed, click, change,
    screenMarkup() {
      const views = { select: selection, brief, mission, report };
      return `<section class="panel mydr-panel" aria-labelledby="screen-title">${views[state.view]()}</section>`;
    },
    open(content) {
      if (data) return;
      data = content;
      try { state = restoreMyDr(JSON.parse(sessionStorage.getItem(mydrStorageKey)), data); } catch { state = newMyDrState(); }
      if (state.view === 'mission') draft();
      save();
    },
    dragStart(event) {
      const card = event.target.closest('[data-mydr-card]');
      if (!card || draft().submitted) return;
      draggedCard = Number(card.dataset.mydrCard);
      event.dataTransfer.setData('text/plain', String(draggedCard));
      event.dataTransfer.effectAllowed = 'move';
    },
    dragOver(event) {
      if (draggedCard === null || !event.target.closest('[data-mydr-target]') || draft().submitted) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    },
    drop(event) {
      const target = event.target.closest('[data-mydr-target]');
      if (draggedCard === null || !target) return;
      event.preventDefault(); assign(draggedCard, Number(target.dataset.mydrTarget)); draggedCard = null;
    },
    leave() { selectedCard = null; draggedCard = null; },
  };
}
