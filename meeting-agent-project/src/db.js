const Database = require('better-sqlite3');

const dbPath = process.env.MEETING_AGENT_DB || 'meeting_agent.db';
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create all tables based on the Data Model specification
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT,
    email TEXT UNIQUE,
    timezone TEXT,
    preferences TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    name TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT,
    user_id TEXT,
    role TEXT DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS calendar_connections (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    provider TEXT DEFAULT 'google',
    provider_account_id TEXT,
    scopes TEXT DEFAULT '[]',
    status TEXT DEFAULT 'connected',
    encrypted_credential_ref TEXT,
    last_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id TEXT PRIMARY KEY,
    provider_event_id TEXT,
    calendar_connection_id TEXT,
    title TEXT,
    description TEXT DEFAULT '',
    start TIMESTAMP,
    end TIMESTAMP,
    timezone TEXT,
    organizer TEXT,
    attendees TEXT DEFAULT '[]',
    recurrence TEXT DEFAULT '[]',
    all_day INTEGER DEFAULT 0,
    status TEXT DEFAULT 'confirmed',
    last_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (calendar_connection_id) REFERENCES calendar_connections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    team_id TEXT,
    calendar_event_id TEXT,
    purpose TEXT,
    agenda TEXT,
    preparation TEXT,
    notes TEXT,
    decisions TEXT DEFAULT '[]',
    action_items TEXT DEFAULT '[]',
    follow_up_state TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (calendar_event_id) REFERENCES calendar_events(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS agent_actions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    tenant_id TEXT,
    action_type TEXT,
    summary TEXT,
    risk_level TEXT DEFAULT 'medium',
    target TEXT,
    proposal JSONB DEFAULT '{}',
    affected_people TEXT DEFAULT '[]',
    approval_status TEXT DEFAULT 'pending',
    execution_status TEXT DEFAULT 'pending',
    verification_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS user_preferences (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    key TEXT,
    value TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, key)
  );

  CREATE TABLE IF NOT EXISTS user_credentials (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    provider TEXT DEFAULT 'google',
    provider_account_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    scopes TEXT DEFAULT '[]',
    status TEXT DEFAULT 'connected',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS negotiations (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    request TEXT,
    transcript TEXT DEFAULT '[]',
    outcome TEXT,
    slot TEXT,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS communications (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    kind TEXT,
    to_address TEXT,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'draft',
    meeting_id TEXT,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE SET NULL
  );
`);

console.log('Database tables created successfully');

// Lightweight migrations for existing databases
const calCols = db.prepare(`PRAGMA table_info(calendar_events)`).all().map(c => c.name);
if (!calCols.includes('description')) {
  db.exec(`ALTER TABLE calendar_events ADD COLUMN description TEXT DEFAULT ''`);
}
if (!calCols.includes('all_day')) {
  db.exec(`ALTER TABLE calendar_events ADD COLUMN all_day INTEGER DEFAULT 0`);
}
if (!calCols.includes('status')) {
  db.exec(`ALTER TABLE calendar_events ADD COLUMN status TEXT DEFAULT 'confirmed'`);
}

const actCols = db.prepare(`PRAGMA table_info(agent_actions)`).all().map(c => c.name);
if (!actCols.includes('summary')) {
  db.exec(`ALTER TABLE agent_actions ADD COLUMN summary TEXT`);
}
if (!actCols.includes('risk_level')) {
  db.exec(`ALTER TABLE agent_actions ADD COLUMN risk_level TEXT DEFAULT 'medium'`);
}
if (!actCols.includes('affected_people')) {
  db.exec(`ALTER TABLE agent_actions ADD COLUMN affected_people TEXT DEFAULT '[]'`);
}

// Export helper functions
exports.db = db;

exports.insertUser = function(userData) {
  const stmt = db.prepare(
    `INSERT INTO users (id, tenant_id, name, email, timezone, preferences) VALUES (?, ?, ?, ?, ?, ?)`
  );
  const id = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  stmt.run(id, userData.tenant_id, userData.name, userData.email, userData.timezone, JSON.stringify(userData.preferences || {}));
  return id;
};

exports.findUserByEmail = function(email) {
  const stmt = db.prepare(`SELECT * FROM users WHERE email = ?`);
  return stmt.get(email);
};