const stageTitles = ['Zbuduj piramidę', 'Co kryje się za pojęciami?', 'Czy naprawdę rozumiesz różnicę?'];

function shuffle(size) {
  const order = Array.from({ length: size }, (_, index) => index);
  for (let index = size - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [order[index], order[other]] = [order[other], order[index]];
  }
  if (order.every((item, index) => item === index)) order.push(order.shift());
  return order;
}

function restore(part, storageKey) {
  const empty = { stage: part === 'build' ? 0 : 2, matches: [[], []], order: [], question: 0,
    correct: [], missed: [], completed: false };
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved?.matches?.length === 2 && Array.isArray(saved.order) && Array.isArray(saved.correct)
      && Array.isArray(saved.missed) && Number.isInteger(saved.stage) && saved.stage >= 0 && saved.stage <= 5) return saved;
    const previous = JSON.parse(sessionStorage.getItem('training-pyramid-v1'));
    if (previous?.matches?.length === 2 && previous.matches.every(Array.isArray)) {
      if (part === 'build') {
        const finished = previous.completed === true || previous.matches.every((items) => items.length === 7);
        return { ...empty, ...previous, stage: finished ? 5 : Math.min(previous.stage, 1), completed: finished };
      }
      if (previous.stage >= 2) return { ...empty, ...previous };
    }
  } catch {
    // The exercise can still be completed in memory.
  }
  return empty;
}

export function createPyramid({ screen, render, escapeHtml: html, icon, announce, exit,
  part = 'build', next, nextAvailable = () => false }) {
  const build = part === 'build';
  const storageKey = `training-pyramid-${part}-v1`;
  let content;
  let state = restore(part, storageKey);
  let selected = null;
  let notice = null;
  let lastAnswer = state.lastAnswer ?? null;
  let review = null;
  let storyStep = -1;
  let storyTimer;
  let drag = null;
  let suppressClick = false;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const completed = () => state.completed;
  const save = () => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Keep the current progress in memory.
    }
  };
  save();

  function info() {
    return `<div class="pyramid-info"><button type="button" data-pyramid-action="info" aria-label="Jak rozumieć piramidę?">ℹ️</button>
      <p>Pamiętaj: to mapa pojęć, a nie formalna hierarchia dokumentów.</p></div>
      <dialog class="advisor-dialog" data-pyramid-dialog aria-labelledby="pyramid-dialog-title">
        <h3 id="pyramid-dialog-title"></h3><p data-pyramid-dialog-body></p>
        <form method="dialog"><button class="primary">Zamknij</button></form>
      </dialog>`;
  }

  function showInfo() {
    openDialog('Jak rozumieć piramidę?', [
      'Piramida jest uproszczonym modelem dydaktycznym. Pomaga zrozumieć różnice między prawem, normami, frameworkami i dokumentami wewnętrznymi.',
      'Kolejność jest przyjęta na potrzeby ćwiczenia. Piramida nie określa formalnej hierarchii ani mocy prawnej dokumentów. Poszczególne kategorie mogą się uzupełniać, np. organizacja może korzystać równolegle z normy i frameworku.',
      'Zabezpieczenie może wynikać z przepisów, analizy ryzyka, przyjętej polityki lub dobrych praktyk. Piramida pokazuje, jak przejść od ogólnych wymagań i zasad do konkretnych działań.',
    ]);
  }

  function openDialog(title, paragraphs) {
    const dialog = screen.querySelector('[data-pyramid-dialog]');
    dialog.querySelector('h3').textContent = title;
    dialog.querySelector('[data-pyramid-dialog-body]').textContent = paragraphs.join('\n\n');
    dialog.showModal();
  }

  function explain(index) {
    const { name, example, definition } = content.levels[index];
    openDialog(name, [`Przykład: ${example}`, definition]);
  }

  function pyramid(mode) {
    const story = mode === 'story';
    const matching = mode === 'match';
    const rows = content.levels.map(({ name, example }, index) => {
      const filled = matching && state.matches[state.stage].includes(index);
      const empty = matching && state.stage === 0 && !filled;
      const flash = matching && notice?.level === index ? (notice.good ? ' pyramid-placed' : ' pyramid-wrong') : '';
      const text = `${empty ? '' : `<span class="pyramid-number">${index + 1}</span>`}<span>${empty ? 'Poziom ' + (index + 1) : html(name)}
        ${matching && state.stage === 1 && filled ? `<small>${html(example)}</small>` : ''}</span>`;
      const style = `--tier: ${index}; --shade: ${index * 7}%;`;
      return `<li class="pyramid-tier${filled ? ' pyramid-filled' : ''}${flash}" style="${style}">
        ${matching ? `<button type="button" data-pyramid-level="${index}" ${state.stage === 0 && filled ? 'aria-disabled="true"' : ''}>${text}</button>`
          : `<button type="button" data-pyramid-action="explain" data-index="${index}"${story ? ' data-pyramid-story-tier' : ''}>${text}</button>`}</li>`;
    }).join('');
    return `<div class="pyramid-figure"><ol class="pyramid-shape" aria-label="Siedem poziomów piramidy">${rows}</ol>${info()}</div>`;
  }

  function header(title, subtitle = '') {
    const score = build ? state.matches[0].length + state.matches[1].length : state.correct.length;
    const total = build ? 14 : 3;
    return `<div class="panel-heading"><div><p class="kicker">${build ? 'PIRAMIDA CYBERBEZPIECZEŃSTWA' : 'OD POJĘĆ DO PRAKTYKI'}</p>
      <h2 id="screen-title" tabindex="-1">${title}</h2>${subtitle ? `<p class="lead">${subtitle}</p>` : ''}</div>
      <div class="pyramid-score"><progress value="${score}" max="${total}" aria-label="Poprawnie wykonane zadania"></progress>
        <span>${score} z ${total} zadań</span></div></div>`;
  }

  function matching() {
    const { stage } = state;
    const remaining = state.order.filter((index) => !state.matches[stage].includes(index));
    const instructions = stage === 0
      ? 'Ułóż siedem kategorii w kolejności przyjętej na potrzeby ćwiczenia, od ogólnych wymagań po ustawienia systemu.'
      : 'Dopasuj przykłady do poziomów. Bez wybranej karty możesz otworzyć objaśnienie dowolnego poziomu.';
    const cards = remaining.map((index) => {
      const level = content.levels[index];
      return `<li><button type="button" class="pyramid-card${notice?.card === index && !notice.good ? ' pyramid-shake' : ''}"
        aria-pressed="${selected === index}" data-pyramid-card="${index}">
        ${icon('grip')}<span>${html(stage === 0 ? level.name : level.example)}</span>
      </button></li>`;
    }).join('');
    const feedback = notice ? `<div class="pyramid-feedback ${notice.good ? 'pyramid-good' : 'pyramid-bad'}">
      <strong>${notice.good ? '✓ Poprawne dopasowanie' : 'Spróbuj jeszcze raz'}</strong>
      <p>${html(notice.text)}</p></div>` : '';
    return `${header(stageTitles[stage], instructions)}
      <div class="pyramid-board">
        <div>${pyramid('match')}${feedback}</div>
        <div class="pyramid-deck"><h3>${stage === 0 ? 'Kategorie' : 'Przykłady'}</h3>
          ${remaining.length ? `<p class="lead">Przeciągnij kartę lub wybierz ją, a potem wskaż poziom.</p><ul>${cards}</ul>` : ''}
          ${remaining.length ? '' : `<p class="good pyramid-match-done">${stage === 0
            ? 'Świetnie! Udało Ci się zbudować mapę pojęć. Teraz sprawdźmy, czy potrafisz rozpoznać konkretne przykłady.'
            : 'Wszystkie przykłady są już na swoich miejscach.'}</p>
            <button type="button" class="primary" data-pyramid-action="next-stage">${stage === 0 ? 'Przejdź dalej' : 'Zakończ ćwiczenie'}</button>`}
        </div>
      </div>`;
  }

  const quizIndex = () => review ? review.items[review.position] : state.question;

  function quiz() {
    const question = content.quiz[quizIndex()];
    const index = review ? review.position : state.question;
    const total = review ? review.items.length : content.quiz.length;
    const solved = lastAnswer === question.answer;
    return `${header(stageTitles[2], `${review ? 'Powtórka · ' : ''}Pytanie ${index + 1} z ${total}`)}
      <div class="pyramid-board pyramid-quiz">${pyramid('labels')}
        <div><h3>${html(question.prompt)}</h3>
          <ul class="pyramid-answers">${question.options.map((option, index) => `<li><button type="button" class="pyramid-card
            ${lastAnswer === index ? solved ? ' pyramid-good' : ' pyramid-bad' : ''}"
            data-pyramid-answer="${index}" aria-pressed="${lastAnswer === index}" ${solved ? 'disabled' : ''}>
            <strong>${String.fromCharCode(65 + index)}.</strong> ${html(option)}${lastAnswer === index ? solved ? ' ✓' : ' ✗' : ''}
          </button></li>`).join('')}</ul>
          ${lastAnswer !== null ? `<div class="pyramid-feedback ${solved ? 'pyramid-good' : 'pyramid-bad'}">
            <strong>${solved ? '✓ Dobrze' : 'Spróbuj ponownie lub przejdź dalej'}</strong>
            <p>${html(solved ? question.feedback : question.hint)}</p></div>
            <div class="actions"><button type="button" class="primary" data-pyramid-action="next-question">Dalej</button></div>` : ''}
        </div></div>`;
  }

  function story() {
    const active = state.stage === 4;
    return `${header('Od wymagania do działania', 'Zobacz, jak organizacja może przełożyć wymagania i własne zasady na ochronę kont administratorów.')}
      <div class="pyramid-board">${pyramid('story')}<div>
        <p class="lead">To jeden możliwy sposób wdrożenia MFA. Dobór dokumentów i działań zależy od organizacji i jej ryzyka.</p>
        ${active ? `<ol class="pyramid-story" aria-label="Od wymagania do działania">${content.levels.map(({ name, story, storyEmphasis }, index) => {
          const copy = html(story);
          const text = storyEmphasis ? copy.replace(html(storyEmphasis), () => `<strong>${html(storyEmphasis)}</strong>`) : copy;
          return `<li data-pyramid-story-copy="${index}" ${index > storyStep ? 'hidden' : ''}><strong>${html(name)}</strong><p>${text}</p></li>`;
        }).join('')}</ol>` : ''}
        <div class="actions pyramid-story-actions">
          ${active ? `<button type="button" class="admin-secondary" data-pyramid-action="replay">Odtwórz ponownie</button>
            <button type="button" class="admin-secondary" data-pyramid-action="skip">Pomiń animację</button>
            <button type="button" class="primary" data-pyramid-action="finish">Zakończ ćwiczenie</button>`
            : '<button type="button" class="primary" data-pyramid-action="play">Zobacz, jak teoria zamienia się w praktykę</button>'}
        </div></div></div>`;
  }

  function summary() {
    const goals = build ? ['Rozpoznajesz siedem kategorii dokumentów i zasad.', 'Przyporządkowujesz konkretne przykłady do kategorii.',
      'Pamiętasz, że piramida jest narzędziem dydaktycznym.'] : [
      'Rozumiesz różnicę między polityką a procedurą.', 'Wiesz, jak wymagania bezpieczeństwa mogą przekładać się na konfigurację techniczną.',
      'Pamiętasz, że piramida jest narzędziem dydaktycznym.'];
    return `${header(build ? 'Świetnie! Piramida jest gotowa' : 'Gratulacje! Łączysz pojęcia z praktyką')}
      <div class="pyramid-board">${pyramid('labels')}<div>
        <ul class="pyramid-goals">${goals.map((goal) => `<li>${icon('check')}<span>${goal}</span></li>`).join('')}</ul>
        ${!build && state.missed.length ? '<p class="lead">Możesz wrócić do pytań, w których zdarzył Ci się błąd.</p>' : ''}
        <div class="actions">
          ${build && nextAvailable() ? '<button type="button" class="primary" data-pyramid-action="next-exercise">Przejdź do „Od pojęć do praktyki”</button>' : ''}
          ${!build && state.missed.length ? '<button type="button" class="primary" data-pyramid-action="review">Powtórz pytania z błędami</button>' : ''}
          <button type="button" class="admin-secondary" data-pyramid-action="restart">Powtórz ćwiczenie</button>
          <button type="button" class="admin-secondary" data-pyramid-action="exit">Wróć do listy ćwiczeń</button>
        </div>
        ${build && !nextAvailable() ? '<p class="stage-wait">Ćwiczenie „Od pojęć do praktyki” czeka na aktywację przez prowadzącego.</p>' : ''}
        <details class="pyramid-sources"><summary>Źródła</summary><ul>${content.sources.map(([name, url]) =>
          `<li><a href="${html(url)}" target="_blank" rel="noopener noreferrer">${html(name)}</a></li>`).join('')}</ul></details>
      </div></div>`;
  }

  function screenMarkup() {
    const view = state.stage < 2 ? matching : state.stage === 2 || review ? quiz : state.stage === 5 ? summary : story;
    return `<section class="panel pyramid-panel" aria-labelledby="screen-title">${view()}</section>`;
  }

  function moveCard(from, to) {
    if (!from || !to || reduceMotion.matches) return;
    const target = to.getBoundingClientRect();
    to.animate([
      { transform: `translate(${from.left - target.left}px, ${from.top - target.top}px) scale(.9)`, opacity: .45 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ], { duration: 280, easing: 'ease-out' });
  }

  function matchCard(card, level, from) {
    if (state.stage > 1 || state.matches[state.stage].includes(card) || state.matches[state.stage].includes(level)) return;
    const item = content.levels[card];
    const good = card === level;
    selected = card;
    notice = { card, level, good, text: good ? item.definition : state.stage === 0 ? item.hint : item.exampleHint };
    if (good) {
      state.matches[state.stage].push(card);
      selected = null;
      save();
    }
    const filled = state.matches[state.stage].length === content.levels.length;
    render(filled ? '[data-pyramid-action="next-stage"]' : null);
    const tier = screen.querySelector(`[data-pyramid-level="${level}"]`);
    if (!filled) tier.focus({ preventScroll: true });
    if (good) moveCard(from, tier.querySelector('span:last-child'));
    announce(`${good ? 'Poprawne dopasowanie.' : 'Spróbuj jeszcze raz.'} ${notice.text}`);
  }

  function paintStory() {
    const tiers = [...screen.querySelectorAll('[data-pyramid-story-tier]')];
    if (state.stage !== 4 || !tiers.length) return;
    const end = storyStep >= content.levels.length;
    tiers.forEach((tier, index) => {
      tier.parentElement.classList.toggle('pyramid-lit', index <= storyStep);
      tier.parentElement.classList.toggle('pyramid-current', !end && index === storyStep);
      screen.querySelector(`[data-pyramid-story-copy="${index}"]`).hidden = index > storyStep;
    });
    if (!end) {
      announce(content.levels[storyStep].story);
      storyTimer = setTimeout(() => { storyStep += 1; paintStory(); }, 3500);
    }
  }

  function play(skip) {
    clearTimeout(storyTimer);
    state.stage = 4;
    storyStep = skip || reduceMotion.matches ? content.levels.length : 0;
    save();
    render(skip ? '[data-pyramid-action="finish"]' : '#screen-title');
    paintStory();
  }

  function click(event) {
    if (suppressClick && event.detail) {
      suppressClick = false;
      return;
    }
    const button = event.target.closest('button');
    if (!button) return;
    const { pyramidAction: action, pyramidCard: card, pyramidLevel: level, pyramidAnswer: answer } = button.dataset;
    if (card !== undefined) {
      selected = selected === Number(card) ? null : Number(card);
      notice = null;
      const next = content.levels.findIndex((_, index) => !state.matches[state.stage].includes(index));
      render(selected === null ? `[data-pyramid-card="${card}"]` : `[data-pyramid-level="${next}"]`);
      if (selected !== null) announce('Wybrano kartę. Wskaż poziom piramidy.');
      return;
    }
    if (level !== undefined) {
      const index = Number(level);
      if (selected !== null && !state.matches[state.stage].includes(index)) {
        matchCard(selected, index, screen.querySelector(`[data-pyramid-card="${selected}"]`)?.getBoundingClientRect());
      } else if (state.stage === 1) {
        explain(index);
      }
      return;
    }
    if (answer !== undefined) {
      const index = quizIndex();
      const question = content.quiz[index];
      lastAnswer = Number(answer);
      if (!review) state.lastAnswer = lastAnswer;
      const good = lastAnswer === question.answer;
      if (good && !state.correct.includes(index)) state.correct.push(index);
      if (good && review) state.missed = state.missed.filter((item) => item !== index);
      if (!good && !state.missed.includes(index)) state.missed.push(index);
      save();
      render(good ? '[data-pyramid-action="next-question"]' : `[data-pyramid-answer="${answer}"]`);
      announce(good ? question.feedback : question.hint);
      return;
    }
    if (action === 'explain') { explain(Number(button.dataset.index)); return; }
    if (action === 'info') { showInfo(); return; }
    if (action === 'play' || action === 'replay' || action === 'skip') { play(action === 'skip'); return; }
    if (action === 'exit') { exit(); return; }
    if (action === 'next-exercise') { next?.(); return; }
    if (action === 'next-stage') {
      if (build && state.stage === 1) {
        state.stage = 5;
        state.completed = true;
      } else state.stage += 1;
      if (state.stage === 1) state.order = shuffle(content.levels.length);
      notice = null;
    } else if (action === 'next-question') {
      if (review) {
        review.position += 1;
        if (review.position === review.items.length) review = null;
      } else {
        state.question += 1;
        state.lastAnswer = null;
        if (state.question === content.quiz.length) state.stage = 3;
      }
      lastAnswer = null;
    } else if (action === 'finish') {
      clearTimeout(storyTimer);
      state.stage = 5;
      state.completed = true;
    } else if (action === 'review') {
      review = { items: [...state.missed].sort((a, b) => a - b), position: 0 };
    } else if (action === 'restart') {
      state = { stage: build ? 0 : 2, matches: [[], []], order: shuffle(content.levels.length), question: 0,
        correct: [], missed: [], completed: state.completed };
      selected = notice = lastAnswer = review = null;
    } else return;
    save();
    render('#screen-title');
  }

  function updateDrag() {
    const { x, y, ghost } = drag;
    ghost.style.transform = `translate(${x + 14}px, ${y + 12}px)`;
    const level = document.elementFromPoint(x, y)?.closest('[data-pyramid-level]');
    if (level !== drag.level) {
      drag.level?.classList.remove('pyramid-drop');
      level?.classList.add('pyramid-drop');
      drag.level = level;
    }
  }

  function dragFrame() {
    if (!drag?.ghost) return;
    const edge = 75;
    if (drag.y < edge) window.scrollBy(0, -12);
    else if (drag.y > window.innerHeight - edge) window.scrollBy(0, 12);
    updateDrag();
    drag.frame = requestAnimationFrame(dragFrame);
  }

  function pointerDown(event) {
    suppressClick = false;
    const card = event.target.closest('[data-pyramid-card]');
    if (!card || !event.isPrimary || event.button !== 0) return;
    drag = { card, id: event.pointerId, startX: event.clientX, startY: event.clientY, ghost: null, level: null };
    card.setPointerCapture(event.pointerId);
  }

  function pointerMove(event) {
    if (drag?.id !== event.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.ghost) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 8) return;
      const ghost = document.createElement('div');
      ghost.className = 'pyramid-drag-ghost';
      ghost.textContent = drag.card.textContent.trim();
      ghost.setAttribute('aria-hidden', 'true');
      document.body.append(ghost);
      drag.ghost = ghost;
      drag.frame = requestAnimationFrame(dragFrame);
    }
    updateDrag();
  }

  function clearDrag() {
    if (!drag) return;
    drag.ghost?.remove();
    drag.level?.classList.remove('pyramid-drop');
    cancelAnimationFrame(drag.frame);
    drag = null;
  }

  function pointerEnd(event) {
    if (drag?.id !== event.pointerId) return;
    if (!drag.ghost) { clearDrag(); return; }
    const level = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-pyramid-level]');
    const card = Number(drag.card.dataset.pyramidCard);
    const from = drag.ghost.getBoundingClientRect();
    clearDrag();
    suppressClick = true;
    if (event.type === 'pointerup' && level) matchCard(card, Number(level.dataset.pyramidLevel), from);
  }

  return {
    completed, screenMarkup, click, pointerDown, pointerMove, pointerEnd,
    open(data) {
      content = data;
      if (!state.order.length) { state.order = shuffle(content.levels.length); save(); }
      if (state.stage === 4) {
        storyStep = content.levels.length;
        requestAnimationFrame(() => { if (screen.querySelector('[data-pyramid-story-tier]')) paintStory(); });
      }
    },
    leave() {
      clearTimeout(storyTimer);
      clearDrag();
    },
  };
}
