const express = require('express');
const authRouter = require('./routes/auth.js');
const calendarRouter = require('./routes/calendar.js');
const meetingsRouter = require('./routes/meetings.js');
const agentRouter = require('./routes/agent.js');
const dashboardRouter = require('./routes/dashboard.js');
const inboxRouter = require('./routes/inbox.js');
const teamsRouter = require('./routes/teams.js');
const peopleRouter = require('./routes/people.js');
const proactiveRouter = require('./routes/proactive.js');
const bodyParser = require('body-parser');
const MeetingOrchestrator = require('./services/orchestrator.js');
const { db } = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Resolve the authenticated user (demo user seeded by src/seed.js)
app.use((req, res, next) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = 'demo_user'`).get();
  if (user) {
    req.user = {
      id: user.id,
      tenant_id: user.tenant_id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      preferences: JSON.parse(user.preferences || '{}'),
    };
  } else {
    req.user = {
      id: 'demo_user',
      tenant_id: 'default-tenant',
      name: 'Demo User',
      email: 'demo@meetingagent.test',
      timezone: 'UTC',
      preferences: {},
    };
  }
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Static frontend
app.use(express.static('public'));

app.use('/auth', authRouter);
app.use('/calendar', calendarRouter);
app.use('/meetings', meetingsRouter);
app.use('/agent', agentRouter);
app.use('/dashboard', dashboardRouter);
app.use('/inbox', inboxRouter);
app.use('/teams', teamsRouter);
app.use('/people', peopleRouter);
app.use('/proactive', proactiveRouter);

// Agent request endpoint - the core AI agent loop
app.post('/agent/request', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Request text is required' });
    }
    
    const orchestrator = new MeetingOrchestrator(req.user);
    const results = orchestrator.processRequest(text);
    
    // Generate report with cleaned data (no circular references)
    const report = orchestrator.report(results);
    
    res.json({
      success: true,
      results,
      report,
    });
  } catch (error) {
    console.error('Agent request error:', error);
    res.status(500).json({ error: 'Failed to process agent request' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'Meeting Agent API' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Meeting Agent API running on port ${PORT}`);
  });
}

module.exports = app;