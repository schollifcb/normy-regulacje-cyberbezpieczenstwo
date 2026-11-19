import { newCaseState, assessCaseStep, hasCaseCriticalError, configIssues, identityResult,
  readyToEnable, caseCapacity, caseUnresolved, casePassed } from './case-model.js';

const storageKey = 'medinova-case-study-v1';
const clone = (value) => JSON.parse(JSON.stringify(value));
const issueLabels = {
  scope: 'Uzupełnij zakres i odrębne ścieżki tożsamości.', staff: 'Obejmij pracowników i aktywne oraz kwalifikowane role.',
  vendors: 'Zabezpiecz administratorów dostawcy w zakresie i polityce.', resources: 'Obejmij wszystkie zasoby dedykowanych kont administracyjnych.',
  locations: 'Usuń obejście przez zaufaną lokalizację.', platforms: 'Obejmij wszystkie obsługiwane platformy.',
  strength: 'Wymagaj uwierzytelniania odpornego na phishing.', emergency: 'Przygotuj dwa nazwane konta awaryjne z niezależnym FIDO2.',
  workload: 'Zastosuj odrębną kontrolę tożsamości usług.', monitoring: 'Uzupełnij logi, alerty i przeglądy.',
  procedure: 'Popraw kolejność bezpiecznej zmiany.',
};

export function createCaseStudy({ screen, render, escapeHtml: html, icon, announce, exit }) {
  let data;
  let state = newCaseState();
  let review = null;
  let returnStage = null;
  let selectedCard = null;
  let dirty = false;
  let active = false;
  let timer;
  let configNotice = '';
  let draggedCard = null;
  const completed = () => Boolean(data && casePassed(state, data));
  const displayStage = () => review ?? state.stage;
  const step = () => data.steps[displayStage()];

  function save() {
    try { sessionStorage.setItem(storageKey, JSON.stringify(state)); } catch { /* Keep in-memory progress. */ }
  }

  function event(message, kind = 'info') {
    const elapsed = state.startedAt ? Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000)) : 0;
    state.events.push({ seconds: elapsed, message, kind });
    state.events = state.events.slice(-250);
  }

  function remaining() {
    if (!state.startedAt) return data.durationSeconds;
    return Math.max(0, data.durationSeconds - Math.floor(((state.endedAt ?? Date.now()) - state.startedAt) / 1000));
  }

  function formattedTime(seconds) {
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function finish(timedOut = false) {
    state.endedAt = Date.now();
    state.timedOut = timedOut;
    state.stage = data.steps.length;
    review = null;
    event(timedOut ? 'Upłynęło 20 minut. Zespół przekazuje dyrekcji aktualny stan szpitala.' : 'Zespół przekazuje dyrekcji podsumowanie i pakiet dowodowy.');
    save();
    clearInterval(timer);
    render('#screen-title');
  }

  function tick() {
    if (!active || !data) return;
    if (state.startedAt && !state.endedAt && remaining() <= 0) {
      finish(true);
      announce('Upłynął czas symulacji. Raport przedstawia stan szpitala.');
      return;
    }
    const clock = screen.querySelector('[data-case-clock]');
    if (clock) clock.textContent = formattedTime(remaining());
  }

  function startClock() {
    clearInterval(timer);
    tick();
    timer = setInterval(tick, 1000);
  }

  function status() {
    const s = caseCapacity(state, data);
    const message = state.outage ? 'Administratorzy utracili dostęp. Uruchom plan wycofania, aby przywrócić obsługę MediCore.'
      : state.attack === 'succeeded' ? 'Przejęto konto dostawcy. Izba przyjęć używa dokumentacji papierowej, zlecenia wymagają ręcznej weryfikacji.'
        : state.attack === 'blocked' ? 'Próba przejęcia konta dostawcy została zatrzymana. MediCore pozostaje dostępny.'
          : 'Leczenie trwa. Niezabezpieczone konta administracyjne nadal wymagają ochrony.';
    return `<section class="cs-status cs-${s.tone}" aria-label="Status szpitala">
      <div class="cs-status-main"><div><span>Zdolność leczenia pacjentów</span><strong>${s.capacity}% <small>${s.status}</small></strong></div>
        <div class="cs-clock"><span>Do posiedzenia dyrekcji</span><strong data-case-clock aria-label="Pozostały czas">${formattedTime(remaining())}</strong></div></div>
      <div class="cs-capacity-track" aria-hidden="true"><i style="width:${s.capacity}%"></i></div>
      <div class="cs-vitals"><dl>
        ${[['MediCore i dokumentacja', s.records], ['Diagnostyka i zlecenia leków', s.clinical],
    ['Dostęp uprzywilejowany', s.access], ['Reakcja i odtwarzanie', s.response]].map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('')}</dl></div>
      <p class="cs-operational">${message}</p>
    </section>`;
  }

  function toolbar() {
    return `<div class="cs-toolbar"><button class="admin-secondary" type="button" data-case-action="facts">Dane szpitala</button>
      <span>Konsultacja ekspercka</span>${Object.entries(data.consultations).map(([id, item]) =>
        `<button type="button" class="admin-secondary" data-case-consult="${id}">${html(item.title)}${state.consultations.some((c) => c.id === id) ? ' ✓' : ''}</button>`).join('')}</div>`;
  }

  function progress() {
    if (state.stage < 0) return '';
    return `<nav class="cs-progress" aria-label="Etapy Case Study">${data.steps.map((item, index) => {
      const visited = state.decisions[item.id] || index === state.stage;
      return `<button type="button" data-case-review="${index}" ${visited ? '' : 'disabled'}
        ${index === displayStage() ? 'aria-current="step"' : ''}>${state.decisions[item.id] ? '✓ ' : ''}${html(item.short)}</button>`;
    }).join('')}</nav>`;
  }

  function log() {
    return `<aside class="cs-log" aria-label="Dziennik zdarzeń szpitala"><h3>Dziennik szpitala</h3>
      <ol>${[...state.events].reverse().map(({ seconds, message, kind }) => {
        const minutes = 7 * 60 + 40 + Math.floor(seconds / 60);
        const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
        return `<li class="cs-event-${kind}"><time>${time}</time><span>${html(message)}</span></li>`;
      }).join('')}</ol>
      ${state.events.length ? '' : '<p>07:40 · SOC obserwuje intensywne próby logowania.</p>'}</aside>`;
  }

  function briefing() {
    return `<h2 id="screen-title" tabindex="-1">${html(data.title)}</h2><p class="lead">${html(data.subtitle)}</p>
      <div class="cs-brief"><span class="cs-hospital">${icon('hospital')}</span><div><h3>07:40 · MediNova</h3>
        <p>Jesteś koordynatorem Security & Risk w zespole kryzysowym. Za 20 minut rozpoczyna się posiedzenie dyrekcji.
        Sześć kont uprzywilejowanych nie ma MFA, a SOC rejestruje próby logowania. Doprowadź zespół od celu leczenia do działającej i przetestowanej ochrony.</p></div></div>
      <ul class="cs-brief-facts"><li><strong>30 min</strong> tolerowanego przestoju MediCore</li><li><strong>14</strong> kont uprzywilejowanych</li><li><strong>6</strong> kont bez MFA</li></ul>
      <p>Decyzje zmieniają sytuację operacyjną. Możesz je poprawić, skorzystać z trzech rodzajów konsultacji i przejrzeć wcześniejsze etapy. Zegar biegnie również po wyjściu z ćwiczenia.</p>
      <p class="cs-note">Planowany czas przejścia to ${html(data.targetMinutes)}. Po 20 minutach symulacja zakończy się raportem z aktualnego stanu.</p>
      <p class="cs-note">Wskaźnik to szkoleniowa prognoza utrzymania normalnej pracy przez kolejne cztery godziny. MediNova i jej konta są fikcyjne.</p>
      <div class="actions"><button type="button" class="primary" data-case-action="start">Wejdź do zespołu kryzysowego</button></div>`;
  }

  function draftFor(item) {
    state.drafts[item.id] ??= { choice: null, selected: [], assignments: [], order: shuffle(item.items?.length ?? 0) };
    return state.drafts[item.id];
  }

  function shuffle(size) {
    const items = Array.from({ length: size }, (_, index) => index);
    for (let index = size - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [items[index], items[other]] = [items[other], items[index]];
    }
    return items;
  }

  function choices(item, draft, readOnly) {
    return `<fieldset class="cs-choices" ${readOnly ? 'disabled' : ''}><legend>${html(item.prompt)}</legend>
      ${item.options.map((text, index) => `<label><input type="radio" name="case-choice" value="${index}" ${draft.choice === index ? 'checked' : ''}><span>${html(text)}</span></label>`).join('')}</fieldset>`;
  }

  function checkboxes(items, draft, legend, readOnly) {
    return `<fieldset class="cs-choices cs-checks" ${readOnly ? 'disabled' : ''}><legend>${legend}</legend>
      ${items.map((text, index) => `<label><input type="checkbox" data-case-check="${index}" ${draft.selected.includes(index) ? 'checked' : ''}><span>${html(text)}</span></label>`).join('')}</fieldset>`;
  }

  function matching(item, draft, readOnly) {
    const labels = item.slots ?? item.items.map((_, index) => `Krok ${index + 1}`);
    return `<p class="cs-note">Wybierz kartę i jej miejsce. Możesz też przeciągnąć kartę. Aby zmienić przypisanie, wybierz nową kartę lub zwolnij zajęte miejsce.</p>
      <div class="cs-matching"><ol class="cs-slots">${labels.map((label, index) => `<li><button type="button" data-case-slot="${index}" ${readOnly ? 'disabled' : ''}>
        <strong>${html(label)}</strong><span>${Number.isInteger(draft.assignments[index]) ? html(item.items[draft.assignments[index]]) : 'Wybierz kartę'}</span></button></li>`).join('')}</ol>
      <ul class="cs-cards">${draft.order.filter((index) => !draft.assignments.includes(index)).map((index) =>
        `<li><button type="button" draggable="${!readOnly}" data-case-card="${index}" aria-pressed="${selectedCard === index}" ${readOnly ? 'disabled' : ''}>${icon('grip')}${html(item.items[index])}</button></li>`).join('')}</ul></div>`;
  }

  function classifications(item, draft, readOnly) {
    return `<div class="cs-classify">${item.items.map((text, index) => `<label><span>${html(text)}</span>
      <select data-case-assignment="${index}" ${readOnly ? 'disabled' : ''}><option value="">Wybierz kategorię</option>
        ${item.groups.map((group, value) => `<option value="${value}" ${draft.assignments[index] === value ? 'selected' : ''}>${html(group)}</option>`).join('')}</select></label>`).join('')}</div>`;
  }

  function filled(item, draft) {
    if (item.type === 'single') return draft.choice !== null;
    if (item.type === 'business' || item.type === 'evidence') return draft.choice !== null && draft.selected.length > 0;
    return item.items.every((_, index) => Number.isInteger(draft.assignments[index])) && (!item.soa || draft.selected.length > 0);
  }

  function decisionFeedback(item, record) {
    if (!record || dirty) return '';
    const good = record.quality === 1;
    return `<section class="cs-feedback ${good ? 'cs-good' : 'cs-warn'}" tabindex="-1" id="case-feedback">
      <h3>${good ? 'Plan wspiera pracę szpitala' : 'Plan wymaga korekty'}</h3>
      <p>${html(good ? item.success : item.failure)}</p><p>${html(item.explanation)}</p>
      ${good ? '' : '<p>Możesz zmienić wybór i ponownie zatwierdzić decyzję. Pierwotny skutek pozostaje w dzienniku.</p>'}</section>`;
  }

  function decisionScreen() {
    const item = step();
    const readOnly = review !== null;
    const record = state.decisions[item.id];
    const draft = readOnly && record ? record.draft : draftFor(item);
    dirty = !readOnly && Boolean(record && JSON.stringify(draft) !== JSON.stringify(record.draft));
    let fields = '';
    if (item.options) fields += choices(item, draft, readOnly);
    if (item.type === 'business' || item.type === 'evidence') fields += checkboxes(item.items, draft,
      item.type === 'business' ? 'Zaznacz trzy kluczowe zależności' : 'Wybierz elementy pakietu dowodowego', readOnly);
    if (item.type === 'classify') fields += classifications(item, draft, readOnly);
    if (item.type === 'chain' || item.type === 'sequence') fields += matching(item, draft, readOnly);
    if (item.soa) fields += checkboxes(item.soa, draft, 'Co ma zastosowanie w Deklaracji Stosowania?', readOnly);
    return `<h2 id="screen-title" tabindex="-1">${html(item.title)}</h2><p class="lead">${html(item.intro)}</p>
      ${fields}${decisionFeedback(item, record)}
      ${readOnly ? '' : `<div class="actions">
        <button class="admin-secondary" type="button" data-case-action="commit" ${filled(item, draft) ? '' : 'disabled'}>Zatwierdź decyzję</button>
        <button class="primary" type="button" data-case-action="next" ${!dirty && record && !hasCaseCriticalError(item, record.draft) ? '' : 'disabled'}>${returnStage !== null ? 'Wróć do konfiguracji' : item.id === 'assurance' ? 'Przekaż raport dyrekcji' : 'Dalej'}</button>
      </div>${record && hasCaseCriticalError(item, record.draft) && !dirty ? '<p class="cs-critical" role="status">Decyzja krytyczna wymaga poprawy przed przejściem dalej.</p>' : ''}`}`;
  }

  function configCheck(key, text) {
    return `<label><input type="checkbox" data-case-config="${key}" ${state.config[key] ? 'checked' : ''} ${review !== null ? 'disabled' : ''}><span>${text}</span></label>`;
  }

  function configSelect(key, title, options) {
    return `<label class="cs-setting"><span>${title}</span><select data-case-config="${key}" ${review !== null ? 'disabled' : ''}>
      ${options.map(([value, text]) => `<option value="${value}" ${state.config[key] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  }

  function sandbox() {
    const readOnly = review !== null;
    const issues = configIssues(state);
    return `<h2 id="screen-title" tabindex="-1">${html(step().title)}</h2><p class="lead">${html(step().intro)}</p>
      <div class="cs-portal-title"><strong>CA-PRIV-001 · Phishing-resistant MFA for privileged access</strong>
        <span class="cs-deployment">Stan: ${state.deployment === 'on' ? 'On' : state.deployment === 'report-only' ? 'Report-only' : 'Off'}</span></div>
      <div class="cs-portal">
        <div class="cs-config">
          <fieldset class="cs-choices"><legend>Użytkownicy i tożsamości</legend>
            ${configCheck('staff', 'Wszyscy interaktywni administratorzy szpitala')}
            ${configCheck('roles', 'Aktywne i kwalifikowane role administracyjne')}
            ${configCheck('vendors', 'Administratorzy dostawcy MediCore')}
            ${configSelect('emergency', 'Konta awaryjne', [['include', 'Objęte zwykłą regułą'], ['named', 'Wyjątek wyłącznie BG-01 i BG-02'], ['all', 'Wyjątek dla dowolnego konta awaryjnego']])}
            ${configCheck('emergencyStrong', 'BG-01 i BG-02 mają niezależne klucze FIDO2')}
            ${configSelect('workload', 'Service principals / managed identities', [['user', 'Zwykła reguła MFA użytkownika'], ['separate', 'Odrębna kontrola tożsamości usług'], ['none', 'Wyłączone bez dodatkowej kontroli']])}
          </fieldset>
          <fieldset class="cs-choices"><legend>Zasoby, warunki i uwierzytelnianie</legend>
            ${configSelect('resources', 'Zasoby docelowe', [['medicore', 'Tylko MediCore Admin'], ['all', 'All cloud resources — dedykowane konta administracyjne'], ['azure', 'Tylko Azure Portal']])}
            ${configSelect('locations', 'Lokalizacje', [['all', 'Wszystkie lokalizacje'], ['trusted', 'Wszystkie poza trusted network']])}
            ${configSelect('platforms', 'Platformy', [['all', 'Wszystkie obsługiwane platformy'], ['windows', 'Tylko Windows']])}
            ${configSelect('strength', 'Wymagana authentication strength', [['sms', 'MFA z SMS'], ['fido', 'Phishing-resistant — FIDO2 / passkey'], ['password', 'Tylko hasło']])}
            <p class="cs-note">Reguła dotyczy interaktywnych logowań administracyjnych do MediCore Admin, Azure Portal i Microsoft 365 Admin Center.</p>
          </fieldset>
          <fieldset class="cs-choices"><legend>Monitoring i utrzymanie</legend>
            ${configCheck('soc', 'Logi logowania przekazywane do SOC')}
            ${configCheck('emergencyAlert', 'Natychmiastowy alert wysokiego priorytetu dla BG-01 / BG-02')}
            ${configCheck('sprayingAlert', 'Alert dla powtarzalnych nieudanych logowań')}
            ${configCheck('reviews', 'Kwartalny przegląd wyjątków i okresowe testy kont awaryjnych')}
          </fieldset>
        </div>
        <div class="cs-validation">
          <h3>Wdrożenie i testy</h3>
          <p class="cs-note">Report-only przewiduje skutki, ale sam nie wymusza MFA. Każda zmiana konfiguracji wymaga ponownego testu.</p>
          ${readOnly ? '' : `<div class="cs-test-actions">
            <button type="button" class="admin-secondary" data-case-action="report-only">1. Uruchom Report-only</button>
            <button type="button" class="admin-secondary" data-case-action="what-if">2. What If</button></div>`}
          <ul class="cs-checklist"><li>${state.reportOnly ? '✓' : '○'} Report-only</li><li>${state.whatIf ? '✓' : '○'} What If</li></ul>
          <ul class="cs-tests">${data.identities.map(({ id, name, account, expected }) => {
            const test = state.tests[id];
            return `<li><strong>${html(name)}</strong><small>${html(account)} · oczekiwane: ${html(expected)}</small>
              ${readOnly ? '' : `<button type="button" class="admin-secondary" data-case-test="${id}">Testuj</button>`}
              ${test ? `<p class="${test.good ? 'good' : 'cs-critical'}">${test.good ? '✓' : '⚠'} ${html(test.message)}</p>` : ''}</li>`;
          }).join('')}</ul>
          ${readOnly ? '' : `<div class="cs-test-actions">
            <button type="button" class="admin-secondary" data-case-action="logs">3. Przeanalizuj logi</button>
            <button type="button" class="admin-secondary" data-case-action="approve">4. Uzyskaj akceptację</button>
            <button type="button" class="primary" data-case-action="enable">5. Włącz politykę · On</button>
            <button type="button" class="admin-secondary" data-case-action="rollback">Plan wycofania</button>
          </div>`}
          <ul class="cs-checklist"><li>${state.logsReviewed ? '✓' : '○'} Analiza logów</li><li>${state.approved ? '✓' : '○'} Akceptacja zmiany</li>
            <li>${state.deployment === 'on' ? '✓' : '○'} Wymuszanie włączone</li></ul>
          ${configNotice ? `<p id="case-config-notice" class="cs-feedback" tabindex="-1">${html(configNotice)}</p>` : ''}
          ${state.whatIf || state.attack || state.outage || configNotice ? `<div class="cs-feedback"><h4>Ustalenia do weryfikacji</h4>
            ${issues.length ? `<ul>${issues.map((id) => `<li>${issueLabels[id]}</li>`).join('')}</ul>` : '<p>Zakres i ustawienia odpowiadają wymaganiom zmiany.</p>'}
            ${!readOnly ? '<div class="cs-test-actions"><button type="button" class="admin-secondary" data-case-fix="scope">Popraw scope</button><button type="button" class="admin-secondary" data-case-fix="procedure">Popraw procedurę</button></div>' : ''}
          </div>` : ''}
        </div>
      </div>
      ${readOnly ? '' : `<div class="actions"><button type="button" class="primary" data-case-action="next"
        ${state.deployment === 'on' && readyToEnable(state) && state.attack === 'blocked' && !state.outage ? '' : 'disabled'}>Przejdź do dowodów</button></div>`}`;
  }

  function debrief() {
    const result = caseCapacity(state, data);
    const passed = completed();
    const unresolved = caseUnresolved(state, data);
    const revisit = data.steps.filter((item) => state.decisions[item.id]?.quality !== 1 || unresolved.includes(item.id));
    const heading = passed ? result.capacity >= 90 ? 'Szpital stabilny — pełne zaliczenie' : 'Leczenie zabezpieczone — zaliczenie'
      : state.timedOut ? 'Czas minął — wymagana ponowna próba' : result.capacity >= 65 ? 'Leczenie ograniczone — wróć do wskazanych etapów' : 'Tryb kryzysowy — wymagane działania naprawcze';
    const badges = [
      ['Perspektywa pacjenta', state.decisions.business?.quality === 1],
      ['Kartograf ryzyka', state.decisions.risk?.quality === 1],
      ['Strażnik applicability', state.decisions.applicability?.quality === 1],
      ['Architekt scope', state.decisions.scope?.quality === 1],
      ['Właściciel decyzji', state.decisions.responsibility?.quality === 1],
      ['Bezpieczna zmiana', readyToEnable(state) && !state.errors.includes('direct-enable')],
      ['Ciągłość leczenia', result.capacity >= 90],
      ['Pełny łańcuch', data.steps.every((item) => state.decisions[item.id]?.quality === 1) && state.errors.length === 0],
    ].filter(([, achieved]) => achieved);
    return `<p class="kicker">DEBRIEFING</p><h2 id="screen-title" tabindex="-1">${heading}</h2>
      <p class="lead">${state.timedOut ? 'Raport uwzględnia stan z chwili zakończenia 20 minut.' : 'Dyrekcja otrzymuje indywidualny bilans decyzji i gotowości szpitala.'}</p>
      <div class="cs-outcome"><strong>${result.capacity}%</strong><span>Zdolność leczenia · ${result.status}</span></div>
      ${unresolved.length ? `<p class="cs-critical">Pozostały nierozwiązane decyzje krytyczne: ${unresolved.map((id) => html(data.steps.find((item) => item.id === id).short)).join(', ')}.</p>` : ''}
      <h3>Łańcuch decyzji</h3>
      <p class="cs-chain-summary">Leczenie pacjentów · dostęp do dokumentacji, wyników i zleceń · ryzyko przejęcia konta · wymagania RODO i NIS2/KSC · ISO/IEC 27001 i 27002 · NIST CSF · CIS Controls / MCSB · polityka · procedura · Entra Conditional Access · phishing-resistant MFA · monitoring, testy i dowody</p>
      <h3>Twój przebieg</h3><ul class="cs-summary-list">${data.steps.map((item) => `<li>
        <span>${html(item.title)}</span><strong>${state.decisions[item.id]?.quality === 1 ? '✓ Przygotowano' : state.decisions[item.id] ? 'Do ponownej analizy' : 'Nieukończone'}</strong></li>`).join('')}</ul>
      <div class="cs-badges">${badges.map(([name]) => `<span>${icon('check')}${name}</span>`).join('')}</div>
      <h3>Konsultacje</h3><p>${state.consultations.length ? state.consultations.map(({ id, stage }) => `${html(data.consultations[id].title)} · ${html(data.steps[stage]?.short ?? 'Briefing')}`).join(', ') : 'Nie korzystano z konsultacji eksperckich.'}</p>
      <p class="cs-note">Konsultacje pomagają w pracy zespołu i nie obniżają wyniku. W dzienniku widać też pierwotne skutki decyzji i ich korekty.</p>
      ${revisit.length ? `<h3>Etapy do powtórzenia</h3><div class="cs-remediation">${revisit.map((item) =>
        `<button type="button" class="admin-secondary" data-case-remediate="${item.id}" ${state.timedOut ? 'disabled' : ''}>${html(item.short)}</button>`).join('')}</div>` : ''}
      <div class="actions"><button type="button" class="primary" data-case-action="restart">Nowa próba · 20 minut</button>
        <button type="button" class="admin-secondary" data-case-action="exit">Wróć do ćwiczeń</button></div>
      <details class="cs-sources"><summary>Źródła i założenia symulacji</summary>
        <p>Fikcyjny scenariusz opracowany na podstawie dokumentu „Szpital pod presją”. Zdolność leczenia jest mechanizmem dydaktycznym. Portal upraszcza zachowanie Conditional Access i nie wykonuje zmian w Microsoft Entra.</p>
        <ul>${data.sources.map(([name, url]) => `<li><a href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(name)}</a></li>`).join('')}</ul></details>`;
  }

  function screenMarkup() {
    const body = displayStage() < 0 ? briefing() : displayStage() === data.steps.length ? debrief()
      : step().type === 'sandbox' ? sandbox() : decisionScreen();
    return `<section class="panel cs-panel" aria-labelledby="screen-title">
      ${status()}${toolbar()}${progress()}
      ${review !== null ? '<div class="cs-review-banner">Podgląd wcześniejszego etapu <button type="button" class="admin-secondary" data-case-action="resume">Wróć do bieżącego etapu</button></div>' : ''}
      <div class="cs-workspace"><div class="cs-main">${body}</div>${log()}</div>
      <dialog class="advisor-dialog" data-case-dialog aria-labelledby="case-dialog-title"><h3 id="case-dialog-title"></h3><div data-case-dialog-body></div>
        <form method="dialog"><button class="primary">Zamknij</button></form></dialog>
    </section>`;
  }

  function dialog(title, texts) {
    const element = screen.querySelector('[data-case-dialog]');
    element.querySelector('h3').textContent = title;
    element.querySelector('[data-case-dialog-body]').innerHTML = texts.map((text) => `<p>${html(text)}</p>`).join('');
    element.showModal();
  }

  function commit() {
    const item = step();
    const draft = draftFor(item);
    if (!filled(item, draft)) return;
    const quality = assessCaseStep(item, draft);
    if (quality < 1 && !state.errors.includes(item.id)) state.errors.push(item.id);
    const previous = state.decisions[item.id];
    state.decisions[item.id] = { quality, draft: clone(draft) };
    dirty = false;
    event(`${item.short}: ${quality === 1 ? item.success : item.failure}${previous && previous.quality < quality ? ' Zespół poprawił decyzję po opóźnieniu.' : ''}`, quality === 1 ? 'good' : 'bad');
    save();
    render('#case-feedback');
    announce(quality === 1 ? item.success : item.failure);
  }

  function resetValidation() {
    state.whatIf = false;
    state.tests = {};
    state.logsReviewed = false;
    state.approved = false;
    delete state.decisions.sandbox;
  }

  function sandboxAction(action) {
    const tested = data.identities.every(({ id }) => state.tests[id]);
    configNotice = '';
    if (action === 'report-only') {
      if (state.outage) configNotice = 'Najpierw uruchom plan wycofania.';
      else {
        state.deployment = 'report-only';
        state.reportOnly = true;
        resetValidation();
        event('Conditional Access działa w Report-only. Reguła obserwuje, ale nie wymusza MFA.');
      }
    } else if (action === 'what-if') {
      if (!state.reportOnly || state.deployment !== 'report-only') configNotice = 'Najpierw uruchom Report-only.';
      else {
        state.whatIf = true;
        const issues = configIssues(state);
        configNotice = issues.length ? 'What If ujawnia luki opisane poniżej. Popraw konfigurację lub zakres.' : 'What If przewiduje silne MFA dla administratorów, blokadę samego hasła oraz kontrolowaną ścieżkę awaryjną.';
        event(configNotice, issues.length ? 'bad' : 'good');
      }
    } else if (action === 'logs') {
      if (!tested || !state.whatIf) configNotice = 'Wykonaj What If i testy wszystkich pięciu tożsamości.';
      else {
        state.logsReviewed = true;
        configNotice = 'Przeanalizowano wyniki symulowanych logowań, blokadę samego hasła oraz test alertu dla konta awaryjnego.';
        event(configNotice);
      }
    } else if (action === 'approve') {
      if (!state.reportOnly || !state.whatIf || !state.logsReviewed || !tested
        || Object.values(state.tests).some((test) => !test.good) || configIssues(state).length) {
        configNotice = 'Właściciel zmiany wymaga poprawnego zakresu, pięciu udanych testów i przeanalizowanych logów.';
      } else {
        state.approved = true;
        event('Właściciel zmiany zatwierdził okno wdrożenia i plan wycofania.', 'good');
      }
    } else if (action === 'enable') {
      const ready = readyToEnable(state);
      state.deployment = 'on';
      state.attackCount += 1;
      const c = state.config;
      const scope = state.decisions.scope?.draft.assignments ?? [];
      if (!ready) {
        state.outage = true;
        if (!state.errors.includes('direct-enable')) state.errors.push('direct-enable');
        event('Niezweryfikowane On blokuje dwóch administratorów MediCore. Aktualizacja integracji laboratoryjnej opóźniona. Uruchom plan wycofania.', 'bad');
      }
      const vulnerable = !c.vendors || scope[1] !== 0 || c.strength !== 'fido' || c.locations !== 'all' || c.resources !== 'all' || c.platforms !== 'all';
      state.attack = vulnerable ? 'succeeded' : 'blocked';
      event(vulnerable ? 'Atak na konto dostawcy omija wymaganą ochronę. MediCore zdegradowany, izba przyjęć przechodzi na dokumentację papierową.'
        : 'Atak na konto dostawcy zatrzymany. Atakujący nie spełnia wymagań uwierzytelniania.', vulnerable ? 'bad' : 'good');
      if (ready && !state.outage) {
        state.decisions.sandbox = { quality: 1 };
        configNotice = 'Polityka wymusza silne MFA. Pięć testów, logi i akceptacja potwierdzają gotowość; SOC otrzymał alert próby ataku.';
      } else configNotice = 'Zdarzenie wpłynęło na leczenie. Wycofaj zmianę, popraw luki i przeprowadź ponowne testy.';
    } else if (action === 'rollback') {
      const safeRecovery = state.config.emergency === 'named' && state.config.emergencyStrong && state.tests.emergency?.good;
      state.deployment = 'off';
      state.outage = false;
      state.attack = null;
      state.reportOnly = false;
      resetValidation();
      event(safeRecovery ? 'Przetestowane konto awaryjne pozwoliło wycofać zmianę i przywrócić dostęp.'
        : 'Brak sprawnej ścieżki awaryjnej wydłużył odtwarzanie dostępu. Zespół wykorzystał awaryjne odzyskiwanie i przywrócił MediCore. Przygotuj i przetestuj BG-01/BG-02.', safeRecovery ? 'good' : 'bad');
      if (!safeRecovery && !state.errors.includes('recovery')) state.errors.push('recovery');
      configNotice = 'Wycofano zmianę. Przed kolejnym On wykonaj pełną weryfikację.';
    } else return false;
    save();
    render(configNotice ? '#case-config-notice' : '#screen-title');
    return true;
  }

  function click(eventObject) {
    if (!data) return;
    if (state.startedAt && !state.endedAt && remaining() <= 0) { finish(true); return; }
    const button = eventObject.target.closest('button');
    if (!button || button.disabled) return;
    const { caseAction: action, caseConsult: consult, caseReview: previous, caseCard: card,
      caseSlot: slot, caseTest: test, caseFix: fix, caseRemediate: remediate } = button.dataset;
    if (consult) {
      const item = data.consultations[consult];
      if (!state.consultations.some((entry) => entry.id === consult && entry.stage === state.stage)) {
        state.consultations.push({ id: consult, stage: state.stage });
        event(`Konsultacja: ${item.title}.`);
        save();
      }
      dialog(item.title, [item.text]);
      return;
    }
    if (action === 'facts') { dialog('Dane MediNova', data.facts); return; }
    if (previous !== undefined) {
      const index = Number(previous);
      if (index === state.stage) review = null;
      else review = index;
      dirty = false;
      selectedCard = null;
      render('#screen-title');
      return;
    }
    if (action === 'resume') { review = null; render('#screen-title'); return; }
    if (action === 'exit') { exit(); return; }
    if (review !== null) return;
    if (fix || remediate) {
      const id = fix ?? remediate;
      returnStage = fix ? state.stage : null;
      state.endedAt = null;
      state.stage = data.steps.findIndex((item) => item.id === id);
      if (id === 'scope' || id === 'procedure') {
        resetValidation();
        state.deployment = 'off';
        state.reportOnly = false;
      }
      dirty = false;
      save();
      startClock();
      render('#screen-title');
      return;
    }
    if (card !== undefined) {
      selectedCard = Number(card);
      render(`[data-case-slot="0"]`);
      announce('Wybrano kartę. Wskaż jej miejsce.');
      return;
    }
    if (slot !== undefined) {
      assignCard(Number(slot), selectedCard);
      return;
    }
    if (test) {
      if (!state.reportOnly || !state.whatIf) {
        configNotice = 'Przed testem tożsamości wykonaj Report-only i What If.';
      } else {
        state.tests[test] = identityResult(state, test);
        const identity = data.identities.find(({ id }) => id === test);
        event(`${identity.account}: ${state.tests[test].message}`, state.tests[test].good ? 'good' : 'bad');
        configNotice = `Test ${identity.account}: ${state.tests[test].message}`;
      }
      save();
      render('#case-config-notice');
      return;
    }
    if (action === 'start') {
      state.startedAt = Date.now();
      state.stage = 0;
      event('SOC obserwuje password spraying. Zespół kryzysowy rozpoczyna pracę.');
      save();
      startClock();
      render('#screen-title');
    } else if (action === 'commit') commit();
    else if (action === 'next') {
      const item = step();
      const record = state.decisions[item.id];
      if (dirty || !record || hasCaseCriticalError(item, record.draft)) return;
      if (item.id === 'sandbox' && (!readyToEnable(state) || state.deployment !== 'on' || state.outage)) return;
      if (item.id === 'assurance') { finish(); return; }
      state.stage = returnStage ?? state.stage + 1;
      returnStage = null;
      selectedCard = null;
      dirty = false;
      save();
      render('#screen-title');
    } else if (action === 'restart') {
      state = newCaseState();
      review = returnStage = selectedCard = null;
      dirty = false;
      configNotice = '';
      save();
      render('#screen-title');
    } else sandboxAction(action);
  }

  function assignCard(slot, card) {
    const draft = draftFor(step());
    if (card === null) draft.assignments[slot] = null;
    else {
      draft.assignments = draft.assignments.map((item) => item === card ? null : item);
      draft.assignments[slot] = card;
    }
    selectedCard = null;
    dirty = true;
    save();
    render(`[data-case-slot="${slot}"]`);
  }

  function change(eventObject) {
    if (review !== null || state.endedAt) return;
    const field = eventObject.target;
    const { caseAssignment: assignment, caseCheck: check, caseConfig: config } = field.dataset;
    if (config) {
      state.config[config] = field.type === 'checkbox' ? field.checked : field.value;
      resetValidation();
      state.reportOnly = false;
      if (state.deployment === 'on') event('Zmiana ustawień wyłączyła bieżące wymuszenie. Wymagana ponowna walidacja.');
      state.deployment = 'off';
      save();
      render(`[data-case-config="${config}"]`);
      return;
    }
    const draft = draftFor(step());
    if (field.name === 'case-choice') draft.choice = Number(field.value);
    else if (assignment !== undefined) draft.assignments[Number(assignment)] = field.value === '' ? null : Number(field.value);
    else if (check !== undefined) draft.selected = field.checked ? [...draft.selected, Number(check)] : draft.selected.filter((item) => item !== Number(check));
    else return;
    dirty = true;
    save();
    const selector = field.name === 'case-choice' ? `[name="case-choice"][value="${field.value}"]`
      : assignment !== undefined ? `[data-case-assignment="${assignment}"]` : `[data-case-check="${check}"]`;
    render(selector);
  }

  function dragStart(eventObject) {
    const card = eventObject.target.closest('[data-case-card]');
    if (!card || review !== null) return;
    draggedCard = Number(card.dataset.caseCard);
    eventObject.dataTransfer.setData('text/plain', String(draggedCard));
  }

  function dragOver(eventObject) {
    if (draggedCard !== null && eventObject.target.closest('[data-case-slot]')) eventObject.preventDefault();
  }

  function drop(eventObject) {
    const slot = eventObject.target.closest('[data-case-slot]');
    if (draggedCard === null || !slot) return;
    eventObject.preventDefault();
    assignCard(Number(slot.dataset.caseSlot), draggedCard);
    draggedCard = null;
  }

  return {
    completed, screenMarkup, click, change, dragStart, dragOver, drop,
    open(content) {
      data = content;
      if (!active) {
        try {
          const saved = JSON.parse(sessionStorage.getItem(storageKey));
          if (saved && Number.isInteger(saved.stage) && saved.stage >= -1 && saved.stage <= data.steps.length
            && saved.config && saved.drafts && saved.decisions && Array.isArray(saved.events) && Array.isArray(saved.errors)) {
            state = { ...newCaseState(), ...saved };
          }
        } catch { /* Continue in memory. */ }
      }
      active = true;
      if (state.startedAt && !state.endedAt && remaining() === 0) {
        state.endedAt = state.startedAt + data.durationSeconds * 1000;
        state.timedOut = true;
        state.stage = data.steps.length;
        event('Podczas nieobecności upłynęło 20 minut. Zapisano końcowy stan.');
        save();
      }
      startClock();
    },
    leave() { active = false; clearInterval(timer); },
  };
}
