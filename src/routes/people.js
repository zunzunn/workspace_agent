const { Router } = require('express');
const { db } = require('../db.js');

const router = Router();

const parseJson = (s, fallback) => {
  try { return JSON.parse(s || fallback); } catch { return fallback; }
};

function teamsForUser(userId) {
  return db.prepare(`
    SELECT t.id, t.name FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE tm.user_id = ?
  `).all(userId);
}

// GET /people — directory of everyone across the user's teams
router.get('/', async (req, res) => {
  try {
    const teams = teamsForUser(req.user.id);
    if (!teams.length) return res.json({ people: [] });
    const teamIds = teams.map(t => t.id);
    const placeholders = teamIds.map(() => '?').join(',');

    const rows = db.prepare(`
      SELECT u.id, u.name, u.email, u.timezone, u.preferences, tm.role, t.id AS team_id, t.name AS team_name
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      JOIN teams t ON t.id = tm.team_id
      WHERE tm.team_id IN (${placeholders})
      ORDER BY u.name ASC
    `).all(...teamIds);

    // de-dup (person may be in multiple shared teams), merging roles/teams
    const byId = new Map();
    for (const r of rows) {
      if (!byId.has(r.id)) {
        let prefs = {};
        try { prefs = JSON.parse(r.preferences || '{}'); } catch { /* noop */ }
        byId.set(r.id, {
          id: r.id,
          name: r.name,
          email: r.email,
          timezone: r.timezone,
          role: r.role,
          preferences: prefs,
          teams: [],
        });
      }
      byId.get(r.id).teams.push({ id: r.team_id, name: r.team_name });
    }

    res.json({ people: Array.from(byId.values()) });
  } catch (error) {
    console.error('People directory error:', error);
    res.status(500).json({ error: 'Failed to fetch people directory' });
  }
});

// GET /people/:id/context — a person's availability snapshot + shared context
router.get('/:id/context', async (req, res) => {
  try {
    const person = db.prepare(`SELECT u.* FROM users u WHERE u.id = ?`).get(req.params.id);
    if (!person) return res.status(404).json({ error: 'Person not found' });

    let prefs = {};
    try { prefs = JSON.parse(person.preferences || '{}'); } catch { /* noop */ }

    // Availability for the next 7 days based on their events (null when no calendar connected)
    const conn = db.prepare(`SELECT * FROM calendar_connections WHERE user_id = ?`).get(person.id);
    let availableThisWeek = conn ? 7 * 8 : null;
    let upcomingEvents = 0;
    if (conn) {
      const nowIso = new Date().toISOString();
      const events = db.prepare(`
        SELECT start, end FROM calendar_events
        WHERE calendar_connection_id = ?
          AND all_day = 0 AND end > ?
        ORDER BY start ASC
      `).all(conn.id, nowIso);
      upcomingEvents = events.length;
      const dayMs = 86400000;
      for (const e of events) {
        const start = new Date(e.start).getTime();
        const end = new Date(e.end).getTime();
        if (start < Date.now() + 7 * dayMs) {
          availableThisWeek -= Math.max(0, (end - start) / 3600000);
        }
      }
      availableThisWeek = Math.round(availableThisWeek);
      if (availableThisWeek < 0) availableThisWeek = 0;
    }

    const meetings = db.prepare(`
      SELECT m.id, m.purpose, m.action_items
      FROM meetings m
      JOIN team_members tm ON tm.team_id = m.team_id
      WHERE tm.user_id = ? AND m.follow_up_state = 'active'
    `).all(person.id).map(m => ({
      purpose: m.purpose,
      openActions: parseJson(m.action_items, []).filter(a => a && !a.done).length,
    }));

    res.json({
      person: {
        id: person.id,
        name: person.name,
        email: person.email,
        timezone: person.timezone,
        role: (db.prepare(`SELECT tm.role FROM team_members tm WHERE tm.user_id = ? LIMIT 1`).get(person.id) || {}).role || 'member',
      },
      context: {
        preferences: prefs,
        calendarConnected: !!conn,
        upcomingEvents,
        availableHoursThisWeek: availableThisWeek,
        activeMeetings: meetings,
      },
    });
  } catch (error) {
    console.error('Person context error:', error);
    res.status(500).json({ error: 'Failed to fetch person context' });
  }
});

module.exports = router;