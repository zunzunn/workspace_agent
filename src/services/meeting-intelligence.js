/**
 * Meeting intelligence: preparation briefs, decision extraction, and action-item generation.
 * Deterministic for the demo; each entry point optionally upgrades to an LLM and
 * falls back to the deterministic path when no LLM is configured or the call fails.
 */

const { generateJson, isLLMConfigured } = require('./llm.js');

async function prepareMeetingBrief(context, priorMeetings) {
  const { purpose, agenda, actionItems } = context;

  if (isLLMConfigured()) {
    const llm = await generateJson({
      system: 'You are a meeting-coach specialist. Fill gaps in a preparation brief with concrete, specific suggestions drawn ONLY from the provided meeting context.',
      prompt: `Build a preparation brief for a meeting.
Purpose: "${purpose}"
Agenda: ${JSON.stringify(agenda || [])}
Open action items: ${JSON.stringify((actionItems || []).filter(a => !a.done))}
Prior meetings: ${JSON.stringify((priorMeetings || []).slice(0, 3).map(p => ({ purpose: p.purpose, decisions: p.decisions, actionItems: p.actionItems })))}

Return JSON:
{"objectives":["..."],"discussionPoints":["..."],"carryForward":["..."],"recommendedPreparation":["..."],"estimatedOutcome":"..."}`,
      fallback: null,
    });
    if (llm && Array.isArray(llm.objectives) && Array.isArray(llm.discussionPoints) && (
      llm.objectives.length || llm.discussionPoints.length || llm.carryForward?.length
    )) {
      return {
        objectives: llm.objectives.slice(0, 5),
        discussionPoints: (llm.discussionPoints || []).slice(0, 8),
        carryForward: (llm.carryForward || []).slice(0, 5),
        recommendedPreparation: (llm.recommendedPreparation || []).slice(0, 5),
        estimatedOutcome: llm.estimatedOutcome || 'Decisions recorded, action items assigned',
        generatedBy: 'llm',
      };
    }
  }

  // Deterministic fallback
  const objectives = purpose
    ? purpose.split(/[.,;]/).map(s => s.trim()).filter(Boolean).slice(0, 3)
    : ['Review current status', 'Align on next steps'];

  const openActions = (actionItems || []).filter(a => !a.done);
  const discussionPoints = [
    ...(agenda || []),
    ...openActions.map(a => `Follow up: ${a.text}`),
  ];

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
    generatedBy: 'heuristic',
  };
}

async function extractDecisionsFromNotes(notes) {
  if (!notes) return { decisions: [] };

  if (isLLMConfigured()) {
    const llm = await generateJson({
      system: 'You extract decisions from meeting notes. Preserve meaning and one decision per entry.',
      prompt: `Meeting notes:
---
${notes}
---
Return JSON: {"decisions":["decision text","..."]}\nReturn [] if nothing is a real decision.`,
      fallback: null,
    });
    if (llm && Array.isArray(llm.decisions)) {
      return { decisions: llm.decisions.map(d => String(d).trim()).filter(Boolean) };
    }
  }

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

async function createActionItemsFromNotes(notes, defaultOwner) {
  if (!notes) return [];

  if (isLLMConfigured()) {
    const llm = await generateJson({
      system: 'You turn meeting notes into action items. Only include genuine commitments; include owner and due when stated.',
      prompt: `Meeting notes:
---
${notes}
---
Default owner: ${defaultOwner}
Return JSON: {"actionItems":[{"text":"...","owner":"... or empty","due":"YYYY-MM-DD or null"}...]}\nReturn [] if there are none.`,
      fallback: null,
    });
    if (llm && Array.isArray(llm.actionItems)) {
      return llm.actionItems
        .filter(a => a && a.text)
        .map(a => ({
          id: `ai_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          text: String(a.text).trim(),
          owner: (a.owner || defaultOwner || '').trim(),
          due: a.due || null,
          done: false,
        }));
    }
  }

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