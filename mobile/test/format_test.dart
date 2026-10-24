import 'package:cotisations/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatMoney', () {
    test('sépare les milliers sans passer par un nombre à virgule', () {
      expect(formatMoney('1500000'), '1 500 000 GNF');
      expect(formatMoney('50000', 'XOF'), '50 000 XOF');
      expect(formatMoney('999'), '999 GNF');
      expect(formatMoney('0'), '0 GNF');
    });

    test('garde la précision des très grands montants', () {
      expect(
        formatMoney('900719925474099300'),
        '900 719 925 474 099 300 GNF',
      );
    });

    test('montant négatif', () {
      expect(formatMoney('-20000'), '-20 000 GNF');
    });
  });

  test('formatDate', () {
    expect(formatDate('2027-03-05'), '05/03/2027');
    expect(formatDate('2027-03-05T10:00:00.000Z'), '05/03/2027');
  });

  test('libellés des statuts', () {
    expect(label(statusLabels, 'LATE'), 'En retard');
    expect(label(statusLabels, 'INCONNU'), 'INCONNU');
  });
}
