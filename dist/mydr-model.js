import { decisionScore } from './advisor-scoring.js';

export const mydrStorageKey = 'operation-mydr-progress-v1';
export const newMyDrState = () => ({
  version: 1, view: 'select', index: 0, furthest: 0, drafts: {}, records: {},
  retryIds: null, retryPosition: 0, retryDone: 0, retryFinished: false,
});

export function assessMyDr(question, draft) {
  if (question.type === 'match') {
    return decisionScore({ answer: question.answer, pairs: true }, draft.assignments ?? []) / 100;
  }
  if (question.type === 'multi') {
    const selected = [...new Set(draft.selected ?? [])];
    return question.answer.filter(value => selected.includes(value)).length
      / Math.max(question.answer.length, selected.length);
  }
  return decisionScore(question, draft.selected ?? []) / 100;
}

export function recordMyDr(question, draft, previous) {
  const quality = assessMyDr(question, draft);
  const attempts = (previous?.attempts ?? 0) + 1;
  const points = quality === 1 && attempts === 1 ? 2 : quality > 0 ? 1 : 0;
  return {
    attempts, firstQuality: previous?.firstQuality ?? quality, quality,
    bestQuality: Math.max(previous?.bestQuality ?? 0, quality),
    points: Math.max(previous?.points ?? 0, points),
    hadError: Boolean(previous?.hadError || quality < 1),
  };
}

export function mydrReport(data, state) {
  const pointsFor = ids => ids.reduce((sum, id) => sum + (state.records[id]?.points ?? 0), 0);
  const points = pointsFor(data.questions.map(question => question.id));
  const maximum = data.questions.length * 2;
  const percent = Math.round(points / maximum * 100);
  const summarize = area => {
    const points = pointsFor(area.tasks);
    const maximum = area.tasks.length * 2;
    const status = points === maximum ? 'Opanowane' : points > 0 ? 'Do utrwalenia' : 'Wymaga powtórki';
    return { ...area, points, maximum, percent: Math.round(points / maximum * 100), status };
  };
  return {
    points, maximum, percent,
    rank: percent >= 85 ? '🥇 RISK ADVISOR' : percent >= 60 ? '🥈 KONSULTANT' : '🥉 ANALITYK',
    description: percent >= 85
      ? 'Bardzo dobrze rozumiesz ryzyko dostawców, obowiązki organizacji oraz znaczenie skutecznego zarządzania bezpieczeństwem.'
      : percent >= 60
        ? 'Dobrze rozumiesz najważniejsze zależności między ryzykiem, regulacjami i odpowiedzialnością.'
        : 'Rozpoznajesz podstawowe zagadnienia. Warto utrwalić jeszcze niektóre decyzje.',
    areas: data.areas.map(summarize), indicators: data.indicators.map(summarize),
    missed: data.questions.filter(question => state.records[question.id]?.hadError).map(question => question.id),
    badges: data.stages.filter((_, index) => data.questions.filter(question => question.stage === index)
      .every(question => state.records[question.id]?.bestQuality === 1)),
  };
}

function validDraft(question, draft) {
  if (!draft || !Array.isArray(draft.selected) || !Array.isArray(draft.assignments)
    || !Array.isArray(draft.order) || typeof draft.submitted !== 'boolean') return false;
  const length = question.type === 'match' ? question.items.length : question.options.length;
  if (draft.order.length !== length || new Set(draft.order).size !== length
    || draft.order.some(index => !Number.isInteger(index) || index < 0 || index >= length)) return false;
  if (question.type === 'match') return draft.assignments.length === length
    && draft.assignments.every(index => index === null || Number.isInteger(index) && index >= 0 && index < question.targets.length);
  return new Set(draft.selected).size === draft.selected.length
    && draft.selected.length <= (question.limit ?? 1)
    && draft.selected.every(index => Number.isInteger(index) && index >= 0 && index < length);
}

export function restoreMyDr(saved, data) {
  const blank = newMyDrState();
  if (!saved || saved.version !== 1 || !['select', 'brief', 'mission', 'report'].includes(saved.view)
    || !Number.isInteger(saved.index) || saved.index < 0 || saved.index >= data.questions.length
    || !Number.isInteger(saved.furthest) || saved.furthest < saved.index || saved.furthest >= data.questions.length
    || !saved.drafts || !saved.records) return blank;
  for (const [id, draft] of Object.entries(saved.drafts)) {
    const question = data.questions.find(question => question.id === id);
    if (!question || !validDraft(question, draft)) return blank;
  }
  for (const [id, record] of Object.entries(saved.records)) {
    if (!data.questions.some(question => question.id === id) || !saved.drafts[id]
      || !Number.isInteger(record.points) || record.points < 0 || record.points > 2
      || !Number.isInteger(record.attempts) || record.attempts < 1
      || [record.quality, record.firstQuality, record.bestQuality].some(value => typeof value !== 'number' || value < 0 || value > 1)) return blank;
  }
  if (saved.retryIds !== null && (!Array.isArray(saved.retryIds) || !saved.retryIds.length
    || saved.retryIds.some(id => !data.questions.some(question => question.id === id))
    || !Number.isInteger(saved.retryPosition) || saved.retryPosition < 0 || saved.retryPosition >= saved.retryIds.length)) return blank;
  const complete = data.questions.every(question => Object.hasOwn(saved.records, question.id));
  if ((saved.view === 'report' || saved.retryIds) && !complete) return blank;
  return { ...blank, ...saved };
}
