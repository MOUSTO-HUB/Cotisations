import { tallyVote } from './tally';

describe('tallyVote', () => {
  it('compte les voix et désigne l’option gagnante si le quorum est atteint', () => {
    const t = tallyVote(2, [0, 0, 1, 0], 6, 50);
    expect(t).toEqual({
      counts: [3, 1],
      ballots: 4,
      eligible: 6,
      participation: 66,
      quorumReached: true,
      winnerIndex: 0,
      tie: false,
    });
  });

  it('pas de gagnant sans quorum', () => {
    const t = tallyVote(2, [0, 0], 6, 50);
    expect(t.quorumReached).toBe(false);
    expect(t.winnerIndex).toBeNull();
  });

  it('le quorum se compte exactement : 3 sur 6 atteint 50 %', () => {
    expect(tallyVote(2, [0, 1, 0], 6, 50).quorumReached).toBe(true);
    expect(tallyVote(2, [0, 1, 0], 7, 50).quorumReached).toBe(false);
  });

  it('égalité : pas de gagnant', () => {
    const t = tallyVote(3, [0, 1, 2, 0, 1], 5, 50);
    expect(t).toMatchObject({ tie: true, winnerIndex: null });
  });

  it('aucun bulletin', () => {
    expect(tallyVote(2, [], 4, 50)).toMatchObject({
      participation: 0,
      quorumReached: false,
      winnerIndex: null,
      tie: false,
    });
  });
});
