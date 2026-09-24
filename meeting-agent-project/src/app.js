const express = require('express');
const authRouter = require('./routes/auth.js');
const calendarRouter = require('./routes/calendar.js');
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

app.use('/auth', authRouter);
app.use('/calendar', calendarRouter);

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

app.listen(PORT, () => {
  console.log(`Meeting Agent API running on port ${PORT}`);
});