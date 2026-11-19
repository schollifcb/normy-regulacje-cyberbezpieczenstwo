export const riskLevels = [
  { key: 'low', label: 'Niskie', max: 4, range: '1–4' },
  { key: 'moderate', label: 'Umiarkowane', max: 9, range: '5–9' },
  { key: 'high', label: 'Wysokie', max: 14, range: '10–14' },
  { key: 'critical', label: 'Krytyczne', max: 25, range: '15–25' },
];

export const riskScore = ({ likelihood, impact }) => likelihood * impact;
export const riskLevel = (score) => riskLevels.find(({ max }) => score <= max);
export const validAxis = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

export function riskRatingVerdict(actual, expected) {
  const differences = ['likelihood', 'impact'].map((axis) => Math.abs(actual[axis] - expected[axis]));
  if (differences.every((difference) => difference === 0)) {
    return { key: 'correct', label: 'Poprawna',
      explanation: 'Oba wymiary są zgodne z oceną agenta AI i przesłankami scenariusza.' };
  }
  if (differences.every((difference) => difference <= 1)) {
    return { key: 'close', label: 'Również poprawna przy odpowiedniej argumentacji',
      explanation: 'Różnice wynoszą najwyżej jeden poziom na osi. Tę ocenę można uzasadnić, odwołując się do warunków scenariusza i skutków dla pacjentów.' };
  }
  const actualLevel = riskLevel(riskScore(actual));
  const expectedLevel = riskLevel(riskScore(expected));
  if (differences.every((difference) => difference <= 2) && actualLevel.key === expectedLevel.key) {
    return { key: 'neutral', label: 'Neutralna — wymaga uzasadnienia',
      explanation: `Ta sama klasa ryzyka („${expectedLevel.label}”), lecz inne założenia dotyczące prawdopodobieństwa lub wpływu wymagają uzasadnienia.` };
  }
  return { key: 'incorrect', label: 'Warto ponownie przeanalizować',
    explanation: actualLevel.key === expectedLevel.key
      ? 'Oceny wyraźnie różnią się na jednej z osi. Wróć do przesłanek scenariusza i rozważ, jak uzasadnić wybrany poziom.'
      : `Oceny wskazują różne klasy ryzyka: „${expectedLevel.label}” i „${actualLevel.label}”. Porównaj przesłanki poniżej i rozważ wpływ tej różnicy na pilność działań.` };
}

function axisPoints(actual, reference) {
  const difference = Math.abs(actual - reference);
  return difference === 0 ? 6 : difference === 1 ? 3 : 0;
}

export function gradeAnalysis(ratings, priorities, reason, reference) {
  const result = { likelihood: 0, impact: 0, priorities: 0, reason: 0 };
  for (const [id, expected] of Object.entries(reference.ratings)) {
    result.likelihood += axisPoints(ratings[id].likelihood, expected.likelihood);
    result.impact += axisPoints(ratings[id].impact, expected.impact);
  }

  priorities.forEach((id, index) => {
    const allowed = index === 2 ? reference.thirdGroup : reference.topGroup;
    if (allowed.includes(id)) result.priorities += 10;
  });

  const first = ratings[priorities[0]];
  const values = Object.values(ratings);
  const axis = { A: 'likelihood', B: 'impact' }[reason];
  if (axis && values.every((rating) => rating[axis] <= first[axis])) {
    result.reason = 10;
  } else if (reason === 'C' && values.every((rating) => riskScore(rating) <= riskScore(first))) {
    result.reason = reference.topGroup.includes(priorities[0]) ? 10 : 5;
  }

  return { ...result, total: Object.values(result).reduce((sum, points) => sum + points, 0) };
}
