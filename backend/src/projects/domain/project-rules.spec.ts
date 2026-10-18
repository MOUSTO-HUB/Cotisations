import {
  budgetTracking,
  collectionTarget,
  nextStatus,
  ProjectRuleError,
  splitInstallments,
  suggestedShare,
} from './project-rules';

describe('cycle de vie d’un projet (6 étapes)', () => {
  it('suit l’ordre proposé → budgétisé → validé → collecte → réalisation → achevé', () => {
    let status = nextStatus('PROPOSED', 'setBudget');
    expect(status).toBe('BUDGETED');
    status = nextStatus(status, 'approve');
    expect(status).toBe('VOTED');
    status = nextStatus(status, 'openCollection');
    expect(status).toBe('COLLECTING');
    status = nextStatus(status, 'start');
    expect(status).toBe('IN_PROGRESS');
    expect(nextStatus(status, 'complete')).toBe('COMPLETED');
  });

  it('refuse de sauter une étape', () => {
    expect(() => nextStatus('PROPOSED', 'approve')).toThrow(ProjectRuleError);
    expect(() => nextStatus('BUDGETED', 'openCollection')).toThrow('validé');
  });

  it('le budget se révise tant que le projet n’est pas validé', () => {
    expect(nextStatus('BUDGETED', 'setBudget')).toBe('BUDGETED');
    expect(() => nextStatus('VOTED', 'setBudget')).toThrow(ProjectRuleError);
  });

  it('annulation possible seulement avant la collecte', () => {
    expect(nextStatus('VOTED', 'cancel')).toBe('CANCELLED');
    expect(() => nextStatus('COLLECTING', 'cancel')).toThrow(ProjectRuleError);
  });
});

describe('objectif et parts', () => {
  it('objectif = budget − fonds affectés − subventions', () => {
    expect(collectionTarget(30_000_000n, 5_000_000n, 10_000_000n)).toBe(
      15_000_000n,
    );
  });

  it('objectif nul si les fonds couvrent déjà le budget', () => {
    expect(collectionTarget(1_000n, 800n, 500n)).toBe(0n);
  });

  it('part par cotisant arrondie au-dessus', () => {
    expect(suggestedShare(15_000_000n, 120)).toBe(125_000n);
    expect(suggestedShare(1_000_000n, 3)).toBe(333_334n);
  });

  it('versements entiers dont la somme est exacte', () => {
    expect(splitInstallments(125_000n, 3)).toEqual([41_667n, 41_667n, 41_666n]);
    expect(splitInstallments(90_000n, 3)).toEqual([30_000n, 30_000n, 30_000n]);
    expect(() => splitInstallments(1_000n, 0)).toThrow(ProjectRuleError);
  });
});

describe('suivi budgétaire par poste', () => {
  const lines = [
    { id: 'ciment', label: 'Ciment', plannedAmount: 1_000_000n },
    { id: 'macon', label: 'Main-d’œuvre', plannedAmount: 2_000_000n },
  ];

  it('prévu, engagé, dépensé et écart par poste', () => {
    const t = budgetTracking(lines, [
      { budgetLineId: 'ciment', amount: 600_000n, status: 'EXECUTED' },
      { budgetLineId: 'ciment', amount: 300_000n, status: 'PENDING_APPROVAL' },
      { budgetLineId: 'ciment', amount: 50_000n, status: 'REJECTED' },
      { budgetLineId: null, amount: 20_000n, status: 'EXECUTED' },
    ]);
    expect(t.lines[0]).toMatchObject({
      planned: 1_000_000n,
      committed: 300_000n,
      spent: 600_000n,
      variance: -400_000n,
      overrun: false,
    });
    expect(t.unassignedSpent).toBe(20_000n);
    expect(t.totals).toEqual({
      planned: 3_000_000n,
      committed: 300_000n,
      spent: 620_000n,
    });
  });

  it('alerte au-delà de 10 % de dépassement, pas avant', () => {
    const at10 = budgetTracking(lines, [
      { budgetLineId: 'ciment', amount: 1_100_000n, status: 'EXECUTED' },
    ]);
    expect(at10.lines[0].overrun).toBe(false);
    const over = budgetTracking(lines, [
      { budgetLineId: 'ciment', amount: 1_100_001n, status: 'EXECUTED' },
    ]);
    expect(over.lines[0].overrun).toBe(true);
  });
});
