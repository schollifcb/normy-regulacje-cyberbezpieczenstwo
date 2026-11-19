export function newCaseState() {
  return {
    stage: -1, startedAt: null, endedAt: null, timedOut: false, drafts: {}, decisions: {},
    events: [], consultations: [], errors: [], config: {
      staff: false, roles: false, vendors: false, resources: 'medicore', locations: 'all',
      platforms: 'all', strength: 'sms', emergency: 'include', emergencyStrong: false,
      workload: 'user', soc: false, emergencyAlert: false, sprayingAlert: false, reviews: false,
    },
    deployment: 'off', reportOnly: false, whatIf: false, tests: {}, logsReviewed: false,
    approved: false, outage: false, attack: null, attackCount: 0,
  };
}

function selectionQuality(selected = [], expected) {
  const correct = expected.filter((item) => selected.includes(item)).length;
  const wrong = selected.filter((item) => !expected.includes(item)).length;
  return Math.max(0, correct - wrong) / expected.length;
}

export function assessCaseStep(step, draft = {}) {
  if (step.type === 'single') return Number(draft.choice === step.answer);
  if (step.type === 'business' || step.type === 'evidence') {
    return (Number(draft.choice === step.answer) + selectionQuality(draft.selected, step.expected)) / 2;
  }
  let quality = step.expected.filter((value, index) => draft.assignments?.[index] === value).length / step.expected.length;
  if (step.soa) quality = (quality + selectionQuality(draft.selected, [0, 1, 2, 3, 4])) / 2;
  return quality;
}

export function hasCaseCriticalError(step, draft) {
  if (step.critical) return draft?.choice !== step.answer;
  return step.criticalRows?.some((index) => draft?.assignments?.[index] !== step.expected[index]) ?? false;
}

export function configIssues(state) {
  const c = state.config;
  const scope = state.decisions.scope?.draft.assignments ?? [];
  const issues = [];
  if (scope.slice(0, 6).length !== 6 || scope.slice(0, 6).some((item) => item !== 0)
    || scope[6] !== 1 || scope[7] !== 1 || scope[8] !== 1) issues.push('scope');
  if (!c.staff || !c.roles) issues.push('staff');
  if (!c.vendors || scope[1] !== 0) issues.push('vendors');
  if (c.resources !== 'all') issues.push('resources');
  if (c.locations !== 'all') issues.push('locations');
  if (c.platforms !== 'all') issues.push('platforms');
  if (c.strength !== 'fido') issues.push('strength');
  if (c.emergency !== 'named' || !c.emergencyStrong) issues.push('emergency');
  if (c.workload !== 'separate') issues.push('workload');
  if (!c.soc || !c.emergencyAlert || !c.sprayingAlert || !c.reviews) issues.push('monitoring');
  if (state.decisions.procedure?.quality !== 1) issues.push('procedure');
  return issues;
}

export function identityResult(state, id) {
  const c = state.config;
  const scope = state.decisions.scope?.draft.assignments ?? [];
  const common = c.resources === 'all' && c.locations === 'all' && c.platforms === 'all';
  if (id === 'emergency') {
    const good = c.emergency === 'named' && c.emergencyStrong && c.emergencyAlert && c.soc && scope[6] === 1;
    return { good, message: good ? 'BG-01 ma niezależny klucz FIDO2. Dostęp awaryjny działa, SOC otrzymuje alert.' : 'Ścieżka awaryjna jest zablokowana albo pozbawiona silnej ochrony lub alertu SOC.' };
  }
  if (id === 'service') {
    const good = c.workload === 'separate' && scope[7] === 1 && scope[8] === 1;
    return { good, message: good ? 'SP-BACKUP działa w odrębnej kontroli. Nie wykonuje interaktywnego MFA użytkownika.' : 'Polityka użytkownika nie zapewnia właściwej kontroli tożsamości usługi.' };
  }
  const covered = common && c.staff && c.roles && (id !== 'vendor' || (c.vendors && scope[1] === 0));
  const good = covered && c.strength === 'fido';
  return { good, message: good
    ? id === 'password' ? 'Samo hasło nie spełnia wymagań. Dostęp zablokowany, administrator kierowany do rejestracji metody.'
      : 'Dostęp możliwy po uwierzytelnieniu odpornym na phishing.'
    : 'Test ujawnia brak wymaganego wymuszenia odpornego na phishing dla tej tożsamości.' };
}

export function readyToEnable(state) {
  return state.reportOnly && state.whatIf && state.logsReviewed && state.approved
    && ['staff', 'vendor', 'password', 'emergency', 'service'].every((id) => state.tests[id]?.good)
    && configIssues(state).length === 0;
}

export function caseCapacity(state, data) {
  const parameters = [95, 90, 45, 55, 50];
  for (const step of data.steps) {
    const decision = state.decisions[step.id];
    if (!decision) continue;
    step.effect.forEach((effect, index) => {
      parameters[index] += decision.quality === 1 ? effect : -Math.max(2, effect * (1 - decision.quality));
    });
  }
  if (state.outage) { parameters[0] -= 45; parameters[1] -= 40; parameters[3] -= 20; }
  if (state.attack === 'succeeded') { parameters[0] -= 32; parameters[1] -= 35; parameters[2] -= 25; }
  const weights = [.4, .2, .2, .1, .1];
  const calculated = parameters.reduce((total, value, index) => total + Math.max(0, Math.min(100, value)) * weights[index], 0);
  const capacity = Math.max(0, Math.round(calculated - Math.min(3, state.errors.length * .3)));
  return {
    capacity,
    status: capacity >= 90 ? 'Stabilna' : capacity >= 75 ? 'Pod presją' : capacity >= 60 ? 'Ograniczona' : capacity >= 40 ? 'Tryb kryzysowy' : 'Krytyczna',
    tone: capacity >= 90 ? 'good' : capacity >= 75 ? 'warn' : 'bad',
    records: state.outage ? 'Dostęp ograniczony' : state.attack === 'succeeded' ? 'Zdegradowany · dokumentacja papierowa' : 'Online',
    clinical: state.outage || state.attack === 'succeeded' ? 'Opóźnienia · ręczna weryfikacja zleceń' : 'Badania i zlecenia dostępne',
    access: state.deployment === 'on' && readyToEnable(state) ? 'MFA wymuszane' : state.deployment === 'report-only' ? 'Obserwacja · Report-only' : 'Wymaga zabezpieczenia',
    response: state.config.soc && state.logsReviewed ? 'SOC monitoruje' : 'Przygotowanie w toku',
  };
}

export function caseUnresolved(state, data) {
  const unresolved = data.steps.filter((step) => step.type !== 'sandbox'
    && (!state.decisions[step.id] || hasCaseCriticalError(step, state.decisions[step.id].draft))).map(({ id }) => id);
  if (!state.decisions.scope || configIssues(state).includes('scope')) unresolved.push('scope');
  if (!readyToEnable(state) || state.deployment !== 'on' || state.outage || state.attack !== 'blocked') unresolved.push('sandbox');
  return [...new Set(unresolved)];
}

export function casePassed(state, data) {
  const duration = (state.endedAt ?? Date.now()) - state.startedAt;
  return Boolean(state.startedAt && !state.timedOut && state.endedAt && duration <= data.durationSeconds * 1000
    && caseCapacity(state, data).capacity >= 80 && caseUnresolved(state, data).length === 0);
}
