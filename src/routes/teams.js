const { Router } = require('express');
const { db } = require('../db.js');

const router = Router();

const parseJson = (s, fallback) => {
  try { return JSON.parse(s || fallback); } catch { return fallback; }
};

// GET /teams — teams the user belongs to
router.get('/', async (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT t.*, (SELECT COUNT(*) FROM team_members tm2 WHERE tm2.team_id = t.id) AS member_count
      FROM teams t
      JOIN team_members tm ON tm.team_id = t.id
      WHERE tm.user_id = ?
    `).all(req.user.id);
    res.json({ teams: rows });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

// POST /teams — create a team
router.post('/', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const id = `team_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    db.prepare(`INSERT INTO teams (id, tenant_id, name, description) VALUES (?, ?, ?, ?)`)
      .run(id, req.user.tenant_id, name, description || '');
    db.prepare(`INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, 'admin')`)
      .run(`tm_${Date.now()}`, id, req.user.id);
    res.status(201).json({ team: db.prepare(`SELECT * FROM teams WHERE id = ?`).get(id) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create team' });
  }
});

// GET /teams/:id — team detail incl. members + meetings
router.get('/:id', async (req, res) => {
  try {
    const team = db.prepare(`SELECT * FROM teams WHERE id = ?`).get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    const members = db.prepare(`
      SELECT u.id, u.name, u.email, tm.role FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
    `).all(team.id);
    const meetings = db.prepare(`
      SELECT id, purpose, follow_up_state, created_at FROM meetings WHERE team_id = ?
    `).all(team.id);
    res.json({ team: { ...team, member_count: members.length }, members, meetings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch team' });
  }
});

// GET /teams/:id/members
router.get('/:id/members', async (req, res) => {
  try {
    const members = db.prepare(`
      SELECT u.id, u.name, u.email, tm.role FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.team_id = ?
    `).all(req.params.id);
    res.json({ members });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// GET /teams/:id/context — shared team intelligence (people, ongoing work)
router.get('/:id/context', async (req, res) => {
  try {
    const team = db.prepare(`SELECT * FROM teams WHERE id = ?`).get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const members = db.prepare(`
      SELECT u.name, u.email, u.timezone FROM team_members tm
      JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ?
    `).all(team.id);

    const workingMeetings = db.prepare(`
      SELECT purpose, decisions, action_items FROM meetings
      WHERE team_id = ? AND follow_up_state = 'active'
    `).all(team.id);

    const context = {
      teamName: team.name,
      description: team.description,
      members,
      currentFocus: workingMeetings.map(m => m.purpose).slice(0, 6),
      decisions: workingMeetings.flatMap(m => parseJson(m.decisions, [])).slice(0, 10),
      openActions: workingMeetings.flatMap(m => parseJson(m.action_items, [])).filter(a => a && !a.done).slice(0, 10),
    };

    res.json({ context });
  } catch (error) {
    res.status(500).json({ error: 'Failed to build team context' });
  }
});

// POST /teams/:id/members — add a member to a team (by email; creates the user if needed)
router.post('/:id/members', async (req, res) => {
  try {
    const team = db.prepare(`SELECT * FROM teams WHERE id = ?`).get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const { email, name, role } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email);
    if (!user) {
      const uid = `user_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      db.prepare(`INSERT INTO users (id, tenant_id, name, email, timezone, preferences) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(uid, team.tenant_id, name || email, email, 'UTC', '{}');
      user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(uid);
    }

    const existing = db.prepare(`SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`).get(team.id, user.id);
    if (!existing) {
      db.prepare(`INSERT INTO team_members (id, team_id, user_id, role) VALUES (?, ?, ?, ?)`)
        .run(`tm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, team.id, user.id, role || 'member');
    }

    res.status(201).json({ member: { id: user.id, name: user.name, email: user.email, role: role || 'member' } });
  } catch (error) {
    console.error('Add team member error:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// DELETE /teams/:id/members/:userId — remove a member from a team
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const team = db.prepare(`SELECT * FROM teams WHERE id = ?`).get(req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const membership = db.prepare(`SELECT * FROM team_members WHERE team_id = ? AND user_id = ?`)
      .get(team.id, req.params.userId);
    if (!membership) return res.status(404).json({ error: 'Member not found in team' });

    db.prepare(`DELETE FROM team_members WHERE id = ?`).run(membership.id);
    res.json({ message: 'Member removed from team' });
  } catch (error) {
    console.error('Remove team member error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

module.exports = router;