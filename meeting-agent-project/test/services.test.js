const { test } = require('node:test');
const assert = require('node:assert');
const { findAvailability, findOverlaps, expandRecurrence } = require('../src/services/calendar-service.js');
const { parseJsonOutput } = require('../src/services/llm.js');
const {
  prepareMeetingBrief,
  createActionItemsFromNotes,
  extractDecisionsFromNotes,
} = require('../src/services/meeting-intelligence.js');

test('findAvailability returns slots within window that avoid existing events', () => {
  const events = [
    { title: 'Busy', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T10:00:00.000Z' },
  ];
  const slots = findAvailability(
    events,
    30,
    '2026-09-25T08:00:00.000Z',
    '2026-09-25T12:00:00.000Z',
    { stepMin: 30, bufferMin: 0 }
  );
  assert.ok(Array.isArray(slots));
  assert.ok(slots.length > 0);
  for (const s of slots) {
    const startT = new Date(s.start).getTime();
    const endT = new Date(s.end).getTime();
    // must not overlap the busy block 09:00-10:00
    const overlapsBusy = startT < new Date('2026-09-25T10:00:00.000Z').getTime()
      && endT > new Date('2026-09-25T09:00:00.000Z').getTime();
    assert.equal(overlapsBusy, false, `slot ${s.start} overlaps busy window`);
  }
});

test('findAvailability respects bufferMin around existing events', () => {
  const events = [
    { title: 'Busy', start: '2026-09-25T10:00:00.000Z', end: '2026-09-25T10:30:00.000Z' },
  ];
  const slots = findAvailability(
    events,
    30,
    '2026-09-25T09:00:00.000Z',
    '2026-09-25T11:30:00.000Z',
    { stepMin: 30, bufferMin: 15 }
  );
  for (const s of slots) {
    const endT = new Date(s.end).getTime();
    assert.ok(
      endT <= new Date('2026-09-25T09:45:00.000Z').getTime() ||
      new Date(s.start).getTime() >= new Date('2026-09-25T10:45:00.000Z').getTime(),
      `slot ${s.start}-${s.end} violates buffer`
    );
  }
});

test('findOverlaps detects overlapping events', () => {
  const events = [
    { title: 'A', start: '2026-09-25T09:00:00.000Z', end: '2026-09-25T10:00:00.000Z' },
    { title: 'B', start: '2026-09-25T09:30:00.000Z', end: '2026-09-25T10:30:00.000Z' },
    { title: 'C', start: '2026-09-25T14:00:00.000Z', end: '2026-09-25T15:00:00.000Z' },
  ];
  const overlaps = findOverlaps(events);
  assert.ok(Array.isArray(overlaps));
  assert.ok(overlaps.length >= 1, 'expected at least one overlap');
});

test('extractDecisionsFromNotes captures Decision: lines', async () => {
  const notes = `
Some discussion happened.
Decision: Ship the new onboarding flow.
Also talked about budgets.
Decision: Cap the Q3 budget at 40k.
`;
  const { decisions } = await extractDecisionsFromNotes(notes);
  assert.equal(decisions.length, 2);
  assert.ok(decisions[0].includes('onboarding'));
});

test('createActionItemsFromNotes captures Action item: lines as actionable objects', async () => {
  const notes = `
Action item: Write the API spec.
Action item: Book the venue
`;
  const actions = await createActionItemsFromNotes(notes, 'demo@user.test');
  assert.equal(actions.length, 2);
  assert.ok(actions.every(a => a.text && a.done === false && a.owner === 'demo@user.test'));
});

test('findAvailability must not produce weekend slots when they are not preferred', () => {
  const slots = findAvailability(
    [],
    30,
    '2026-09-25T00:00:00.000Z', // Friday
    '2026-09-27T23:59:59.000Z', // Sunday
    { stepMin: 60, preferredDays: ['mon', 'tue', 'wed', 'thu', 'fri'] }
  );
  assert.ok(slots.length, 'expected weekday slots');
  for (const s of slots) {
    const day = new Date(s.start).getDay();
    assert.ok(day !== 0 && day !== 6, `slot on day ${day} should be excluded`);
  }
});

test('expandRecurrence expands FREQ=WEEKLY with BYDAY', () => {
  const instances = expandRecurrence(
    {
      start: '2026-09-24T14:00:00.000Z',
      end: '2026-09-24T15:00:00.000Z',
      recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'],
    },
    { count: 6 }
  );
  assert.equal(instances.length, 6);
});

test('expandRecurrence returns [] for non-recurring events', () => {
  const instances = expandRecurrence({ start: '2026-09-24T14:00:00.000Z', end: '2026-09-24T15:00:00.000Z', recurrence: [] });
  assert.deepEqual(instances, []);
});

test('prepareMeetingBrief includes objectives and discussion points', async () => {
  const brief = await prepareMeetingBrief(
    { meetingId: 'mtg_1', purpose: 'Sprint Planning', agenda: ['Review goals'], recentDecisions: [], actionItems: [] },
    [{ purpose: 'Prior Sprint Planning', actionItems: [{ text: 'Use Scrum', done: 0 }] }]
  );
  assert.ok(brief.objectives && brief.objectives.length > 0);
  assert.ok(Array.isArray(brief.discussionPoints));
  assert.ok(brief.carryForward.some(c => c.includes('Scrum')));
});

test('parseJsonOutput tolerates fenced and prose-wrapped JSON', () => {
  assert.deepEqual(parseJsonOutput('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonOutput('Here you go: {"a":1} hope that helps'), { a: 1 });
  assert.equal(parseJsonOutput('not json at all'), null);
});

test('LLM path is used when configured (mocked provider) and falls back on failure', async () => {
  const llm = require('../src/services/llm.js');
  const originalKey = process.env.ANTHROPIC_API_KEY;
  const originalFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key';

  const savedConfigured = llm.isLLMConfigured();
  assert.equal(savedConfigured, true, 'should be configured with a key set');

  // Mock a successful Anthropic response
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ content: [{ type: 'text', text: '{"decisions":["Mocked decision"]}' }] }),
  });

  const { extractDecisionsFromNotes } = require('../src/services/meeting-intelligence.js');
  const withLlm = await extractDecisionsFromNotes('some notes with no explicit Decision: prefix');
  assert.deepEqual(withLlm.decisions, ['Mocked decision']);

  // Now make the provider fail → must fall back to heuristic output
  global.fetch = async () => { throw new Error('network down'); };
  const fallback = await extractDecisionsFromNotes('Decision: Real fallback works');
  assert.ok(fallback.decisions.length >= 1);

  // Cleanup
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});