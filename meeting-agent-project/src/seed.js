const { db } = require('./db.js');

const now = new Date();

function isoDayOffset(days, hour, minute = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

db.prepare(`DELETE FROM calendar_events`).run();
db.prepare(`DELETE FROM user_credentials`).run();
db.prepare(`DELETE FROM calendar_connections`).run();
db.prepare(`DELETE FROM team_members`).run();
db.prepare(`DELETE FROM meetings`).run();
db.prepare(`DELETE FROM agent_actions`).run();
db.prepare(`DELETE FROM teams`).run();
db.prepare(`DELETE FROM users`).run();

db.prepare(`INSERT INTO users (id, tenant_id, name, email, timezone, preferences) VALUES (?, ?, ?, ?, ?, ?)`)
  .run('demo_user', 'default-tenant', 'Demo User', 'demo@meetingagent.test', 'America/Los_Angeles', JSON.stringify({
    earliestTime: '09:00',
    latestTime: '17:00',
    defaultDuration: 30,
    buffer: 15,
    preferredDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  }));
const userId = 'demo_user';

const teamId = 'team_demo';
db.prepare(`INSERT INTO teams (id, tenant_id, name, description) VALUES (?, ?, ?, ?)`)
  .run(teamId, 'default-tenant', 'Product Team', 'Building the Meeting Agent together');

const teammateRows = [
  ['user_alice', 'Alice Chen', 'alice@meetingagent.test', 'Product Manager', 'America/Los_Angeles'],
  ['user_bob', 'Bob Reyes', 'bob@meetingagent.test', 'Frontend Engineer', 'America/Chicago'],
  ['user_carlos', 'Carlos Mendez', 'carlos@meetingagent.test', 'Backend Engineer', 'America/Los_Angeles'],
];
for (const [uid, name, email, role, tz] of teammateRows) {
  db.prepare(`INSERT INTO users (id, tenant_id, name, email, timezone, preferences) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(uid, 'default-tenant', name, email, tz, JSON.stringify({
      earliestTime: '08:30', latestTime: '18:00', defaultDuration: 30, buffer: 10,
      preferredDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    }));
  db.prepare(`INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, ?)`)
    .run(`tm_${uid}`, teamId, uid, role);
}

db.prepare(`INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, ?)`)
  .run('tm_1', teamId, userId, 'admin');

const connId = 'conn_demo';
db.prepare(`INSERT INTO calendar_connections (id, user_id, provider, provider_account_id, scopes, status) VALUES (?, ?, 'google', 'demo-account', '[]', 'connected')`)
  .run(connId, userId);

const insertEvent = (title, startIso, endIso, opts = {}) => {
  db.prepare(`
    INSERT OR REPLACE INTO calendar_events
    (id, provider_event_id, calendar_connection_id, title, description, start, end, timezone, organizer, attendees, recurrence, all_day, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `ev_demo_${Math.random().toString(36).substr(2, 8)}`,
    `google_demo_${Math.random().toString(36).substr(2, 8)}`,
    connId,
    title,
    opts.description || '',
    startIso,
    endIso,
    'America/Los_Angeles',
    'demo@meetingagent.test',
    JSON.stringify(opts.attendees || ['alice@meetingagent.test', 'bob@meetingagent.test']),
    JSON.stringify(opts.recurrence || []),
    opts.allDay ? 1 : 0,
    'confirmed'
  );
};

const pad = (days, hour, mins = 0, dur = 45) => {
  const s = isoDayOffset(days, hour, mins);
  const e = new Date(new Date(s).getTime() + dur * 60000).toISOString();
  return [s, e];
};

// Today
let [s, e] = pad(-1, 14, 0, 60); insertEvent('Team Standup', s, e, { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'] });
[s, e] = pad(-1, 10, 0, 30); insertEvent('1:1 with Alice', s, e, { attendees: ['alice@meetingagent.test'] });
[s, e] = pad(0, 9, 30, 30); insertEvent('Email time (focus)', s, e, { description: 'Deep work block', attendees: [] });
[s, e] = pad(0, 11, 0, 60); insertEvent('Sprint Planning', s, e, { attendees: ['alice@meetingagent.test', 'bob@meetingagent.test', 'carlos@meetingagent.test'] });
[s, e] = pad(0, 13, 0, 30); insertEvent('Lunch', s, e, { attendees: [] });
[s, e] = pad(1, 10, 0, 60); insertEvent('Product Review', s, e, { attendees: ['alice@meetingagent.test', 'bob@meetingagent.test'] });
[s, e] = pad(1, 15, 0, 45); insertEvent('Design Sync', s, e, { attendees: ['bob@meetingagent.test'] });
[s, e] = pad(2, 9, 0, 30); insertEvent('Career Check-in', s, e, { attendees: ['manager@meetingagent.test'] });
[s, e] = pad(3, 14, 0, 90); insertEvent('Client Demo', s, e, { attendees: ['client@example.com'] });
[s, e] = pad(4, 11, 0, 60); insertEvent('Retro', s, e, { recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=FR'] });

// A meeting workspace entry
db.prepare(`INSERT INTO meetings (id, team_id, calendar_event_id, purpose, agenda, preparation, notes, decisions, action_items, follow_up_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
  .run('mtg_1', teamId, null,
    'Weekly planning sync',
    '1. Review blockers\n2. Set priorities for week\n3. Assign owners',
    'Review sprint board before joining',
    JSON.stringify(['Discussed launch timeline']),
    JSON.stringify(['Ship onboarding flow by Friday']),
    JSON.stringify([{ text: 'Ship onboarding flow by Friday', owner: 'demo@meetingagent.test', due: isoDayOffset(3, 12), done: 0 }]),
    'active'
  );

console.log('Demo data seeded: user, team, calendar connection, 10 events, 1 meeting workspace');
console.log('User email: demo@meetingagent.test');