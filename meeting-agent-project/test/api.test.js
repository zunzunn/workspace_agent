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