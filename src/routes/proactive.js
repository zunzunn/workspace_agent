const { Router } = require('express');
const { db } = require('../db.js');
const { expandRecurrence } = require('../services/calendar-service.js');
const {
  meetingHygieneScan,
  recurringAnalysis,
  focusTimeSuggestions,
  buildSuggestionFeed,
} = require('../services/proactive-engine.js');

const router = Router();

const parseJson = (s, fallback) => {
  try { return JSON.parse(s || fallback); } catch { return fallback; }
};

function getConnectionForUser(userId) {
  return db.prepare(`SELECT * FROM calendar_connections WHERE user_id = ?`).get(userId);
}

function loadContext(userId) {
  const conn = getConnectionForUser(userId);

  const events = conn
    ? db.prepare(`SELECT * FROM calendar_events WHERE calendar_connection_id = ? ORDER BY start ASC`).all(conn.id).map(e => ({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        allDay: !!e.all_day,
        recurrence: parseJson(e.recurrence, []),
        providerEventId: e.provider_event_id,
      }))
    : [];

  const teamRows = db.prepare(`SELECT tm.team_id FROM team_members tm WHERE tm.user_id = ?`).all(userId);
  const teamIds = teamRows.map(r => r.team_id);
  const meetings = teamIds.length
    ? db.prepare(`SELECT * FROM meetings WHERE team_id IN (${teamIds.map(() => '?').join(',')})`).all(...teamIds)
    : [];

  const prefs = db.prepare(`SELECT preferences FROM users WHERE id = ?`).get(userId);
  let preferences = {};
  try { preferences = JSON.parse((prefs && prefs.preferences) || '{}'); } catch { /* noop */ }

  // Attach expanded instances + next occurrence for recurring analysis
  const withInstances = events.map(e => {
    if (e.recurrence.length) {
      const instances = expandRecurrence(e, { count: 16 });
      return { ...e, instances, nextInstance: instances.length ? instances[0].start : null };
    }
    return { ...e, instances: [], nextInstance: null };
  });

  return { events: withInstances, meetings, preferences };
}

// GET /proactive/hygiene — meeting hygiene checkup
router.get('/hygiene', async (req, res) => {
  try {
    const { meetings } = loadContext(req.user.id);
    const hygiene = meetingHygieneScan(meetings);
    res.json({ score: hygiene.score, issues: hygiene.issues });
  } catch (error) {
    console.error('Hygiene scan error:', error);
    res.status(500).json({ error: 'Failed to run hygiene scan' });
  }
});

// GET /proactive/recurring — recurring meeting analysis
router.get('/recurring', async (req, res) => {
  try {
    const { events, meetings } = loadContext(req.user.id);
    const analysis = recurringAnalysis(events, meetings);
    res.json(analysis);
  } catch (error) {
    console.error('Recurring analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze recurring meetings' });
  }
});

// GET /proactive/focus — focus-time protection suggestions
router.get('/focus', async (req, res) => {
  try {
    const { events, preferences } = loadContext(req.user.id);
    const focus = focusTimeSuggestions(events, preferences);
    res.json(focus);
  } catch (error) {
    console.error('Focus suggestions error:', error);
    res.status(500).json({ error: 'Failed to compute focus suggestions' });
  }
});

// GET /proactive/suggestions — aggregated, prioritized feed
router.get('/suggestions', async (req, res) => {
  try {
    const { events, meetings, preferences } = loadContext(req.user.id);
    const hygiene = meetingHygieneScan(meetings);
    const recurring = recurringAnalysis(events, meetings);
    const focus = focusTimeSuggestions(events, preferences);
    const feed = buildSuggestionFeed({ hygiene, recurring, focus });
    res.json({
      feed,
      summary: {
        score: hygiene.score,
        hygieneIssues: hygiene.issues.length,
        recurringWithoutWorkspace: recurring.unlinked.length,
        focusBlocks: focus.focusBlocks.length,
        overloadedDays: focus.overloaded.length,
      },
    });
  } catch (error) {
    console.error('Suggestion feed error:', error);
    res.status(500).json({ error: 'Failed to build suggestion feed' });
  }
});

module.exports = router;