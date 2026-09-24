const { Router } = require('express');
const { db } = require('../db.js');
const {
  getCalendarClient, findOverlaps, findAvailability, findNextAvailableSlot, expandRecurrence, syncEvents, mapGoogleEvent,
} = require('../services/calendar-service.js');

const router = Router();

function getConnectionForUser(userId) {
  return db.prepare(`SELECT * FROM calendar_connections WHERE user_id = ?`).get(userId);
}

// Find events that overlap [start, end), excluding a given event id
function checkConflicts(connId, start, end, excludeId) {
  const rows = db.prepare(`
    SELECT * FROM calendar_events
    WHERE calendar_connection_id = ?
      AND all_day = 0
      AND id != ?
      AND start < ? AND end > ?
    ORDER BY start ASC
  `).all(connId, excludeId || '', end, start);
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    start: r.start,
    end: r.end,
    status: r.status,
  }));
}

function localEvents(connId, opts = {}) {
  const where = [];
  const params = [];
  if (opts.eventId) { where.push('id = ?'); params.push(opts.eventId); }
  if (opts.query) {
    where.push('(title LIKE ? OR description LIKE ? OR organizer LIKE ?)');
    const term = `%${opts.query}%`;
    params.push(term, term, term);
  }
  const sql = `
    SELECT * FROM calendar_events
    WHERE calendar_connection_id = ? ${where.length ? 'AND ' + where.join(' AND ') : ''}
    ORDER BY start ASC
  `;
  const rows = db.prepare(sql).all(connId, ...params);
  return rows.map(r => ({
    id: r.id,
    providerEventId: r.provider_event_id,
    title: r.title,
    description: r.description,
    start: r.start,
    end: r.end,
    timezone: r.timezone,
    organizer: r.organizer,
    attendees: JSON.parse(r.attendees || '[]'),
    recurrence: JSON.parse(r.recurrence || '[]'),
    allDay: !!r.all_day,
    status: r.status,
  }));
}

// GET /calendar/events?timeMin=&timeMax=&refresh=1
router.get('/events', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });

    if (req.query.refresh === '1') {
      const timeMin = req.query.timeMin ? new Date(req.query.timeMin).toISOString() : undefined;
      const timeMax = req.query.timeMax ? new Date(req.query.timeMax).toISOString() : undefined;
      try {
        const sync = await syncEvents(req.user.id, conn.id, timeMin, timeMax);
        if (!sync.synced) return res.status(502).json({ error: 'Google sync failed: ' + sync.reason });
      } catch (e) {
        return res.status(502).json({ error: 'Google sync failed: ' + e.message });
      }
    }

    res.json({ events: localEvents(conn.id) });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar events' });
  }
});

// GET /calendar/events/:id
router.get('/events/:id', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });
    const event = localEvents(conn.id, { eventId: req.params.id })[0];
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ event });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST /calendar/events
router.post('/events', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });
    const { title, start, end, timezone, attendees, description, recurrence } = req.body;
    if (!title || !start || !end) {
      return res.status(400).json({ error: 'title, start, end are required' });
    }

    // Conflict detection on write — report overlaps; the caller opts in to ignore with allowConflict
    const conflicts = checkConflicts(conn.id, new Date(start).toISOString(), new Date(end).toISOString(), null);
    if (conflicts.length > 0 && !req.body.allowConflict) {
      return res.status(409).json({
        error: 'Event conflicts with existing events',
        conflicts,
        hint: 'Set allowConflict: true to create anyway, or adjust the time window',
      });
    }

    // Push to Google when credentials exist
    const cal = getCalendarClient(req.user.id);
    let providerEventId = null;
    if (cal) {
      const googleEvent = await cal.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary: title,
          description: description || '',
          start: { dateTime: new Date(start).toISOString(), timeZone: timezone || 'UTC' },
          end: { dateTime: new Date(end).toISOString(), timeZone: timezone || 'UTC' },
          attendees: (attendees || []).map(email => ({ email })),
          recurrence: recurrence || undefined,
        },
      });
      providerEventId = googleEvent.data.id;
    }

    const localId = `ev_${conn.id}_local_${Date.now()}`;
    db.prepare(`
      INSERT INTO calendar_events
      (id, provider_event_id, calendar_connection_id, title, description, start, end, timezone, organizer, attendees, recurrence, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      localId, providerEventId || `local_${Date.now()}`, conn.id,
      title, description || '', new Date(start).toISOString(), new Date(end).toISOString(),
      timezone || 'UTC', req.user.email, JSON.stringify(attendees || []),
      JSON.stringify(recurrence || []), 'confirmed'
    );

    res.status(201).json({
      event: { id: localId, providerEventId, title, start, end, timezone, attendees, description },
      message: providerEventId ? 'Event created in Google Calendar and local cache' : 'Event created in local cache (no Google connection)',
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PATCH /calendar/events/:id
router.patch('/events/:id', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });
    const existing = localEvents(conn.id, { eventId: req.params.id })[0];
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const { title, start, end, timezone, attendees, description } = req.body;

    if (existing.providerEventId && !existing.providerEventId.startsWith('local_')) {
      const cal = getCalendarClient(req.user.id);
      if (cal) {
        await cal.events.patch({
          calendarId: 'primary',
          eventId: existing.providerEventId,
          requestBody: {
            summary: title,
            description: description,
            start: start ? { dateTime: new Date(start).toISOString(), timeZone: timezone || 'UTC' } : undefined,
            end: end ? { dateTime: new Date(end).toISOString(), timeZone: timezone || 'UTC' } : undefined,
            attendees: attendees ? attendees.map(email => ({ email })) : undefined,
          },
        });
      }
    }

    db.prepare(`
      UPDATE calendar_events SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        start = COALESCE(?, start),
        end = COALESCE(?, end),
        timezone = COALESCE(?, timezone),
        attendees = COALESCE(?, attendees),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title || null, description ?? null,
      start ? new Date(start).toISOString() : null,
      end ? new Date(end).toISOString() : null,
      timezone || null,
      attendees ? JSON.stringify(attendees) : null,
      req.params.id
    );

    res.json({ message: 'Event updated', event: localEvents(conn.id, { eventId: req.params.id })[0] });
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// POST /calendar/events/:id/reschedule
// { start?, end?, durationMin?, mode?: 'exact'|'next' , allowConflict?: bool }
router.post('/events/:id/reschedule', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });
    const existing = localEvents(conn.id, { eventId: req.params.id })[0];
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const { start, end, durationMin, mode = 'exact', allowConflict } = req.body;
    let newStart = start;
    let newEnd = end;

    if (mode === 'next' || (!newStart && !newEnd)) {
      const duration = durationMin || (existing.end && existing.start
        ? Math.round((new Date(existing.end) - new Date(existing.start)) / 60000)
        : 30);
      const from = newStart || existing.start || new Date().toISOString();
      const windowStart = new Date(from).toISOString();
      const windowEnd = new Date(new Date(from).getTime() + 14 * 86400000).toISOString();
      const events = localEvents(conn.id)
        .filter(e => e.id !== existing.id && !e.allDay)
        .map(e => ({ title: e.title, start: e.start, end: e.end }));
      const slot = findNextAvailableSlot(events, duration, windowStart, windowEnd, 30);
      if (!slot) return res.status(409).json({ error: 'No available slot found in the next 14 days' });
      newStart = slot.start;
      newEnd = slot.end;
    }

    if (!newStart || !newEnd) {
      return res.status(400).json({ error: 'start and end (or durationMin with mode:next) are required' });
    }

    const conflicts = checkConflicts(conn.id, new Date(newStart).toISOString(), new Date(newEnd).toISOString(), existing.id);
    if (conflicts.length > 0 && !allowConflict) {
      return res.status(409).json({
        error: 'Rescheduling would create a conflict',
        conflicts,
        hint: 'Set allowConflict: true to reschedule anyway, or use mode:next to find a free slot',
      });
    }

    if (existing.providerEventId && !existing.providerEventId.startsWith('local_')) {
      const cal = getCalendarClient(req.user.id);
      if (cal) {
        try {
          await cal.events.patch({
            calendarId: 'primary',
            eventId: existing.providerEventId,
            requestBody: {
              start: { dateTime: new Date(newStart).toISOString(), timeZone: existing.timezone || 'UTC' },
              end: { dateTime: new Date(newEnd).toISOString(), timeZone: existing.timezone || 'UTC' },
            },
          });
        } catch (e) {
          // best-effort provider push; still update local
        }
      }
    }

    db.prepare(`UPDATE calendar_events SET start = ?, end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(new Date(newStart).toISOString(), new Date(newEnd).toISOString(), existing.id);

    res.json({ message: 'Event rescheduled', event: localEvents(conn.id, { eventId: existing.id })[0] });
  } catch (error) {
    console.error('Reschedule event error:', error);
    res.status(500).json({ error: 'Failed to reschedule event' });
  }
});

// GET /calendar/events/:id/instances?count=8 — expand a recurring event into concrete instances
router.get('/events/:id/instances', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });
    const event = localEvents(conn.id, { eventId: req.params.id })[0];
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const count = Number(req.query.count) || 8;
    res.json({ eventId: event.id, title: event.title, recurrence: event.recurrence, instances: expandRecurrence(event, { count }) });
  } catch (error) {
    console.error('Expand recurrence error:', error);
    res.status(500).json({ error: 'Failed to expand recurrence' });
  }
});

// DELETE /calendar/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });
    const existing = localEvents(conn.id, { eventId: req.params.id })[0];
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    if (existing.providerEventId && !existing.providerEventId.startsWith('local_')) {
      const cal = getCalendarClient(req.user.id);
      if (cal) {
        try {
          await cal.events.delete({ calendarId: 'primary', eventId: existing.providerEventId });
        } catch (e) {
          // ignore not-found on provider; still delete local
        }
      }
    }

    db.prepare(`DELETE FROM calendar_events WHERE id = ?`).run(req.params.id);
    res.json({ message: 'Event deleted' });
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// GET /calendar/search/:query
router.get('/search/:query', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });
    res.json({ events: localEvents(conn.id, { query: req.params.query }) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to search events' });
  }
});

// POST /calendar/availability { durationMin, windowStart, windowEnd, stepMin, bufferMin }
router.post('/availability', async (req, res) => {
  try {
    const conn = getConnectionForUser(req.user.id);
    if (!conn) return res.status(404).json({ error: 'Calendar not connected' });

    const { durationMin, windowStart, windowEnd, stepMin, bufferMin, refresh } = req.body;
    if (!durationMin || !windowStart || !windowEnd) {
      return res.status(400).json({ error: 'durationMin, windowStart, windowEnd are required' });
    }

    if (refresh) {
      try { await syncEvents(req.user.id, conn.id, new Date(windowStart).toISOString(), new Date(windowEnd).toISOString()); } catch (e) { /* best-effort */ }
    }

    const events = localEvents(conn.id).filter(e => !e.allDay);
    const overlaps = findOverlaps(events.map(e => ({ title: e.title, start: new Date(e.start), end: new Date(e.end) })));
    const windows = findAvailability(
      events.map(e => ({ title: e.title, start: e.start, end: e.end })),
      durationMin, windowStart, windowEnd,
      { stepMin, bufferMin }
    );

    res.json({ windows, overlaps });
  } catch (error) {
    console.error('Availability error:', error);
    res.status(500).json({ error: 'Failed to compute availability' });
  }
});

// GET /calendar/preferences — return the current user's scheduling preferences
router.get('/preferences', async (req, res) => {
  try {
    const user = db.prepare(`SELECT preferences FROM users WHERE id = ?`).get(req.user.id);
    let prefs = {};
    try { prefs = JSON.parse((user && user.preferences) || '{}'); } catch { /* keep {} */ }
    res.json({ preferences: prefs });
  } catch (error) {
    console.error('Get preferences error:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// PUT /calendar/preferences — merge scheduling preferences
// Supports: earliestTime, latestTime, defaultDuration, buffer, preferredDays, timezone
router.put('/preferences', async (req, res) => {
  try {
    const user = db.prepare(`SELECT preferences FROM users WHERE id = ?`).get(req.user.id);
    let prefs = {};
    try { prefs = JSON.parse((user && user.preferences) || '{}'); } catch { /* keep {} */ }

    const { earliestTime, latestTime, defaultDuration, buffer, preferredDays, timezone } = req.body;
    const merged = {
      ...prefs,
      ...(earliestTime !== undefined && { earliestTime }),
      ...(latestTime !== undefined && { latestTime }),
      ...(defaultDuration !== undefined && { defaultDuration: Number(defaultDuration) }),
      ...(buffer !== undefined && { buffer: Number(buffer) }),
      ...(preferredDays !== undefined && { preferredDays }),
      ...(timezone !== undefined && { timezone }),
    };

    db.prepare(`UPDATE users SET preferences = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(merged), req.user.id);

    res.json({ message: 'Preferences updated', preferences: merged });
  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;