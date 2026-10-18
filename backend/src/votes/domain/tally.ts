/**
 * Décompte d'un vote (section 4.7) : participation, quorum, option gagnante.
 */
export interface VoteTally {
  counts: number[];
  ballots: number;
  eligible: number;
  /** Participation en pourcentage entier. */
  participation: number;
  quorumReached: boolean;
  /** Option gagnante (indice) si le quorum est atteint et sans égalité. */
  winnerIndex: number | null;
  tie: boolean;
}

export function tallyVote(
  optionCount: number,
  choices: readonly number[],
  eligible: number,
  quorumPercent: number,
): VoteTally {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const c of choices) {
    if (c >= 0 && c < optionCount) counts[c]++;
  }
  const ballots = choices.length;
  const participation =
    eligible > 0 ? Math.floor((ballots * 100) / eligible) : 0;
  // Quorum : bulletins ≥ quorum % des membres (calcul entier, sans arrondi flatteur).
  const quorumReached =
    eligible > 0 && ballots * 100 >= quorumPercent * eligible;
  const max = Math.max(0, ...counts);
  const leaders = counts.flatMap((n, i) => (n === max && max > 0 ? [i] : []));
  const tie = leaders.length > 1;
  return {
    counts,
    ballots,
    eligible,
    participation,
    quorumReached,
    winnerIndex: quorumReached && leaders.length === 1 ? leaders[0] : null,
    tie,
  };
}
