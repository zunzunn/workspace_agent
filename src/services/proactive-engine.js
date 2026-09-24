/**
 * Proactive agent engine: meeting hygiene, recurring-meeting analysis, and focus-time protection.
 * Deterministic rules for the demo; each function returns LLM-ready structured suggestions.
 */

const parseJson = (s, fallback) => {
  try { return JSON.parse(s || '[]'); } catch { return fallback; }
};

// Meeting hygiene: audit each meeting workspace for gaps in preparation/notes/decisions/actions
function meetingHygieneScan(meetings) {
  const issues = [];
  let score = 100;
  let weighted = 0;

  for (const m of meetings) {
    const agenda = parseJson(m.agenda, []);
    const decisions = parseJson(m.decisions, []);
    const actions = parseJson(m.action_items, []);
    const hasPreparation = !!(m.preparation && m.preparation !== '[]');
    const hasNotes = !!m.notes;

    if (agenda.length === 0) {
      issues.push({ severity: 'high', kind: 'missing_agenda', meeting: m.purpose, suggestion: 'Add an agenda before the meeting so attendees can prepare.' });
      score -= 5;
    }
    if (decisions.length === 0) {
      issues.push({ severity: 'low', kind: 'no_decisions', meeting: m.purpose, suggestion: 'Record decisions after the meeting so outcomes are preserved.' });
      score -= 2;
    }
    if (actions.length === 0) {
      issues.push({ severity: 'medium', kind: 'no_action_items', meeting: m.purpose, suggestion: 'Capture action items with owners and due dates to keep work moving.' });
      score -= 4;
    }
    if (!hasPreparation) {
      issues.push({ severity: 'medium', kind: 'unprepared', meeting: m.purpose, suggestion: 'Generate a preparation brief from previous meetings.' });
      score -= 4;
    }
    if (!hasNotes) {
      issues.push({ severity: 'low', kind: 'no_notes', meeting: m.purpose, suggestion: 'Add notes so the agent can track follow-ups.' });
      score -= 2;
    }
    weighted++;
  }

  // Normalize: score reflects average meeting richness
  if (weighted > 1) score = Math.max(0, Math.round(100 - (100 - score) / weighted));
  if (meetings.length === 0) score = null;

  return { score, issues: issues.slice(0, 20) };
}

// Recurring analysis: group recurring calendar events and flag ones with no meeting workspace
function recurringAnalysis(events, meetings) {
  const recurring = events.filter(e => (e.recurrence && e.recurrence.length));
  const linkedEventIds = new Set(meetings.map(m => m.calendar_event_id).filter(Boolean));

  const patterns = recurring.map(e => {
    const title = e.title || '(untitled)';
    const rule = (e.recurrence || []).find(r => r.startsWith('RRULE:')) || '';
    const rrule = rule.replace(/^RRULE:/, '');
    const freq = (rrule.match(/FREQ=(\w+)/) || [])[1] || 'unknown';
    const byDay = (rrule.match(/BYDAY=([\w,]+)/) || [])[1] || '';
    const weeklyDays = byDay ? byDay.replace(/,/g, ' ') : null;
    return {
      eventId: e.id,
      title,
      freq: freq.toLowerCase(),
      days: weeklyDays ? weeklyDays.split(' ').map(d => d.slice(-2)).join(', ') : null,
      instances: e.instances ? e.instances.length : 0,
      linkedWorkspace: linkedEventIds.has(e.id),
      next: e.nextInstance ? e.nextInstance : null,
    };
  });

  return {
    recurring: patterns,
    unlinked: patterns.filter(p => !p.linkedWorkspace).map(p => ({
      severity: 'medium',
      kind: 'recurring_without_workspace',
      meeting: p.title,
      suggestion: `Create a meeting workspace for "${p.title}" to track decisions and actions across occurrences.`,
    })),
  };
}

// Focus-time protection: suggest focus blocks from gaps and flag overloaded days
function focusTimeSuggestions(events, preferences = {}, daysAhead = 7) {
  const bufferMin = preferences.buffer || 15;
  const minBlock = 90; // focus block must be >= 90 min
  const earliest = preferences.earliestTime || '09:00';
  const latest = preferences.latestTime || '17:00';
  const [eh, em] = earliest.split(':').map(Number);
  const [lh, lm] = latest.split(':').map(Number);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const suggestions = [];
  const overloaded = [];

  for (let d = 0; d < daysAhead; d++) {
    const ws = new Date(dayStart);
    ws.setDate(ws.getDate() + d);
    ws.setHours(eh, em, 0, 0);
    const we = new Date(dayStart);
    we.setDate(we.getDate() + d);
    we.setHours(lh, lm, 0, 0);

    const dayWindow = [ws.getTime(), we.getTime()];
    const busy = events
      .filter(e => !e.allDay && new Date(e.start) < new Date(we) && new Date(e.end) > new Date(ws))
      .map(e => ([new Date(e.start).getTime(), new Date(e.end).getTime()]))
      .sort((a, b) => a[0] - b[0]);

    // Merge busy blocks
    const merged = [];
    for (const [s, en] of busy) {
      if (merged.length && s - merged[merged.length - 1][1] <= 0) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], en);
      } else {
        merged.push([Math.max(s, dayWindow[0]), Math.min(en, dayWindow[1])]);
      }
    }

    // Find free gaps
    let cursor = dayWindow[0];
    for (const [s, en] of merged) {
      if (s - cursor >= minBlock * 60000) {
        suggestions.push({
          date: new Date(cursor).toISOString().slice(0, 10),
          start: new Date(cursor).toISOString(),
          end: new Date(s).toISOString(),
          durationMin: Math.round((s - cursor) / 60000),
          kind: 'focus_block_suggestion',
          severity: 'low',
          suggestion: `You have a ${Math.round((s - cursor) / 60000)}-minute open window — protect it as focus time.`,
        });
      }
      cursor = Math.max(cursor, en);
    }
    if (we.getTime() - cursor >= minBlock * 60000) {
      suggestions.push({
        date: new Date(cursor).toISOString().slice(0, 10),
        start: new Date(cursor).toISOString(),
        end: new Date(we).toISOString(),
        durationMin: Math.round((we - cursor) / 60000),
        kind: 'focus_block_suggestion',
        severity: 'low',
        suggestion: `You have a ${Math.round((we - cursor) / 60000)}-minute open window — protect it as focus time.`,
      });
    }

    // Overload detection
    const workingMs = dayWindow[1] - dayWindow[0];
    const busyMs = busy.reduce((acc, b) => acc + (b[1] - b[0]), 0);
    const ratio = workingMs > 0 ? busyMs / workingMs : 0;
    if (ratio > 0.7 && busy.length >= 4) {
      overloaded.push({
        date: ws.toISOString().slice(0, 10),
        busyHours: Math.round(busyMs / 3600000),
        ratio: Math.round(ratio * 100),
        suggestion: 'This day is heavily booked — consider rescheduling one meeting or shortening sessions.',
        severity: 'high',
        kind: 'overloaded_day',
      });
    }
  }

  return { focusBlocks: suggestions.slice(0, 10), overloaded: overloaded.slice(0, 5) };
}

// Aggregate, prioritized suggestion stream (LLM-ready)
function buildSuggestionFeed({ hygiene, recurring, focus }) {
  const feed = [
    ...(recurring.unlinked || []),
    ...(hygiene.issues || []),
    ...(focus.overloaded || []),
    ...(focus.focusBlocks || []),
  ];
  const rank = { high: 0, medium: 1, low: 2 };
  return feed
    .sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9))
    .slice(0, 30);
}

module.exports = {
  meetingHygieneScan,
  recurringAnalysis,
  focusTimeSuggestions,
  buildSuggestionFeed,
};