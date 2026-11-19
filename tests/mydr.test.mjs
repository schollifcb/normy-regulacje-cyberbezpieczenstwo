import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCaseStudy } from '../dist/operation-mydr.js';
import { newMyDrState, assessMyDr, recordMyDr, mydrReport, restoreMyDr } from '../dist/mydr-model.js';

const data = JSON.parse(readFileSync(new URL('../worker/operacja-mydr.json', import.meta.url), 'utf8'));
const answerDraft = question => ({
  selected: question.type === 'match' ? [] : [...question.answer],
  assignments: question.type === 'match' ? [...question.answer] : [],
  order: (question.items ?? question.options).map((_, index) => index), submitted: false,
});
function harness(initial = null) {
  let saved = initial;
  globalThis.sessionStorage = {
    getItem: () => JSON.stringify(saved), setItem: (_, text) => { saved = JSON.parse(text); },
  };
  const controller = createCaseStudy({ screen: {}, render: () => {}, escapeHtml: value => String(value), icon: () => '', announce: () => {}, exit: () => {} });
  controller.open(data);
  const action = (action, index) => controller.click({ target: { closest: selector => selector === '[data-mydr-action]' ? { dataset: { mydrAction: action, index }, disabled: false } : null } });
  const match = (card, target) => {
    controller.click({ target: { closest: selector => selector === '[data-mydr-card]' ? { dataset: { mydrCard: String(card) } } : null } });
    controller.click({ target: { closest: selector => selector === '[data-mydr-target]' ? { dataset: { mydrTarget: String(target) } } : null } });
  };
  const choose = value => controller.change({ target: { name: 'mydr-choice', value: String(value), checked: true } });
  const answer = (question, correct = true) => {
    if (question.type === 'match') question.answer.forEach((value, index) => match(index, correct ? value : (value + 1) % question.targets.length));
    else if (question.type === 'multi') (correct ? question.answer : [3, 4, 5]).forEach(choose);
    else choose(correct ? question.answer[0] : (question.answer[0] + 1) % question.options.length);
    action('submit');
  };
  return { controller, action, match, choose, answer, saved: () => saved };
}

test('Ten tasks cover exactly six stages, valid references and eight result areas', () => {
  assert.equal(data.questions.length, 10);
  assert.equal(data.stages.length, 6);
  assert.equal(data.areas.length, 8);
  for (let stage = 0; stage < 6; stage++) assert.ok(data.questions.some(question => question.stage === stage));
  for (const question of data.questions) for (const id of question.refs) assert.ok(data.sources[id]);
});

test('Every task awards 2 on a correct first attempt, 1 after correction, and no negative points', () => {
  for (const question of data.questions) {
    const right = answerDraft(question);
    assert.equal(assessMyDr(question, right), 1, question.id);
    assert.equal(recordMyDr(question, right).points, 2);
    const empty = { selected: [], assignments: [] };
    const wrong = recordMyDr(question, empty);
    assert.equal(wrong.points, 0);
    assert.equal(recordMyDr(question, right, wrong).points, 1);
    assert.equal(recordMyDr(question, empty, recordMyDr(question, right)).points, 2);
  }
});

test('Multi-element tasks receive partial credit', () => {
  const match = data.questions.find(question => question.id === 'risk-map');
  const partial = answerDraft(match);
  partial.assignments[0] = 1;
  assert.equal(assessMyDr(match, partial), .8);
  assert.equal(recordMyDr(match, partial).points, 1);
  const multi = data.questions.find(question => question.id === 'suppliers');
  assert.equal(recordMyDr(multi, { selected: [0, 1, 5] }).points, 1);
  assert.equal(recordMyDr(multi, { selected: [3, 4, 5] }).points, 0);
});

test('Whole mission, back navigation, reload, badges and individual perfect result', () => {
  let h = harness();
  assert.match(h.controller.screenMarkup(), /Wybierz scenariusz/);
  h.action('brief'); h.action('start');
  for (const [index, question] of data.questions.entries()) {
    h.answer(question);
    assert.match(h.controller.screenMarkup(), /Konsekwencja decyzji/);
    assert.match(h.controller.screenMarkup(), /Poznana zasada/);
    h.action('next');
    if (index === 2) {
      h.action('back');
      assert.equal(h.saved().index, 2);
      assert.equal(h.saved().records.cia.points, 2);
      h.action('next');
      h = harness(h.saved());
      assert.equal(h.saved().index, 3);
    }
  }
  assert.equal(h.controller.completed(), true);
  const result = mydrReport(data, h.saved());
  assert.equal(result.points, 20); assert.equal(result.percent, 100);
  assert.equal(result.badges.length, 6); assert.deepEqual(result.missed, []);
  assert.ok(result.areas.every(area => area.status === 'Opanowane'));
  assert.match(h.controller.screenMarkup(), /Wszystkie zadania rozwiązane poprawnie!/);
  h.action('restart');
  assert.equal(h.controller.completed(), false);
  assert.deepEqual(h.saved().records, {});
  assert.equal(h.saved().retryIds, null);
});

test('Wrong decisions never block completion; retry preserves each original interaction and raises results', () => {
  let h = harness(); h.action('brief'); h.action('start');
  for (const question of data.questions) { h.answer(question, false); h.action('next'); }
  let result = mydrReport(data, h.saved());
  assert.equal(h.controller.completed(), true);
  assert.equal(result.points, 0); assert.equal(result.badges.length, 0);
  assert.ok(result.areas.every(area => area.status === 'Wymaga powtórki'));
  assert.equal(result.missed.length, 10);
  h.action('retry');
  assert.equal(h.saved().retryIds.length, 10);
  h = harness(h.saved());
  assert.equal(h.saved().view, 'mission');
  h.action('list'); h.action('brief'); h.action('start');
  assert.equal(h.saved().view, 'mission');
  assert.equal(h.saved().retryIds.length, 10);
  for (const question of data.questions) {
    if (question.type === 'match') assert.match(h.controller.screenMarkup(), /data-mydr-card/);
    h.answer(question); h.action('next');
  }
  result = mydrReport(data, h.saved());
  assert.equal(result.points, 10); assert.equal(result.percent, 50);
  assert.equal(result.badges.length, 6);
  assert.equal(h.saved().retryDone, 10);
  assert.equal(h.saved().view, 'report');
  assert.ok(result.areas.every(area => area.status === 'Do utrwalenia'));
});

test('Correction, partial scores and matching reassignment persist without replacing other rows', () => {
  const h = harness(); h.action('brief'); h.action('start');
  h.choose(0); h.action('submit'); h.action('edit'); h.choose(1); h.action('submit');
  assert.equal(h.saved().records.responsibility.points, 1);
  h.action('next');
  h.match(0, 0); h.match(1, 0);
  assert.equal(h.saved().drafts['risk-map'].assignments[0], null);
  assert.equal(h.saved().drafts['risk-map'].assignments[1], 0);
  const restored = harness(h.saved());
  assert.deepEqual(restored.saved().drafts['risk-map'].assignments, h.saved().drafts['risk-map'].assignments);
});

test('Corrupt and obsolete stored progress resets safely', () => {
  assert.deepEqual(restoreMyDr({ version: 0 }, data), newMyDrState());
  const state = newMyDrState();
  state.drafts.responsibility = { ...answerDraft(data.questions[0]), selected: [999] };
  assert.deepEqual(restoreMyDr(state, data), newMyDrState());
});

test('Native drag-and-drop uses the same persisted assignments as clicking', () => {
  const h = harness(); h.action('brief'); h.action('start');
  h.answer(data.questions[0]); h.action('next');
  let prevented = false;
  const transfer = { setData: () => {}, effectAllowed: '', dropEffect: '' };
  h.controller.dragStart({ target: { closest: () => ({ dataset: { mydrCard: '0' } }) }, dataTransfer: transfer });
  h.controller.dragOver({ target: { closest: () => ({ dataset: { mydrTarget: '0' } }) }, dataTransfer: transfer, preventDefault: () => { prevented = true; } });
  h.controller.drop({ target: { closest: () => ({ dataset: { mydrTarget: '0' } }) }, preventDefault: () => {} });
  assert.equal(prevented, true);
  assert.equal(transfer.effectAllowed, 'move');
  assert.equal(h.saved().drafts['risk-map'].assignments[0], 0);
});
