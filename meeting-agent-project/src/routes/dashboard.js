const { Router } = require('express');
const { db } = require('../db.js');

const router = Router();

function parseJson(s, fallback) {
  try { return JSON.parse(s || '[]'); } catch { return fallback; }
}

// GET /dashboard — today's agenda + quick stats
router.get('/', async (req, res) => {
  try {
    const conn = db.prepare(`SELECT * FROM calendar_connections WHERE user_id = ?`).get(req.user.id);

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    let todayEvents = [];
    if (conn) {
      todayEvents = db.prepare(`
        SELECT * FROM calendar_events
        WHERE calendar_connection_id = ? AND start >= ? AND start < ? AND all_day = 0
        ORDER BY start ASC
      `).all(conn.id, dayStart.toISOString(), dayEnd.toISOString());
    }

    const pendingApprovals = db.prepare(`
      SELECT id, summary, action_type, risk_level, created_at, proposal
      FROM agent_actions
      WHERE user_id = ? AND approval_status = 'pending'
      ORDER BY created_at DESC
      LIMIT 10
    `).all(req.user.id);

    // Open action items across the user's team meetings
    const teamRows = db.prepare(`
      SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ?
    `).all(req.user.id);
    const teamIds = teamRows.map(r => r.team_id);
    const openActions = [];
    if (teamIds.length) {
      const placeholders = teamIds.map(() => '?').join(',');
      const meetings = db.prepare(`
        SELECT id, purpose, action_items FROM meetings
        WHERE team_id IN (${placeholders})
      `).all(...teamIds);
      for (const m of meetings) {
        for (const item of parseJson(m.action_items, [])) {
          if (item && !item.done) {
            openActions.push({ id: item.id, text: item.text, due: item.due, meeting: m.purpose });
          }
        }
      }
    }

    const stats = {
      meetingsToday: todayEvents.length,
      pendingApprovals: pendingApprovals.length,
      openActionItems: openActions.length,
    };

    res.json({
      date: dayStart.toISOString(),
      stats,
      todayEvents: todayEvents.map(e => ({
        id: e.id, title: e.title, start: e.start, end: e.end, timezone: e.timezone,
        attendees: parseJson(e.attendees, []).length,
      })),
      pendingApprovals: pendingApprovals.map(p => ({ id: p.id, summary: p.summary, actionType: p.action_type, riskLevel: p.risk_level, createdAt: p.created_at })),
      openActions: openActions.slice(0, 10),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to build dashboard' });
  }
});

module.exports = router;