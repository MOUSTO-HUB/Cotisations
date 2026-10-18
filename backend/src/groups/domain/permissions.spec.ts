import { hasPermission } from './permissions';

describe('hasPermission (section 3 du cahier des charges)', () => {
  it('le président nomme les rôles et gère les membres, mais ne saisit pas les finances', () => {
    expect(hasPermission('PRESIDENT', 'roles.assign')).toBe(true);
    expect(hasPermission('PRESIDENT', 'members.invite')).toBe(true);
    expect(hasPermission('PRESIDENT', 'finance.record')).toBe(false);
  });

  it('le trésorier saisit les finances mais ne gère pas les membres', () => {
    expect(hasPermission('TREASURER', 'finance.record')).toBe(true);
    expect(hasPermission('TREASURER', 'members.invite')).toBe(false);
  });

  it('le secrétaire gère les membres sans toucher aux finances', () => {
    expect(hasPermission('SECRETARY', 'members.invite')).toBe(true);
    expect(hasPermission('SECRETARY', 'finance.record')).toBe(false);
    expect(hasPermission('SECRETARY', 'roles.assign')).toBe(false);
  });

  it('le contrôleur valide les dépenses sans en saisir', () => {
    expect(hasPermission('AUDITOR', 'finance.approve')).toBe(true);
    expect(hasPermission('AUDITOR', 'finance.record')).toBe(false);
  });

  it('un simple membre n’a aucun droit de gestion', () => {
    expect(hasPermission('MEMBER', 'members.invite')).toBe(false);
    expect(hasPermission('MEMBER', 'audit.read')).toBe(false);
  });
});
