const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');
const { db } = require('../db.js');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
];

function getOAuthClient(tokens) {
  const client = new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  client.setCredentials(tokens);
  return client;
}

function getCredentialsForUser(userId) {
  const row = db.prepare(`SELECT * FROM user_credentials WHERE user_id = ?`)
    .get(userId);
  if (!row) return null;
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    token_type: 'Bearer',
    expiry_date: row.expires_at ? new Date(row.expires_at).getTime() : undefined,
  };
}

function getCalendarClient(userId) {
  const tokens = getCredentialsForUser(userId);
  if (!tokens) return null;
  const auth = getOAuthClient(tokens);
  return google.calendar({ version: 'v3', auth });
}

function mapGoogleEvent(event) {
  return {
    id: event.id,
    providerEventId: event.id,
    title: event.summary || '(no title)',
    description: event.description || '',
    start: event.start ? (event.start.dateTime || event.start.date) : null,
    end: event.end ? (event.end.dateTime || event.end.date) : null,
    allDay: !!(event.start && event.start.date && !event.start.dateTime),
    timezone: (event.start && event.start.timeZone) || 'UTC',
    organizer: event.organizer ? event.organizer.email : null,
    attendees: (event.attendees || []).map(a => a.email),
    recurrence: event.recurrence || [],
    meetingLink: (event.hangoutLink || event.conferenceData && event.conferenceData.entryPoints) 
      ? (event.hangoutLink || event.conferenceData.entryPoints.find(e => e.entryPointType === 'video')?.uri)
      : null,
    status: event.status || 'confirmed',
    locked: !!event.locked,
  };
}

function normalizeToRange(events) {
  return events
    .filter(e => e.start && e.end)
    .map(e => ({ start: new Date(e.start), end: new Date(e.end), title: e.title }));
}

function findOverlaps(events, noOverlapWin = 0) {
  const busy = normalizeToRange(events);
  const overlaps = [];
  for (let i = 0; i < busy.length; i++) {
    for (let j = i + 1; j < busy.length; j++) {
      const a = busy[i];
      const b = busy[j];
      const overlapStart = Math.max(a.start.getTime(), b.start.getTime());
      const overlapEnd = Math.min(a.end.getTime(), b.end.getTime());
      const overlapMs = overlapEnd - overlapStart;
      if (overlapMs > noOverlapWin) {
        overlaps.push({
          a: a.title,
          b: b.title,
          overlapMinutes: Math.round(overlapMs / 60000),
        });
      }
    }
  }
  return overlaps;
}

function findAvailability(events, durationMin, windowStart, windowEnd, options = {}) {
  const busy = normalizeToRange(events);
  const stepMin = options.stepMin || 30;
  const bufferMin = options.bufferMin || 0;

  const startMs = new Date(windowStart).getTime();
  const endMs = new Date(windowEnd).getTime();
  const durationMs = durationMin * 60000;
  const stepMs = stepMin * 60000;

  const candidates = [];
  for (let t = startMs; t + durationMs <= endMs; t += stepMs) {
    const slotStart = t;
    const slotEnd = t + durationMs;

    // Apply buffer around the slot
    const bufferedStart = slotStart - bufferMin * 60000;
    const bufferedEnd = slotEnd + bufferMin * 60000;

    const conflicts = busy.filter(b =>
      b.end.getTime() > bufferedStart && b.start.getTime() < bufferedEnd
    );

    if (conflicts.length === 0) {
      candidates.push({
        start: new Date(slotStart).toISOString(),
        end: new Date(slotEnd).toISOString(),
        durationMin,
        windows: Math.round(1 + (t - startMs) / stepMs),
      });
    }
  }
  return candidates;
}

async function syncEvents(userId, connId, timeMin, timeMax) {
  const cal = getCalendarClient(userId);
  if (!cal) return { synced: false, reason: 'no_credentials' };

  const response = await cal.events.list({
    calendarId: 'primary',
    timeMin: timeMin || new Date(Date.now() - 30 * 86400000).toISOString(),
    timeMax: timeMax || new Date(Date.now() + 60 * 86400000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });

  const events = (response.data.items || []).filter(e => e.status !== 'cancelled');

  const insert = db.prepare(`
    INSERT OR REPLACE INTO calendar_events
    (id, provider_event_id, calendar_connection_id, title, description, start, end, timezone, organizer, attendees, recurrence, all_day, status, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const e of rows) {
      const mapped = mapGoogleEvent(e);
      const localId = `ev_${connId}_${mapped.providerEventId}`;
      insert.run(
        localId,
        mapped.providerEventId,
        connId,
        mapped.title,
        mapped.description,
        mapped.start,
        mapped.end,
        mapped.timezone,
        mapped.organizer,
        JSON.stringify(mapped.attendees),
        JSON.stringify(mapped.recurrence),
        mapped.allDay ? 1 : 0,
        mapped.status,
        new Date().toISOString(),
      );
    }
  });
  tx(events);

  db.prepare(`UPDATE calendar_connections SET last_synced_at = ? WHERE id = ?`)
    .run(new Date().toISOString(), connId);

  return { synced: true, count: events.length };
}

module.exports = {
  SCOPES,
  getCredentialsForUser,
  getCalendarClient,
  mapGoogleEvent,
  findOverlaps,
  findAvailability,
  syncEvents,
};