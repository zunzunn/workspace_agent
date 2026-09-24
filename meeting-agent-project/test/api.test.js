const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 4123;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-test-'));
const dbFile = path.join(tmpDir, 'test.db');
const seedFile = path.join(tmpDir, 'seed.js');

let server;
let ready = false;

function waitForServer() {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const tryPing = async () => {
      try {
        const r = await fetch(`http://localhost:${PORT}/`);
        if (r.ok) return resolve();
      } catch { /* not up yet */ }
      if (++attempts > 50) return reject(new Error('Server did not start'));
      setTimeout(tryPing, 200);
    };
    tryPing();
  });
}

async function api(method, pathname, body) {
  const res = await fetch(`http://localhost:${PORT}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

before(async () => {
  // Seed the temp db before launching the server
  const projectDir = path.join(__dirname, '..');
  const seed = spawn(process.execPath, [path.join(projectDir, 'src', 'seed.js')], {
    cwd: projectDir,
    env: { ...process.env, MEETING_AGENT_DB: dbFile },
    stdio: 'pipe',
  });
  await new Promise((res, rej) => {
    seed.on('close', (code) => (code === 0 ? res() : rej(new Error('seed failed: ' + code))));
  });

  server = spawn(process.execPath, [path.join(projectDir, 'src', 'app.js')], {
    cwd: projectDir,
    env: { ...process.env, MEETING_AGENT_DB: dbFile, PORT: String(PORT) },
    stdio: 'pipe',
  });
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  ready = true;
  await waitForServer();
});

after(async () => {
  if (server) server.kill('SIGTERM');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('GET /calendar/events returns seeded events', async () => {
  const { status, json } = await api('GET', '/calendar/events');
  assert.equal(status, 200);
  assert.ok(json.events.length >= 10, `expected >= 10 events, got ${json.events.length}`);
});

test('POST /calendar/availability returns candidate slots', async () => {
  const { status, json } = await api('POST', '/calendar/availability', {
    durationMin: 30,
    windowStart: '2026-09-25T08:00:00.000Z',
    windowEnd: '2026-09-25T17:00:00.000Z',
  });
  assert.equal(status, 200);
  assert.ok(json.windows && json.windows.length > 0);
});

test('GET /meetings returns the seeded meeting workspace', async () => {
  const { status, json } = await api('GET', '/meetings');
  assert.equal(status, 200);
  const mtg = json.meetings.find(m => m.id === 'mtg_1');
  assert.ok(mtg, 'expect mtg_1');
  assert.equal(mtg.followUpState, 'active');
  assert.ok(Array.isArray(mtg.actionItems));
});

test('POST /meetings/:id/notes extracts decisions and actions', async () => {
  const { status, json } = await api('POST', '/meetings/mtg_1/notes', {
    notes: 'Decision: Ship the API first.\nAction item: Update the docs\nOwner: @alice',
  });
  assert.equal(status, 200);
  assert.ok(json.decisions.length >= 1);
  assert.ok(json.actionItems.length >= 1);
});

test('POST /agent/runs creates a pending approval for schedule_meeting', async () => {
  const { status, json } = await api('POST', '/agent/runs', { text: 'Schedule a team meeting tomorrow' });
  assert.equal(status, 201);
  assert.equal(json.run.actionType, 'schedule_meeting');
  assert.equal(json.run.riskLevel, 'high');
  assert.equal(json.run.approvalStatus, 'pending');
  assert.ok((json.run.proposal.candidateSlots || []).length > 0);
});

test('POST /agent/runs/:id/approve executes and verifies', async () => {
  const created = await api('POST', '/agent/runs', { text: 'Schedule a meeting tomorrow' });
  const run = created.json.run;
  const slot = run.proposal.candidateSlots[0];
  const { status, json } = await api('POST', `/agent/runs/${run.id}/approve`, { selectedSlot: slot });
  assert.equal(status, 200);
  assert.equal(json.run.approvalStatus, 'approved');
  assert.equal(json.run.executionStatus, 'completed');
  assert.equal(json.run.verificationStatus, 'verified');

  // The approved run must now appear in the audit trail
  const audit = await api('GET', '/agent/actions');
  assert.ok(audit.json.actions.some(a => a.id === run.id));
});

test('GET /dashboard returns agenda, stats, and open actions', async () => {
  const { status, json } = await api('GET', '/dashboard');
  assert.equal(status, 200);
  assert.equal(typeof json.stats.meetingsToday, 'number');
  assert.ok(Array.isArray(json.todayEvents));
});

test('GET /teams lists seeded Product Team', async () => {
  const { status, json } = await api('GET', '/teams');
  assert.equal(status, 200);
  assert.ok(json.teams.some(t => t.name === 'Product Team'));
});

test('GET /inbox returns activity feed', async () => {
  const { status, json } = await api('GET', '/inbox');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.activity));
});

test('frontend is served at /', async () => {
  const res = await fetch(`http://localhost:${PORT}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Meeting Agent'));
});

// ---- Phase 11: advanced agent ecosystem ----

test('GET /ecosystem/specialists lists the specialist registry', async () => {
  const { status, json } = await api('GET', '/ecosystem/specialists');
  assert.equal(status, 200);
  const ids = json.specialists.map(s => s.id);
  assert.ok(ids.includes('scheduler'));
  assert.ok(ids.includes('focusguard'));
  assert.ok(json.specialists.length >= 5);
});

test('POST /ecosystem/negotiate runs multi-agent negotiation to an agreement', async () => {
  const { status, json } = await api('POST', '/ecosystem/negotiate', { text: 'Schedule a team sync' });
  assert.equal(status, 201);
  assert.ok(json.negotiationId);
  assert.ok(json.agreement.start && json.agreement.end);
  assert.ok(json.participants.includes('scheduler'));
  assert.ok(json.transcript.length >= 3);

  const outbound = await api('GET', '/ecosystem/outbox');
  assert.ok(Array.isArray(outbound.json.messages));
});

test('GET /ecosystem/graph returns teams, people, and meeting links', async () => {
  const { status, json } = await api('GET', '/ecosystem/graph');
  assert.equal(status, 200);
  assert.ok(json.teams.length >= 1);
  const emails = json.people.map(p => p.email);
  assert.ok(emails.includes('alice@meetingagent.test'));
  assert.ok(json.stats.meetingLinks === 1, 'linked Sprint Planning meeting');
  assert.ok(json.meetingLinks[0].attendees.includes('bob@meetingagent.test'));
});

test('POST /ecosystem/outbox creates a follow-up draft and send marks it delivered', async () => {
  const { status, json } = await api('POST', '/ecosystem/outbox', { kind: 'follow_up', meetingId: 'mtg_1' });
  assert.equal(status, 201);
  assert.equal(json.message.status, 'draft');
  assert.ok(json.message.subject.includes('Follow-up'));
  assert.ok(json.message.body.includes('Open action items:'));
  assert.ok(json.message.to_address.includes('alice@meetingagent.test'));

  const sent = await api('POST', `/ecosystem/outbox/${json.message.id}/send`);
  assert.equal(sent.status, 200);
  assert.equal(sent.json.message.status, 'sent');
  assert.equal(sent.json.transport, 'simulated');
});

test('POST /ecosystem/negotiate honors explicit candidate slots', async () => {
  const slots = [
    { start: '2027-02-01T15:00:00.000Z', end: '2027-02-01T16:00:00.000Z' },
    { start: '2027-02-02T10:00:00.000Z', end: '2027-02-02T11:00:00.000Z' },
    { start: '2027-02-03T09:30:00.000Z', end: '2027-02-03T10:30:00.000Z' },
  ];
  const { status, json } = await api('POST', '/ecosystem/negotiate', { candidateSlots: slots });
  assert.equal(status, 201);
  const chosen = [json.agreement.start, json.agreement.end];
  assert.ok(slots.some(s => chosen.includes(s.start)), 'agreed slot must come from candidates');
});

test('GET /proactive/hygiene returns a score and issues list', async () => {
  const { status, json } = await api('GET', '/proactive/hygiene');
  assert.equal(status, 200);
  assert.equal(typeof json.score, 'number');
  assert.ok(Array.isArray(json.issues));
});

test('GET /proactive/recurring flags recurring events and workspace linkage', async () => {
  const { status, json } = await api('GET', '/proactive/recurring');
  assert.equal(status, 200);
  assert.ok(json.recurring.length >= 2, 'expected recurring events from seed');
  const standup = json.recurring.find(r => /standup/i.test(r.title));
  assert.ok(standup, 'expected Team Standup');
  assert.ok(standup.freq, 'expected freq');
  assert.equal(typeof standup.linkedWorkspace, 'boolean');
});

test('GET /proactive/focus finds open blocks or overloaded days', async () => {
  const { status, json } = await api('GET', '/proactive/focus');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.focusBlocks));
  assert.ok(Array.isArray(json.overloaded));
});

test('GET /proactive/suggestions returns a prioritized feed with summary', async () => {
  const { status, json } = await api('GET', '/proactive/suggestions');
  assert.equal(status, 200);
  assert.ok(Array.isArray(json.feed));
  assert.equal(typeof json.summary.score, 'number');
  assert.equal(typeof json.summary.hygieneIssues, 'number');
  assert.equal(typeof json.summary.recurringWithoutWorkspace, 'number');
});

test('GET /people returns a directory with seeded teammates', async () => {
  const { status, json } = await api('GET', '/people');
  assert.equal(status, 200);
  const emails = json.people.map(p => p.email);
  assert.ok(emails.includes('alice@meetingagent.test'), 'expected alice in directory');
  assert.ok(emails.includes('bob@meetingagent.test'), 'expected bob in directory');
  const alice = json.people.find(p => p.email === 'alice@meetingagent.test');
  assert.ok(alice.teams.some(t => t.name === 'Product Team'));
});

test('GET /people/:id/context returns person snapshot', async () => {
  const dir = await api('GET', '/people');
  const alice = dir.json.people.find(p => p.email === 'alice@meetingagent.test');
  const { status, json } = await api('GET', `/people/${alice.id}/context`);
  assert.equal(status, 200);
  assert.equal(json.person.name, 'Alice Chen');
  assert.equal(json.context.calendarConnected, false);
  assert.equal(json.context.availableHoursThisWeek, null); // no connected calendar → unknown

  // demo user has a connected calendar → numeric availability
  const demo = await api('GET', '/people/demo_user/context');
  assert.equal(demo.json.context.calendarConnected, true);
  assert.equal(typeof demo.json.context.availableHoursThisWeek, 'number');
});

test('POST /teams/:id/members adds a member (creating the user)', async () => {
  const teams = await api('GET', '/teams');
  const team = teams.json.teams[0];
  const { status, json } = await api('POST', `/teams/${team.id}/members`, {
    email: 'newbie@meetingagent.test',
    name: 'Newbie User',
    role: 'engineer',
  });
  assert.equal(status, 201);
  assert.equal(json.member.email, 'newbie@meetingagent.test');

  const dir = await api('GET', '/people');
  assert.ok(dir.json.people.some(p => p.email === 'newbie@meetingagent.test'));
});

test('DELETE /teams/:id/members/:userId removes the member', async () => {
  const teams = await api('GET', '/teams');
  const team = teams.json.teams[0];

  await api('POST', `/teams/${team.id}/members`, { email: 'tempdrop@meetingagent.test', name: 'Temp Drop' });
  const dir = await api('GET', '/people');
  const temp = dir.json.people.find(p => p.email === 'tempdrop@meetingagent.test');
  assert.ok(temp, 'member should exist before removal');

  const del = await api('DELETE', `/teams/${team.id}/members/${temp.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.json.message, 'Member removed from team');
});

test('POST /calendar/events with a conflict returns 409 unless allowConflict', async () => {
  // Grab an existing event window to force a collision
  const list = await api('GET', '/calendar/events');
  const existing = list.json.events.find(e => e.start && e.end && !e.allDay);
  assert.ok(existing, 'expected a seeded event');

  const { status, json } = await api('POST', '/calendar/events', {
    title: 'Conflicting Event',
    start: existing.start,
    end: existing.end,
  });
  assert.equal(status, 409);
  assert.ok(json.conflicts.length >= 1, 'expected at least one conflict reported');

  const ok = await api('POST', '/calendar/events', {
    title: 'Conflicting Event',
    start: existing.start,
    end: existing.end,
    allowConflict: true,
  });
  assert.equal(ok.status, 201);
});

test('POST /calendar/events/:id/reschedule moves an event (exact mode)', async () => {
  const list = await api('GET', '/calendar/events');
  const event = list.json.events.find(e => e.start && e.end && !e.allDay);
  assert.ok(event, 'expected a seeded event');

  const newStart = '2027-01-05T20:00:00.000Z';
  const newEnd = '2027-01-05T21:00:00.000Z';
  const { status, json } = await api('POST', `/calendar/events/${event.id}/reschedule`, {
    start: newStart, end: newEnd,
  });
  assert.equal(status, 200);
  assert.equal(json.event.start, newStart);
  assert.equal(json.event.end, newEnd);
});

test('POST /calendar/events/:id/reschedule mode:next finds a free slot', async () => {
  const list = await api('GET', '/calendar/events');
  const event = list.json.events.find(e => e.start && e.end && !e.allDay);
  const { status, json } = await api('POST', `/calendar/events/${event.id}/reschedule`, {
    mode: 'next', durationMin: 30,
  });
  assert.equal(status, 200);
  assert.ok(json.event.start && json.event.end);
});

test('GET /calendar/events/:id/instances expands a recurring event', async () => {
  const list = await api('GET', '/calendar/events');
  const recurring = list.json.events.find(e => e.recurrence && e.recurrence.length);
  assert.ok(recurring, 'expected a recurring event');

  const { status, json } = await api('GET', `/calendar/events/${recurring.id}/instances?count=5`);
  assert.equal(status, 200);
  assert.ok(json.instances.length >= 1, `expected >= 1 instance, got ${json.instances.length}`);
  assert.ok(json.instances[0].start && json.instances[0].end);
});

test('GET/PUT /calendar/preferences roundtrips', async () => {
  const before = await api('GET', '/calendar/preferences');
  assert.equal(before.status, 200);
  assert.equal(typeof before.json.preferences, 'object');

  const { status, json } = await api('PUT', '/calendar/preferences', {
    defaultDuration: 60, buffer: 20, preferredDays: ['mon', 'wed', 'fri'],
  });
  assert.equal(status, 200);
  assert.equal(json.preferences.defaultDuration, 60);
  assert.deepEqual(json.preferences.preferredDays, ['mon', 'wed', 'fri']);

  const after = await api('GET', '/calendar/preferences');
  assert.equal(after.json.preferences.buffer, 20);
});