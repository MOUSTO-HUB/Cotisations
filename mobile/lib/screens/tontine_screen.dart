import 'package:flutter/material.dart';

import '../format.dart';
import '../session.dart';
import '../widgets/common.dart';

/// Calendrier d'une tontine : bénéficiaire et avancement de chaque tour.
class TontineScreen extends StatelessWidget {
  const TontineScreen({
    super.key,
    required this.session,
    required this.groupId,
    required this.cycleId,
  });

  final Session session;
  final String groupId;
  final String cycleId;

  String get _base => '/groups/$groupId/tontines/$cycleId';

  Future<void> _confirmReceipt(
    BuildContext context,
    int round,
    Future<void> Function() reload,
  ) async {
    try {
      await session.api.post('$_base/rounds/$round/confirm-receipt');
      if (context.mounted) {
        showInfo(context, 'Réception du pot confirmée. Merci !');
      }
      await reload();
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final myId = session.user!['id'];
    return Scaffold(
      appBar: AppBar(title: const Text('Calendrier de la tontine')),
      body: AsyncView<Map<String, dynamic>>(
        load: () async => await session.api.get(_base) as Map<String, dynamic>,
        builder: (context, cycle, reload) {
          final currency = cycle['currency'] as String;
          final rounds =
              (cycle['rounds'] as List<dynamic>).cast<Map<String, dynamic>>();
          final members =
              (cycle['members'] as List<dynamic>).cast<Map<String, dynamic>>();
          final defaulters =
              members.where((m) => m['defaulter'] == true).toList();
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(cycle['name'] as String,
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 4),
              Text(
                '${formatMoney(cycle['contributionAmount'] as String, currency)} par part · '
                '${cycle['shareCount']} parts · pot de '
                '${formatMoney(cycle['potAmount'] as String, currency)}',
              ),
              const SizedBox(height: 8),
              StatusChip(cycle['status'] as String),
              if (defaulters.isNotEmpty) ...[
                const SizedBox(height: 12),
                Card(
                  color: Theme.of(context).colorScheme.errorContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      'Défaillants (déjà servis, en retard) : '
                      '${defaulters.map((m) => m['memberName']).join(', ')}',
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 12),
              if (rounds.isEmpty)
                const Text(
                    'Le calendrier sera publié au démarrage de la tontine.'),
              for (final r in rounds)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          CircleAvatar(child: Text('${r['number']}')),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  (r['beneficiary'] as Map?)?['memberName']
                                          as String? ??
                                      '—',
                                  style:
                                      Theme.of(context).textTheme.titleMedium,
                                ),
                                Text(
                                    'Tour du ${formatDate(r['dueDate'] as String)}'),
                              ],
                            ),
                          ),
                          StatusChip(r['status'] as String),
                        ]),
                        const SizedBox(height: 8),
                        LinearProgressIndicator(
                          value: (r['totalShares'] as int) == 0
                              ? 0
                              : (r['paidShares'] as int) /
                                  (r['totalShares'] as int),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '${r['paidShares']}/${r['totalShares']} parts payées · '
                          'collecté ${formatMoney(r['collected'] as String, currency)}',
                        ),
                        if ((r['unpaidMembers'] as List).isNotEmpty &&
                            r['status'] != 'UPCOMING')
                          Text(
                              'Reste à payer : ${(r['unpaidMembers'] as List).join(', ')}'),
                        if (r['status'] == 'PAID_OUT' &&
                            r['receiptConfirmed'] != true &&
                            (r['beneficiary'] as Map?)?['userId'] == myId)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: FilledButton(
                              onPressed: () => _confirmReceipt(
                                  context, r['number'] as int, reload),
                              child: const Text('J’ai bien reçu le pot'),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}
