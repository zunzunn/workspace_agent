const { OAuth2Client } = require('google-auth-library');
const { insertUser } = require('../db.js');

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

exports.startAuth = async function(req, res) {
  const state = Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    state,
  });
  res.json({ authUrl, state });
};

exports.callbackAuth = async function(req, res) {
  const code = req.query.code;
  const state = req.query.state;

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const email = tokens.email || `user_${Date.now()}@demo.test`;
    let user = await insertUser({
      tenant_id: 'default-tenant',
      name: tokens.given_name || 'User',
      email,
      timezone: 'UTC',
    });

    const credId = `cred_${Date.now()}`;
    // Use db directly for credential insertion since we need the db object
    const Database = require('../db.js');
    const db = new Database('meeting_agent.db');
    db.pragma('journal_mode = WAL');
    
    await db.prepare(`
      INSERT OR REPLACE INTO user_credentials (id, user_id, provider, provider_account_id, access_token, refresh_token, expires_at, scopes, status)
      VALUES (?, ?, 'google', ?, ?, ?, ?, '[]', 'connected')
    `).run(credId, user.id, tokens.access_token, tokens.refresh_token, tokens.expiry, JSON.stringify(['https://www.googleapis.com/auth/calendar.readonly']));

    await db.prepare(`UPDATE calendar_connections SET last_synced_at = NOW() WHERE id = ?`).run(credId);

    res.json({ 
      message: 'Google Calendar connected successfully', 
      userId: user.id,
      email: user.email 
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};