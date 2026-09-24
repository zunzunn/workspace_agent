/**
 * Specialized agents registry. Each specialist owns a domain, exposes skills,
 * and can score a candidate outcome from its own perspective (used in negotiation).
 */

const SPECIALISTS = [
  {
    id: 'scheduler',
    name: 'Scheduler',
    domain: 'scheduling',
    description: 'Finds and books meeting times, handles reschedules and cancellations.',
    skills: ['schedule_meeting', 'reschedule_meeting', 'cancel_meeting', 'check_availability'],
    matchers: ['schedule', 'reschedule', 'move', 'cancel', 'book', 'time', 'when'],
    scoreLabel: 'earliest_free_slot',
  },
  {
    id: 'coordinator',
    name: 'Coordinator',
    domain: 'coordination',
    description: 'Figures out who should attend and prepares the right people.',
    skills: ['prepare_meeting', 'check_availability', 'invite', 'attendees'],
    matchers: ['who', 'attend', 'invite', 'everyone', 'prepare', 'brief'],
    scoreLabel: 'attendee_fit',
  },
  {
    id: 'analyst',
    name: 'Analyst',
    domain: 'intelligence',
    description: 'Analyzes recurring meetings, meeting hygiene, decisions, and workloads.',
    skills: ['recurring_analysis', 'hygiene_scan', 'summarize', 'decisions'],
    matchers: ['analy', 'summary', 'decisions', 'hygiene', 'recurring', 'overload'],
    scoreLabel: 'insight_value',
  },
  {
    id: 'followup',
    name: 'Follow-Up Agent',
    domain: 'follow-up',
    description: 'Tracks action items and drafts follow-up communications.',
    skills: ['follow_up', 'draft', 'reminder', 'action_item'],
    matchers: ['follow', 'remind', 'action item', 'todo', 'chase', 'draft'],
    scoreLabel: 'accountability',
  },
  {
    id: 'focusguard',
    name: 'Focus Guard',
    domain: 'focus',
    description: 'Protects focus time and calls out overloaded days.',
    skills: ['focus_block', 'overload_protection', 'buffer'],
    matchers: ['focus', 'deep work', 'buffer', 'overload', 'protect, time'],
    scoreLabel: 'focus_preservation',
  },
];

// Route a natural-language request to the most relevant specialist (best-effort keyword match)
function routeRequest(text) {
  const lower = (text || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const s of SPECIALISTS) {
    const score = s.matchers.reduce((acc, m) => acc + (lower.includes(m) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best ? { specialist: best, confidence: Math.min(1, bestScore / 3) } : { specialist: SPECIALISTS[0], confidence: 0.2 };
}

// A specialist scores a candidate scheduling slot from its own priorities (0..1)
function scoreSlot(slot, specialist, context) {
  if (!slot) return 0;
  const startMs = new Date(slot.start).getTime();
  const nowMs = Date.now();

  switch (specialist.id) {
    case 'scheduler': {
      // prefers earlier slots, moderate penalty for late
      const hoursAway = Math.max(0, (startMs - nowMs) / 3600000);
      return Math.max(0, 1 - hoursAway / 480); // ~20 days horizon
    }
    case 'coordinator': {
      // prefers slots where most attendees are free (context.attendeesFree: array of ratios)
      const ratios = context.attendeesFreeAt ? context.attendeesFreeAt[slot.start] : null;
      return ratios && ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : 0.5;
    }
    case 'analyst': {
      // prefers slots flanked by meetings (contiguous workflow) or mid-morning
      const hour = new Date(slot.start).getUTCHours() + (context.offsetHours || 0);
      const workday = hour >= 9 && hour <= 16;
      return workday ? 0.8 : 0.4;
    }
    case 'followup': {
      // prefers slots after 9am local, leaving room for prep
      const hour = new Date(slot.start).getUTCHours() + (context.offsetHours || 0);
      return hour >= 10 ? 0.75 : 0.5;
    }
    case 'focusguard': {
      // prefers slots away from other bookings and near start of day to compress focus
      const bbs = context.busyBeforeStart || {};
      const busyBeforeCount = Array.isArray(bbs) ? bbs.length : Object.keys(bbs).length;
      return busyBeforeCount > 3 ? 0.35 : 0.85;
    }
    default:
      return 0.5;
  }
}

module.exports = {
  SPECIALISTS,
  routeRequest,
  scoreSlot,
};