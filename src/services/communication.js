/**
 * Communication outbox: build feedback/message drafts from meeting intelligence
 * and simulate delivery (swap with a real email/chat transport later).
 */

const parseJson = (s, fallback) => {
  try { return JSON.parse(s || fallback); } catch { return fallback; }
};

// Draft a follow-up email to the attendees with open action items from a meeting
function draftMeetingFollowUp(meeting, attendees, userEmail) {
  const actions = parseJson(meeting.action_items, []).filter(a => a && !a.done);
  const decisions = parseJson(meeting.decisions, []);

  const lines = [];
  lines.push(`Subject: Follow-up — ${meeting.purpose || 'meeting'}`);
  lines.push('');
  lines.push('Hi all,');
  lines.push('');
  if (decisions.length) {
    lines.push('Decisions captured:');
    decisions.forEach(d => lines.push(`- ${typeof d === 'string' ? d : d.text}`));
    lines.push('');
  }
  if (actions.length) {
    lines.push('Open action items:');
    actions.forEach(a => lines.push(`- [ ] ${a.text || a}${a.owner ? ` (owner: ${a.owner})` : ''}${a.due ? ` by ${a.due}` : ''}`));
  } else {
    lines.push('No open action items — nice and tidy. 🎉');
  }
  lines.push('');
  lines.push('-- Meeting Agent');

  return {
    to: (attendees && attendees.length ? attendees : [userEmail]).join(', '),
    body: lines.join('\n'),
  };
}

// A proactive note prompting focus-time protection for an overloaded day
function draftFocusReminder(overload) {
  return {
    subject: `Heads up: ${overload.date} is packed (${overload.busyHours}h of meetings)`,
    body: `Your calendar shows ${overload.busyHours} hours of meetings on ${overload.date}, which is over ${overload.ratio}% of your working day. Consider rescheduling one session to protect focus time.`,
  };
}

module.exports = { draftMeetingFollowUp, draftFocusReminder };