/// Mise en forme des montants et des dates pour l'affichage.
///
/// Les montants arrivent de l'API en chaînes d'entiers (« 1500000 ») : on ne
/// les convertit jamais en nombre à virgule.
library;

/// « 1500000 » + « GNF » → « 1 500 000 GNF ».
String formatMoney(String amount, [String currency = 'GNF']) {
  final negative = amount.startsWith('-');
  final digits = negative ? amount.substring(1) : amount;
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(' ');
    buffer.write(digits[i]);
  }
  return '${negative ? '-' : ''}$buffer $currency';
}

/// « 2027-03-05 » → « 05/03/2027 ».
String formatDate(String isoDate) {
  final parts = isoDate.substring(0, 10).split('-');
  if (parts.length != 3) return isoDate;
  return '${parts[2]}/${parts[1]}/${parts[0]}';
}

/// Libellés français des statuts renvoyés par l'API.
const statusLabels = <String, String>{
  'PENDING': 'À payer',
  'PARTIAL': 'Partiel',
  'PAID': 'Payé',
  'LATE': 'En retard',
  'EXEMPT': 'Exonéré',
  'PENDING_CONFIRMATION': 'À confirmer',
  'CONFIRMED': 'Confirmé',
  'DISPUTED': 'Contesté',
  'REVERSED': 'Annulé',
  'UPCOMING': 'À venir',
  'COLLECTING': 'En collecte',
  'COMPLETE': 'Complet',
  'PAID_OUT': 'Pot versé',
  'DRAFT': 'Brouillon',
  'ACTIVE': 'En cours',
  'COMPLETED': 'Terminée',
  'CANCELLED': 'Annulée',
  'INVITED': 'Invitation',
};

const roleLabels = <String, String>{
  'PRESIDENT': 'Président',
  'TREASURER': 'Trésorier',
  'SECRETARY': 'Secrétaire',
  'AUDITOR': 'Contrôleur',
  'MEMBER': 'Membre',
};

const groupTypeLabels = <String, String>{
  'FAMILY': 'Famille',
  'COMMUNITY': 'Communauté',
  'TONTINE': 'Tontine',
};

String label(Map<String, String> labels, String? key) =>
    key == null ? '' : labels[key] ?? key;
