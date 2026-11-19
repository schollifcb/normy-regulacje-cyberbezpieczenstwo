export const categories = {
  law: 'Regulacje prawne',
  standards: 'Normy i standardy',
  frameworks: 'Frameworki',
  practices: 'Dobre praktyki',
};

export function decisionScore(question, selection) {
  const { answer, pairs } = question;
  const correct = pairs
    ? answer.filter((choice, index) => selection[index] === choice).length
    : answer.filter((choice) => selection.includes(choice)).length;
  const wrong = pairs ? 0 : new Set(selection.filter((choice) => !answer.includes(choice))).size;
  return Math.round(100 * Math.max(0, correct - wrong) / answer.length);
}

export function advisorReport(questions, answers) {
  const scores = questions.map((question) => decisionScore(question, answers[question.id] ?? []));
  const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const total = average(scores);
  return {
    total,
    rank: total >= 90 ? '🏆 Senior Cyber Advisor' : total >= 75 ? '🥈 Cybersecurity Consultant'
      : total >= 50 ? '🥉 Junior Cyber Advisor' : '📘 Cybersecurity Trainee',
    correct: scores.filter((score) => score === 100).length,
    partial: scores.filter((score) => score > 0 && score < 100).length,
    categories: Object.keys(categories).map((id) => ({
      id, score: average(scores.filter((_, index) => questions[index].categories.includes(id))),
    })),
    missed: questions.filter((_, index) => scores[index] < 100).map(({ id }) => id),
  };
}
