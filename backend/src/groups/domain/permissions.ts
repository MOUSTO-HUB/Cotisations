import type { Role } from '@prisma/client';

/**
 * Droits par rôle dans un groupe (cahier des charges, section 3).
 * Les droits sont définis par groupe : une même personne peut être trésorière
 * d'une tontine et simple membre de sa caisse familiale.
 */
export type Permission =
  | 'group.update' // modifier le nom et les règles du groupe
  | 'members.invite' // ajouter ou inviter un membre
  | 'members.remove' // retirer un membre
  | 'roles.assign' // nommer président, trésorier, secrétaire, contrôleur
  | 'finance.record' // saisir paiements en espèces, dépenses, reçus
  | 'finance.approve' // second validateur d'une dépense (RG-D1)
  | 'audit.read' // consulter le journal d'audit
  | 'projects.manage' // proposer un projet, son budget, ses jalons (section 4.5)
  | 'campaigns.open'; // ouvrir une collecte de solidarité (un membre du bureau)

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PRESIDENT: [
    'group.update',
    'members.invite',
    'members.remove',
    'roles.assign',
    'finance.approve',
    'audit.read',
    'projects.manage',
    'campaigns.open',
  ],
  TREASURER: ['finance.record', 'audit.read', 'campaigns.open'],
  SECRETARY: [
    'members.invite',
    'members.remove',
    'audit.read',
    'projects.manage',
    'campaigns.open',
  ],
  AUDITOR: ['finance.approve', 'audit.read', 'campaigns.open'],
  MEMBER: [],
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
