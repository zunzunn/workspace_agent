const { Router } = require('express');
const { db } = require('../db.js');
const { prepareMeetingBrief, createActionItemsFromNotes, extractDecisionsFromNotes } = require('../services/meeting-intelligence.js');

const router = Router();

const parseJson = (s, fallback) => {
  try { return JSON.parse(s || '[]'); } catch { return fallback; }
};

const mapRow = (r) => r ? ({
  id: r.id,
  teamId: r.team_id,
  calendarEventId: r.calendar_event_id,
  purpose: r.purpose,
  agenda: parseJson(r.agenda, []),
  preparation: r.preparation,
  notes: r.notes,
  decisions: parseJson(r.decisions, []),
  actionItems: parseJson(r.action_items, []),
  followUpState: r.follow_up_state,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
}) : null;

// GET /meetings (optionally ?teamId=)
router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.query.teamId) {
      rows = db.prepare(`SELECT * FROM meetings WHERE team_id = ? ORDER BY created_at DESC`).all(req.query.teamId);
    } else {
      rows = db.prepare(`
        SELECT m.* FROM meetings m
        JOIN teams t ON t.id = m.team_id
        JOIN team_members tm ON tm.team_id = t.id
        WHERE tm.user_id = ?
        ORDER BY m.created_at DESC
      `).all(req.user.id);
    }
    res.json({ meetings: rows.map(mapRow) });
  } catch (error) {
    console.error('List meetings error:', error);
    res.status(500).json({ error: 'Failed to list meetings' });
  }
});

// POST /meetings — create a meeting workspace from a calendar event or standalone
router.post('/', async (req, res) => {
  try {
    const { teamId, calendarEventId, purpose, agenda, preparation } = req.body;
    if (!purpose && !calendarEventId) {
      return res.status(400).json({ error: 'purpose or calendarEventId is required' });
    }

    let resolvedTeam = teamId;
    if (!resolvedTeam) {
      const member = db.prepare(`SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ? LIMIT 1`).get(req.user.id);
      resolvedTeam = member ? member.team_id : null;
    }

    const id = `mtg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    db.prepare(`
      INSERT INTO meetings (id, team_id, calendar_event_id, purpose, agenda, preparation, follow_up_state)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `).run(
      id, resolvedTeam, calendarEventId || null, purpose || '', agenda ? JSON.stringify(agenda) : '[]', preparation || ''
    );

    res.status(201).json({ meeting: mapRow(db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(id)) });
  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// GET /meetings/:id
router.get('/:id', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Meeting not found' });

    let calendarEvent = null;
    if (row.calendar_event_id) {
      const ev = db.prepare(`SELECT * FROM calendar_events WHERE id = ?`).get(row.calendar_event_id);
      if (ev) {
        calendarEvent = {
          id: ev.id,
          title: ev.title,
          start: ev.start,
          end: ev.end,
          timezone: ev.timezone,
          attendees: parseJson(ev.attendees, []),
        };
      }
    }
    res.json({ meeting: mapRow(row), calendarEvent });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// POST /meetings/:id/prepare — generate a preparation brief
router.post('/:id/prepare', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Meeting not found' });

    const context = {
      meetingId: row.id,
      purpose: row.purpose,
      agenda: parseJson(row.agenda, []),
      recentDecisions: parseJson(row.decisions, []),
      actionItems: parseJson(row.action_items, []),
    };

    // Gather prior meetings for context
    const prior = db.prepare(`
      SELECT * FROM meetings WHERE id != ? AND (purpose LIKE ?) 
    `).all(row.id, `%${(row.purpose || '').split(' ')[0] || ''}%`);

    const brief = prepareMeetingBrief(context, prior.slice(0, 3));

    db.prepare(`UPDATE meetings SET preparation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(brief), row.id);

    res.json({ brief });
  } catch (error) {
    console.error('Prepare meeting error:', error);
    res.status(500).json({ error: 'Failed to prepare meeting' });
  }
});

// PATCH /meetings/:id — update purpose, agenda, notes, decisions, action items
router.patch('/:id', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Meeting not found' });

    const { purpose, agenda, preparation, notes, decisions, actionItems, followUpState } = req.body;
    db.prepare(`
      UPDATE meetings SET
        purpose = COALESCE(?, purpose),
        agenda = COALESCE(?, agenda),
        preparation = COALESCE(?, preparation),
        notes = COALESCE(?, notes),
        decisions = COALESCE(?, decisions),
        action_items = COALESCE(?, action_items),
        follow_up_state = COALESCE(?, follow_up_state),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      purpose || null,
      agenda ? JSON.stringify(agenda) : null,
      preparation != null ? (typeof preparation === 'string' ? preparation : JSON.stringify(preparation)) : null,
      notes || null,
      decisions ? JSON.stringify(decisions) : null,
      actionItems ? JSON.stringify(actionItems) : null,
      followUpState || null,
      row.id
    );

    res.json({ meeting: mapRow(db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(row.id)) });
  } catch (error) {
    console.error('Update meeting error:', error);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// POST /meetings/:id/notes — extract decisions + action items from freeform notes
router.post('/:id/notes', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Meeting not found' });

    const { notes } = req.body;
    if (!notes) return res.status(400).json({ error: 'notes is required' });

    const extracted = extractDecisionsFromNotes(notes);
    const actions = createActionItemsFromNotes(notes, req.user.email);

    db.prepare(`UPDATE meetings SET notes = ?, decisions = ?, action_items = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(
        notes,
        JSON.stringify(extracted.decisions),
        JSON.stringify(actions),
        row.id
      );

    res.json({ decisions: extracted.decisions, actionItems: actions });
  } catch (error) {
    console.error('Extract notes error:', error);
    res.status(500).json({ error: 'Failed to extract notes' });
  }
});

// GET /meetings/:id/activity — lifecycle activity feed
router.get('/:id/activity', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM meetings WHERE id = ?`).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Meeting not found' });

    const activity = [
      { type: 'created', at: row.created_at, meta: { purpose: row.purpose } },
    ];
    if (row.preparation) {
      activity.push({ type: 'prepared', at: row.updated_at, meta: { hasBrief: true } });
    }
    if (row.notes) {
      activity.push({ type: 'notes_added', at: row.updated_at, meta: { decisions: parseJson(row.decisions, []).length, actions: parseJson(row.action_items, []).length } });
    }

    // Follow-up actions derived from open action items
    const openActions = parseJson(row.action_items, []).filter(a => !a.done);
    activity.push({ type: 'follow_up', at: row.updated_at, meta: { openActions: openActions.length, state: row.follow_up_state } });

    res.json({ activity });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;