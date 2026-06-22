function aggregateEvent(event) {
  const votes = event.votes || {};
  const totalVotes = Object.keys(votes).length;
  const voteCounts = {};

  for (const vote of Object.values(votes)) {
    voteCounts[vote.candidateId] = (voteCounts[vote.candidateId] || 0) + 1;
  }

  const candidates = (event.candidates || []).map((candidate) => {
    const count = voteCounts[candidate.id] || 0;
    const percentage =
      totalVotes > 0 ? Math.round((count / totalVotes) * 1000) / 10 : 0;
    return {
      candidateId: candidate.id,
      label: candidate.label,
      displayName: candidate.displayName || candidate.label,
      votes: count,
      percentage
    };
  });

  candidates.sort((a, b) => {
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.label.localeCompare(b.label);
  });

  const leader =
    candidates.length > 0 && totalVotes > 0
      ? { ...candidates[0] }
      : null;

  return {
    eventId: event.eventId,
    sport: event.sport,
    eventName: event.eventName,
    status: event.status,
    raceStart: event.raceStart,
    closesAt: event.closesAt,
    totalVotes,
    currentLeader: leader,
    candidates,
    updatedAt: new Date().toISOString()
  };
}

function buildFinalSnapshot(event) {
  const summary = aggregateEvent(event);
  return {
    closedAt: event.closedAt || new Date().toISOString(),
    totalVotes: summary.totalVotes,
    leader: summary.currentLeader,
    candidates: summary.candidates
  };
}

module.exports = { aggregateEvent, buildFinalSnapshot };
