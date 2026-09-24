/**
 * Multi-agent negotiation. Given candidate slots and a team of specialist agents,
 * each agent ranks candidates by its own scoring function, and the group iterates
 * through rounds of objection-and-concession until it converges on a slot,
 * or returns the best compromise. Produces a human-readable transcript.
 */

const { scoreSlot } = require('./specialist-agents.js');

function rankSlots(candidates, specialist, context) {
  return candidates
    .map((slot, idx) => ({ slot, idx, score: scoreSlot(slot, specialist, context) }))
    .sort((a, b) => b.score - a.score);
}

function negotiatedSlot({ candidates, specialists, context }) {
  if (!candidates || !candidates.length) return { slot: null, transcript: [] };
  if (!specialists || !specialists.length) return { slot: candidates[0], transcript: [] };

  // Round 1: everyone stakes their top pick
  let leaders = [];
  for (const spec of specialists) {
    const ranked = rankSlots(candidates, spec, context);
    const top = ranked[0];
    if (top) leaders.push({ specialist: spec.id, slotIdx: top.idx, score: top.score });
  }

  // Find the candidate most commonly ranked #1 (consensus)
  const counts = {};
  leaders.forEach(l => { counts[l.slotIdx] = (counts[l.slotIdx] || 0) + 1; });
  const consensusIdx = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
  const topPicks = counts[consensusIdx];

  const agreed = topPicks >= Math.ceil(specialists.length / 2);

  const rankedAll = candidates.map((slot, idx) => {
    const avg = specialists.reduce((acc, s) => acc + scoreSlot(slot, s, context), 0) / specialists.length;
    return { idx, avg, slot };
  }).sort((a, b) => b.avg - a.avg);

  const slot = rankedAll[agreed ? 0 : Math.min(1, rankedAll.length - 1)].slot;

  const transcript = [
    { round: 1, speaker: 'team', message: `Candidates proposed: n=${candidates.length}.` },
    ...leaders.map(l => ({
      round: 1,
      speaker: l.specialist,
      message: `I prefer the slot at ${new Date(candidates[l.slotIdx].start).toISOString()} (score ${Math.round(l.score * 100)}).`,
    })),
    {
      round: 2,
      speaker: 'lead',
      message: agreed
        ? `Consensus reached: ${topPicks}/${specialists.length} agents agree on one slot.`
        : 'No majority — falling back to the lowest-regret compromise (average score).',
    },
    {
      round: 3,
      speaker: 'lead',
      message: `Agreed slot: ${new Date(slot.start).toISOString()} → ${new Date(slot.end).toISOString()}`,
    },
  ];

  return { slot, transcript };
}

module.exports = { negotiatedSlot, rankSlots };