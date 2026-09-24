/**
 * Meeting intelligence: preparation briefs, decision extraction, and action-item generation.
 * Deterministic for the demo; each entry point is structured so an LLM can be swapped in.
 */

function prepareMeetingBrief(context, priorMeetings) {
  const { purpose, agenda, actionItems } = context;

  // Objectives: from purpose text
  const objectives = purpose
    ? purpose.split(/[.,;]/).map(s => s.trim()).filter(Boolean).slice(0, 3)
    : ['Review current status', 'Align on next steps'];

  // Suggested discussion points: from the agenda plus open follow-up items
  const openActions = (actionItems || []).filter(a => !a.done);
  const discussionPoints = [
    ...(agenda || []),
    ...openActions.map(a => `Follow up: ${a.text}`),
  ];

  // Digest of prior meetings: carry forward unresolved items
  const carryForward = [];
  for (const prior of priorMeetings || []) {
    for (const item of prior.actionItems || []) {
      if (item && !item.done) {
        carryForward.push(`Unfinished from "${prior.purpose || 'prior meeting'}": ${item.text || item}`);
      }
    }
  }

  return {
    objectives,
    discussionPoints: discussionPoints.slice(0, 8),
    carryForward: carryForward.slice(0, 5),
    recommendedPreparation: [
      ...(priorMeetings && priorMeetings.length ? ['Review notes from previous related meetings'] : []),
      'Review the agenda and add context items',
      'Confirm attendee readiness',
    ],
    estimatedOutcome: 'Decisions recorded, action items assigned with owners and due dates',
  };
}

function extractDecisionsFromNotes(notes) {
  if (!notes) return { decisions: [] };

  const lines = notes.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const decisions = [];

  for (const line of lines) {
    // Patterns: "Decision:", "We decided", "DECISION"
    if (/^decision[:\.]/i.test(line) || /we decided/i.test(line) || /^decided/i.test(line)) {
      decisions.push(line.replace(/^decision[:\.]\s*/i, '').trim());
    }
  }

  // If none matched, phrase the most sentence-like line as a decision candidate
  if (decisions.length === 0) {
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), '');
    if (longest) decisions.push(longest);
  }

  return { decisions };
}

function createActionItemsFromNotes(notes, defaultOwner) {
  if (!notes) return [];

  const lines = notes.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const actions = [];

  for (const line of lines) {
    const match = line.match(/^(?:action item|todo|action|assign|owner|to be done by|follow up)[\s:]*/i);
    if (match) {
      const text = line.replace(match[0], '').trim();
      if (text) {
        actions.push({
          id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          text,
          owner: defaultOwner || '',
          due: null,
          done: false,
        });
      }
    }
  }

  return actions;
}

module.exports = {
  prepareMeetingBrief,
  extractDecisionsFromNotes,
  createActionItemsFromNotes,
};