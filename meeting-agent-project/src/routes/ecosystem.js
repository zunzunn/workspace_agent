const { Router } = require('express');
const { db } = require('../db.js');
const { findAvailability } = require('../services/calendar-service.js');
const { SPECIALISTS, routeRequest } = require('../services/specialist-agents.js');
const { negotiatedSlot } = require('../services/negotiation.js');
const { draftMeetingFollowUp, draftFocusReminder } = require('../services/communication.js');

const router = Router();

const parseJson = (s, fallback) => {
  try { return JSON.parse(s || fallback); } catch { return fallback; }
};

const getConn = (userId) => db.prepare(`SELECT * FROM calendar_connections WHERE user_id = ?`).get(userId);

function userPrefs(userId) {
  const row = db.prepare(`SELECT preferences FROM users WHERE id = ?`).get(userId);
  let prefs = {};
  try { prefs = JSON.parse((row && row.preferences) || '{}'); } catch { /* noop */ }
  return prefs;
}

// GET /ecosystem/specialists — list the specialist agent registry
router.get('/specialists', async (req, res) => {
  res.json({ specialists: SPECIALISTS });
});

// POST /ecosystem/negotiate — run multi-agent negotiation for a scheduling request
router.post('/negotiate', async (req, res) => {
  try {
    const { text, candidateSlots } = req.body;
    if (!text && !candidateSlots) return res.status(400).json({ error: 'text or candidateSlots required' });

    const routed = routeRequest(text || '');
    const participants = SPECIALISTS.map(s => s.id);

    let candidates = candidateSlots;
    if (!candidates) {
      const conn = getConn(req.user.id);
      if (!conn) return res.status(404).json({ error: 'Calendar not connected' });
      const prefs = userPrefs(req.user.id);
      const events = db.prepare(`SELECT * FROM calendar_events WHERE calendar_connection_id = ? AND all_day = 0`).all(conn.id)
        .map(e => ({ title: e.title, start: e.start, end: e.end }));
      const ws = new Date();
      ws.setHours(0, 0, 0, 0);
      const we = new Date(ws);
      we.setDate(we.getDate() + 7);
      candidates = findAvailability(
        events,
        prefs.defaultDuration || 30,
        ws.toISOString(),
        we.toISOString(),
        { stepMin: 30, bufferMin: prefs.buffer || 0, preferredDays: prefs.preferredDays }
      ).slice(0, 8);
    }

    if (!candidates.length) return res.status(409).json({ error: 'No candidate slots found' });

    const context = { offsetHours: 0, attendeesFreeAt: {}, busyBeforeStart: {} };
    const result = negotiatedSlot({ candidates, specialists: SPECIALISTS, context });

    if (!result.slot) return res.status(409).json({ error: 'Negotiation produced no agreement' });

    const id = `neg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    db.prepare(`
      INSERT INTO negotiations (id, user_id, request, transcript, outcome, slot, status)
      VALUES (?, ?, ?, ?, ?, ?, 'completed')
    `).run(
      id, req.user.id, text || '(auto)', JSON.stringify(result.transcript),
      'agreed', JSON.stringify({ start: result.slot.start, end: result.slot.end })
    );

    res.status(201).json({
      negotiationId: id,
      routedTo: routed.specialist,
      participants,
      agreement: result.slot,
      transcript: result.transcript,
    });
  } catch (error) {
    console.error('Negotiate error:', error);
    res.status(500).json({ error: 'Failed to negotiate' });
  }
});

// GET /ecosystem/graph — richer organizational graph (teams, members, meeting connectivity)
router.get('/graph', async (req, res) => {
  try {
    const teams = db.prepare(`
      SELECT t.id, t.name, t.description FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
      GROUP BY t.id
    `).all(req.user.id);

    const graphTeams = [];
    const allPeople = new Map();
    const meetingLinks = [];

    for (const t of teams) {
      const members = db.prepare(`
        SELECT u.id, u.name, u.email, u.timezone, tm.role FROM team_members tm
        JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ?
      `).all(t.id);
      members.forEach(m => allPeople.set(m.id, m));
      graphTeams.push({ ...t, members: members.map(m => m.id) });

      const meetings = db.prepare(`
        SELECT m.id, m.purpose, m.calendar_event_id FROM meetings m WHERE m.team_id = ?
      `).all(t.id);
      for (const m of meetings) {
        if (m.calendar_event_id) {
          const ev = db.prepare(`SELECT attendees FROM calendar_events WHERE id = ?`).get(m.calendar_event_id);
          const emails = parseJson(ev && ev.attendees, []);
          meetingLinks.push({
            meeting: m.purpose,
            attendees: emails,
          });
        }
      }
    }

    // Who works with whom (shared teams)
    const participantEmails = new Set(meetingLinks.flatMap(l => l.attendees));
    const people = Array.from(allPeople.values());

    res.json({
      teams: graphTeams,
      people,
      meetingLinks: meetingLinks.slice(0, 50),
      stats: { teams: graphTeams.length, people: people.length, meetingLinks: meetingLinks.length },
    });
  } catch (error) {
    console.error('Org graph error:', error);
    res.status(500).json({ error: 'Failed to build org graph' });
  }
});

// GET /ecosystem/outbox — list communications (drafts + sent)
router.get('/outbox', async (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM communications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(req.user.id);
    res.json({ messages: rows });
  } catch (error) {
    console.error('Outbox error:', error);
    res.status(500).json({ error: 'Failed to load outbox' });
  }
});

// POST /ecosystem/outbox — create a message draft (or auto-draft from meeting intelligence)
router.post('/outbox', async (req, res) => {
  try {
    const { kind, meetingId, to, subject, body } = req.body;
    if (!kind) return res.status(400).json({ error: 'kind is required (follow_up | focus_reminder | custom | agenda)' });

    let toAddress = to;
    let subj = subject;
    let text = body;

    if (kind === 'follow_up' && meetingId) {
      const meeting = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(meetingId);
      if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
      const ev = meeting.calendar_event_id
        ? db.prepare(`SELECT attendees FROM calendar_events WHERE id = ?`).get(meeting.calendar_event_id)
        : null;
      const draft = draftMeetingFollowUp(meeting, parseJson(ev && ev.attendees, []), req.user.email);
      toAddress = draft.to;
      subj = draft.body.split('\n')[0].replace(/^Subject: ?/, '');
      text = draft.body;
    }

    if (kind === 'focus_reminder') {
      const focusRows = db.prepare(`SELECT * FROM negotiations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`).all(req.user.id);
      if (focusRows.length) {
        const slot = parseJson(focusRows[0].slot, {});
        if (slot.start) {
          const overload = {
            date: slot.start.slice(0, 10),
            busyHours: 0,
            ratio: 0,
          };
          const rem = draftFocusReminder(overload);
          toAddress = req.user.email;
          subj = rem.subject;
          text = rem.body;
        }
      }
      if (!toAddress) {
        toAddress = req.user.email;
        subj = 'Focus-time reminder';
        text = 'Consider protecting focus time on heavily-booked days.';
      }
    }

    if (!toAddress || !text) return res.status(400).json({ error: 'to and body (or a valid kind) required' });

    const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    db.prepare(`
      INSERT INTO communications (id, user_id, kind, to_address, subject, body, status, meeting_id)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(id, req.user.id, kind, toAddress, subj || '', text, meetingId || null);

    res.status(201).json({ message: db.prepare(`SELECT * FROM communications WHERE id = ?`).get(id) });
  } catch (error) {
    console.error('Create draft error:', error);
    res.status(500).json({ error: 'Failed to create draft' });
  }
});

// POST /ecosystem/outbox/:id/send — mark delivered (simulated transport for the demo)
router.post('/outbox/:id/send', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM communications WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Message not found' });
    if (row.status === 'sent') return res.json({ message: row, alreadySent: true });

    db.prepare(`UPDATE communications SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?`).run(row.id);
    const updated = db.prepare(`SELECT * FROM communications WHERE id = ?`).get(row.id);
    res.json({ message: updated, transport: 'simulated' });
  } catch (error) {
    console.error('Send draft error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;