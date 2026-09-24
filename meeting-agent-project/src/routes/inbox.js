const { Router } = require('express');
const { db } = require('../db.js');

const router = Router();

function parseJson(s, fallback) {
  try { return JSON.parse(s || 'null'); } catch { return fallback; }
}

// GET /inbox — pending approvals + notifications
router.get('/', async (req, res) => {
  try {
    const pending = db.prepare(`
      SELECT * FROM agent_actions
      WHERE user_id = ? AND approval_status = 'pending'
      ORDER BY created_at DESC
      LIMIT 50
    `).all(req.user.id);

    const completed = db.prepare(`
      SELECT * FROM agent_actions
      WHERE user_id = ? AND (approval_status = 'approved' OR approval_status = 'rejected' OR approval_status = 'pre-approved')
      ORDER BY completed_at DESC
      LIMIT 20
    `).all(req.user.id);

    const items = pending.map(a => ({
      id: a.id,
      type: 'approval',
      title: a.summary,
      riskLevel: a.risk_level,
      actionType: a.action_type,
      proposal: parseJson(a.proposal, {}),
      createdAt: a.created_at,
      status: a.approval_status,
    })).concat(completed.map(a => ({
      id: a.id,
      type: 'activity',
      title: a.summary,
      riskLevel: a.risk_level,
      actionType: a.action_type,
      status: a.approval_status,
      execution: a.execution_status,
      verification: a.verification_status,
      createdAt: a.completed_at || a.created_at,
    })));

    res.json({
      approvals: items.filter(i => i.type === 'approval'),
      activity: items.filter(i => i.type === 'activity'),
      unread: items.filter(i => i.type === 'approval').length,
    });
  } catch (error) {
    console.error('Inbox error:', error);
    res.status(500).json({ error: 'Failed to load inbox' });
  }
});

// POST /inbox/:id/approve — approve a pending agent action
router.post('/:id/approve', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM agent_actions WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Item not found' });
    if (row.approval_status !== 'pending') {
      return res.status(409).json({ error: `Already ${row.approval_status}` });
    }
    db.prepare(`UPDATE agent_actions SET approval_status = 'approved', completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(row.id);
    res.json({ ok: true, status: 'approved' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve' });
  }
});

// POST /inbox/:id/dismiss — reject/dismiss a pending agent action
router.post('/:id/dismiss', async (req, res) => {
  try {
    const row = db.prepare(`SELECT * FROM agent_actions WHERE id = ? AND user_id = ?`)
      .get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Item not found' });
    if (row.approval_status !== 'pending') {
      return res.status(409).json({ error: `Already ${row.approval_status}` });
    }
    db.prepare(`UPDATE agent_actions SET approval_status = 'rejected', execution_status = 'aborted', completed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(row.id);
    res.json({ ok: true, status: 'rejected' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to dismiss' });
  }
});

module.exports = router;