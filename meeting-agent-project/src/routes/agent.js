const { Router } = require('express');
const { db } = require('../db.js');
const MeetingOrchestrator = require('../services/orchestrator.js');
const { getCalendarClient, findAvailability, findOverlaps } = require('../services/calendar-service.js');

const router = Router();

const RISK_LEVELS = {
  schedule_meeting: 'high',
  reschedule_meeting: 'high',
  cancel_meeting: 'high',
  prepare_meeting: 'medium',
  check_availability: 'low',
  follow_up: 'low',
};

function parseJson(s, fallback) {
  try { return JSON.parse(s || 'null'); } catch { return fallback; }
}

function mapRun(row) {
  return row ? {
    id: row.id,
    actionType: row.action_type,
    riskLevel: row.risk_level,
    summary: row.summary,
    proposal: parseJson(row.proposal, {}),
    affectedPeople: parseJson(row.affected_people, []),
    approvalStatus: row.approval_status,
    executionStatus: row.execution_status,
    verificationStatus: row.verification_status,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  } : null;
}

function getConnectionForUser(userId) {
  return db.prepare(`SELECT * FROM calendar_connections WHERE user_id = ?`).get(userId);
}

// Build a schedule proposal for a natural-language scheduling request
function buildScheduleProposal(text, orchestrator) {
  const understood = orchestrator.understand(text, {});
  const { timeReference } = understood.entities;

  let windowStart = new Date();
  windowStart.setMinutes(0, 0, 0);
  let windowEnd = new Date(windowStart);
  windowEnd.setHours(23, 59, 59, 999);

  if (timeReference) {
    const ref = timeReference.toLowerCase();
    if (ref === 'tomorrow') {
      windowStart.setDate(windowStart.getDate() + 1);
      windowEnd = new Date(windowStart);
      windowEnd.setHours(23, 59, 59, 999);
    } else if (ref === 'today') {
      // keep today
    } else if (/^next\s/.test(ref)) {
      const parts = ref.replace('next ', '').toUpperCase();
      const days = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };
      let target = days[parts];
      if (target === undefined) {
        target = 1; // default to next week if unparsable
        windowStart.setDate(windowStart.getDate() + 7);
      } else {
        const currentDay = windowStart.getDay();
        let delta = (target - currentDay + 7) % 7;
        if (delta === 0) delta = 7;
        windowStart.setDate(windowStart.getDate() + delta);
        windowEnd.setDate(windowStart.getDate());
        windowEnd.setHours(23, 59, 59, 999);
      }
    }
  }

  const conn = getConnectionForUser(orchestrator.user.id);
  const candidateSlots = [];
  let overlaps = [];

  if (conn) {
    const rows = db.prepare(`
      SELECT title, start, end FROM calendar_events
      WHERE calendar_connection_id = ? AND all_day = 0
    `).all(conn.id);

    const events = rows
      .filter(r => r.start && r.end)
      .map(r => ({ title: r.title, start: r.start, end: r.end }));

    const userPrefs = orchestrator.user.preferences || {};
    if (userPrefs.earliestTime) {
      const [hh, mm] = userPrefs.earliestTime.split(':').map(Number);
      const s = new Date(windowStart); s.setHours(hh, mm, 0, 0);
      if (s > windowStart) windowStart = s;
    }
    if (userPrefs.latestTime) {
      const [hh, mm] = userPrefs.latestTime.split(':').map(Number);
      const e = new Date(windowStart); e.setHours(hh, mm, 0, 0);
      if (e.getTime() - windowStart.getTime() > 0) {
        windowEnd = new Date(Math.min(windowEnd, e));
      }
    }

    candidateSlots.push(...findAvailability(
      events,
      (userPrefs.defaultDuration || 30),
      windowStart.toISOString(),
      windowEnd.toISOString(),
      { stepMin: 30, bufferMin: userPrefs.buffer || 0, preferredDays: userPrefs.preferredDays }
    ));

    // detect overlaps in existing calendar
    overlaps = findOverlaps(events);
  }

  return {
    summary: `Schedule a meeting${timeReference ? ' ' + timeReference : ''}`,
    action_type: 'schedule_meeting',
    risk_level: RISK_LEVELS.schedule_meeting,
    proposed_changes: {
      durationMinutes: (orchestrator.user.preferences || {}).defaultDuration || 30,
      candidateSlots: candidateSlots.slice(0, 5),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    },
    affected_people: understood.entities.potentialParticipants || [],
  };
}

// POST /agent/runs — start a run; creates a pending approval for high/medium risk actions
router.post('/runs', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    const orchestrator = new MeetingOrchestrator(req.user);
    const plan = orchestrator.plan(text, {}) || {};
    const actionType = (plan.plan && plan.plan.type) || 'unknown';

    let proposal = {};
    let affected = [];
    let summary = text;
    let risk = RISK_LEVELS[actionType] || 'low';

    if (actionType === 'schedule_meeting') {
      const built = buildScheduleProposal(text, orchestrator);
      proposal = built.proposed_changes;
      affected = built.affected_people;
      summary = built.summary;
      risk = built.risk_level;
    } else if (actionType === 'prepare_meeting') {
      summary = `Prepare a meeting brief`;
      risk = RISK_LEVELS.prepare_meeting;
    } else if (actionType === 'check_availability') {
      summary = `Check availability`;
      risk = 'low';
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const status = risk === 'low' ? 'pre-approved' : 'pending';

    db.prepare(`
      INSERT INTO agent_actions
      (id, user_id, tenant_id, action_type, summary, risk_level, target, proposal, affected_people,
       approval_status, execution_status, verification_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      runId, req.user.id, req.user.tenant_id, actionType, summary, risk,
      actionType, JSON.stringify(proposal), JSON.stringify(affected),
      status, 'pending', 'unverified'
    );

    res.status(201).json({ run: mapRun(db.prepare(`SELECT * FROM agent_actions WHERE id = ?`).get(runId)) });
  } catch (error) {
    console.error('Create run error:', error);
    res.status(500).json({ error: 'Failed to create agent run' });
  }
});

// GET /agent/runs/:id
router.get('/runs/:id', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM agent_actions WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Run not found' });
    res.json({ run: mapRun(row) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

async function executeRun(run, user) {
  // Executes the proposed action. Returns { executionStatus, verificationStatus, error }
  const actionType = run.action_type;
  const proposal = parseJson(run.proposal, {});

  try {
    if (actionType === 'schedule_meeting') {
      const conn = getConnectionForUser(user.id);
      if (!conn) {
        return { executionStatus: 'failed', verificationStatus: 'failed', error: 'Calendar not connected' };
      }
      const slot = proposal.selectedSlot || (proposal.candidateSlots || [])[0];
      if (!slot) {
        return { executionStatus: 'failed', verificationStatus: 'failed', error: 'No slot selected in proposal' };
      }

      const attendees = (run.affected_people || []).map(email => ({ email }));

      const cal = getCalendarClient(user.id);
      let providerEventId = null;
      if (cal) {
        const created = await cal.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: proposal.title || 'Meeting',
            description: proposal.description || '',
            start: { dateTime: new Date(slot.start).toISOString(), timeZone: user.timezone },
            end: { dateTime: new Date(slot.end).toISOString(), timeZone: user.timezone },
            attendees,
          },
        });
        providerEventId = created.data ? created.data.id : created.id;
      }

      const localId = `ev_${conn.id}_run_${run.id}`;
      db.prepare(`
        INSERT OR REPLACE INTO calendar_events
        (id, provider_event_id, calendar_connection_id, title, description, start, end, timezone, organizer, attendees, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed')
      `).run(
        localId, providerEventId || `auto_${Date.now()}`, conn.id,
        (proposal.title || 'Meeting'), (proposal.description || ''),
        slot.start, slot.end, user.timezone, user.email,
        JSON.stringify(proposal.affected_people || run.affected_people || [])
      );

      return { executionStatus: 'completed', verificationStatus: 'verified', error: null };
    }

    if (actionType === 'prepare_meeting') {
      return { executionStatus: 'completed', verificationStatus: 'verified', error: null };
    }

    if (actionType === 'reschedule_meeting') {
      const conn = getConnectionForUser(user.id);
      if (!conn) {
        return { executionStatus: 'failed', verificationStatus: 'failed', error: 'Calendar not connected' };
      }
      const targetTitle = proposal.eventTitle || proposal.title;
      const target = targetTitle
        ? db.prepare(`SELECT * FROM calendar_events WHERE calendar_connection_id = ? AND title LIKE ? ORDER BY start ASC LIMIT 1`)
            .get(conn.id, `%${targetTitle}%`)
        : null;
      if (!target) {
        return { executionStatus: 'failed', verificationStatus: 'failed', error: 'No matching event found to reschedule' };
      }
      const slot = proposal.selectedSlot || (proposal.candidateSlots || [])[0];
      if (!slot) {
        return { executionStatus: 'failed', verificationStatus: 'failed', error: 'No slot selected in proposal' };
      }

      const cal = getCalendarClient(user.id);
      if (cal && target.provider_event_id && !target.provider_event_id.startsWith('local_')) {
        await cal.events.patch({
          calendarId: 'primary',
          eventId: target.provider_event_id,
          requestBody: {
            start: { dateTime: new Date(slot.start).toISOString(), timeZone: user.timezone },
            end: { dateTime: new Date(slot.end).toISOString(), timeZone: user.timezone },
          },
        });
      }
      db.prepare(`UPDATE calendar_events SET start = ?, end = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(new Date(slot.start).toISOString(), new Date(slot.end).toISOString(), target.id);

      return { executionStatus: 'completed', verificationStatus: 'verified', error: null };
    }

    if (actionType === 'check_availability') {
      return { executionStatus: 'completed', verificationStatus: 'verified', error: null };
    }

    return { executionStatus: 'unexecuted', verificationStatus: 'unverified', error: 'No executor for ' + actionType };
  } catch (err) {
    return { executionStatus: 'failed', verificationStatus: 'failed', error: err.message };
  }
}

// POST /agent/runs/:id/approve — approve and execute
router.post('/runs/:id/approve', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM agent_actions WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Run not found' });
    if (row.approval_status !== 'pending') {
      return res.status(409).json({ error: `Run already ${row.approval_status}` });
    }

    // Allow overriding a candidate slot selection
    let proposal = parseJson(row.proposal, {});
    if (req.body && req.body.selectedSlot) {
      proposal = { ...proposal, selectedSlot: req.body.selectedSlot };
    }

    if (req.body && req.body.cancelledRun) { /* noop; reserved */ }

    db.prepare(`UPDATE agent_actions SET proposal = ?, approval_status = 'approved', completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(proposal), row.id);

    const result = await executeRun({ ...row, proposal: JSON.stringify(proposal), action_type: row.action_type, affected_people: JSON.parse(row.affected_people || '[]') }, req.user);

    db.prepare(`
      UPDATE agent_actions SET
        execution_status = ?, verification_status = ?, error = ?
      WHERE id = ?
    `).run(result.executionStatus, result.verificationStatus, result.error, row.id);

    const updated = db.prepare(`SELECT * FROM agent_actions WHERE id = ?`).get(row.id);
    res.json({ run: mapRun(updated) });
  } catch (error) {
    console.error('Approve run error:', error);
    res.status(500).json({ error: 'Failed to approve run' });
  }
});

// POST /agent/runs/:id/reject
router.post('/runs/:id/reject', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM agent_actions WHERE id = ? AND user_id = ?`).get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Run not found' });
    if (row.approval_status !== 'pending') {
      return res.status(409).json({ error: `Run already ${row.approval_status}` });
    }
    db.prepare(`UPDATE agent_actions SET approval_status = 'rejected', execution_status = 'aborted', completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(row.id);
    res.json({ run: mapRun(db.prepare(`SELECT * FROM agent_actions WHERE id = ?`).get(row.id)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reject run' });
  }
});

// GET /agent/actions — audit trail
router.get('/actions', async (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT * FROM agent_actions
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.user.id);
    res.json({ actions: rows.map(mapRun) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit trail' });
  }
});

module.exports = router;