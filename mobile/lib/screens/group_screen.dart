import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../format.dart';
import '../session.dart';
import '../widgets/common.dart';
import 'record_payment_screen.dart';
import 'tontine_screen.dart';

/// Tableau de bord d'un groupe : mes échéances, caisses, membres, tontines.
class GroupScreen extends StatelessWidget {
  const GroupScreen({
    super.key,
    required this.session,
    required this.groupId,
    required this.groupName,
  });

  final Session session;
  final String groupId;
  final String groupName;

  ApiClient get api => session.api;

  @override
  Widget build(BuildContext context) {
    return AsyncView<Map<String, dynamic>>(
      load: () async =>
          await api.get('/groups/$groupId') as Map<String, dynamic>,
      builder: (context, group, reload) {
        final currency = group['currency'] as String;
        final isTreasurer = group['myRole'] == 'TREASURER';
        final isTontine = group['type'] == 'TONTINE';
        return DefaultTabController(
          length: isTontine ? 4 : 3,
          child: Scaffold(
            appBar: AppBar(
              title: Text(groupName),
              bottom: TabBar(
                isScrollable: true,
                tabs: [
                  const Tab(text: 'Mes échéances'),
                  const Tab(text: 'Caisses'),
                  const Tab(text: 'Membres'),
                  if (isTontine) const Tab(text: 'Tontines'),
                ],
              ),
            ),
            floatingActionButton: isTreasurer
                ? FloatingActionButton.extended(
                    icon: const Icon(Icons.payments_outlined),
                    label: const Text('Saisir un paiement'),
                    onPressed: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => RecordPaymentScreen(
                          api: api,
                          groupId: groupId,
                          currency: currency,
                        ),
                      ),
                    ),
                  )
                : null,
            body: TabBarView(
              children: [
                _MyDuesTab(api: api, groupId: groupId, currency: currency),
                _CashboxesTab(api: api, groupId: groupId, currency: currency),
                _MembersTab(api: api, groupId: groupId),
                if (isTontine)
                  _TontinesTab(
                      session: session, groupId: groupId, currency: currency),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _MyDuesTab extends StatelessWidget {
  const _MyDuesTab(
      {required this.api, required this.groupId, required this.currency});

  final ApiClient api;
  final String groupId;
  final String currency;

  Future<Map<String, dynamic>> _load() async {
    final dues =
        await api.get('/groups/$groupId/me/dues') as Map<String, dynamic>;
    final payments = await api.get(
      '/groups/$groupId/payments?membershipId=${dues['membershipId']}',
    ) as List<dynamic>;
    return {...dues, 'payments': payments};
  }

  Future<void> _answer(
    BuildContext context,
    Map<String, dynamic> payment,
    bool confirm,
    Future<void> Function() reload,
  ) async {
    try {
      if (confirm) {
        await api.post('/groups/$groupId/payments/${payment['id']}/confirm');
      } else {
        final reason = await _askReason(context);
        if (reason == null) return;
        await api.post(
          '/groups/$groupId/payments/${payment['id']}/dispute',
          {'reason': reason},
        );
      }
      await reload();
    } catch (e) {
      if (context.mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AsyncView<Map<String, dynamic>>(
      load: _load,
      builder: (context, data, reload) {
        final dues = data['dues'] as List<dynamic>;
        final pending = (data['payments'] as List<dynamic>)
            .cast<Map<String, dynamic>>()
            .where((p) => p['status'] == 'PENDING_CONFIRMATION')
            .toList();
        final late = data['lateCount'] as int;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                title: const Text('Reste à payer'),
                subtitle: late > 0
                    ? Text('$late échéance(s) en retard',
                        style: TextStyle(
                            color: Theme.of(context).colorScheme.error))
                    : const Text('Vous êtes à jour'),
                trailing: Text(
                  formatMoney(data['outstanding'] as String, currency),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
            ),
            for (final p in pending)
              Card(
                color: Colors.orange.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Le trésorier a enregistré un paiement de '
                        '${formatMoney(p['amount'] as String, currency)} '
                        '(reçu ${p['receiptNumber']}). Est-ce exact ?',
                      ),
                      const SizedBox(height: 8),
                      Row(children: [
                        FilledButton(
                          onPressed: () => _answer(context, p, true, reload),
                          child: const Text('Oui, je confirme'),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: () => _answer(context, p, false, reload),
                          child: const Text('Contester'),
                        ),
                      ]),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 8),
            if (dues.isEmpty) const Text('Aucune échéance pour le moment.'),
            for (final d in dues.cast<Map<String, dynamic>>())
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: Text(d['planName'] as String? ?? 'Cotisation'),
                subtitle: Text(
                  'Échéance du ${formatDate(d['dueDate'] as String)} · '
                  'payé ${formatMoney(d['amountPaid'] as String, currency)}'
                  '${d['penaltyOfId'] != null ? ' · pénalité' : ''}',
                ),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(formatMoney(d['amountDue'] as String, currency)),
                    StatusChip(d['status'] as String),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

Future<String?> _askReason(BuildContext context) {
  final controller = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Pourquoi contestez-vous ?'),
      content: TextField(
        controller: controller,
        decoration: const InputDecoration(
            hintText: 'Ex. j’ai remis 50 000, pas 70 000'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Annuler'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(context).pop(controller.text.trim()),
          child: const Text('Envoyer'),
        ),
      ],
    ),
  );
}

class _CashboxesTab extends StatelessWidget {
  const _CashboxesTab(
      {required this.api, required this.groupId, required this.currency});

  final ApiClient api;
  final String groupId;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return AsyncView<List<dynamic>>(
      load: () async =>
          await api.get('/groups/$groupId/cashboxes') as List<dynamic>,
      builder: (context, boxes, reload) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          for (final b in boxes.cast<Map<String, dynamic>>())
            Card(
              child: ListTile(
                title: Text(b['name'] as String),
                subtitle: Text(
                  'Entrées ${formatMoney(b['totalIn'] as String, currency)} · '
                  'sorties ${formatMoney(b['totalOut'] as String, currency)}',
                ),
                trailing: Text(
                  formatMoney(b['balance'] as String, currency),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => _JournalScreen(
                    api: api,
                    groupId: groupId,
                    cashboxId: b['id'] as String,
                    title: b['name'] as String,
                    currency: currency,
                  ),
                )),
              ),
            ),
        ],
      ),
    );
  }
}

/// Journal d'une caisse : chaque écriture avec le solde après l'opération.
class _JournalScreen extends StatelessWidget {
  const _JournalScreen({
    required this.api,
    required this.groupId,
    required this.cashboxId,
    required this.title,
    required this.currency,
  });

  final ApiClient api;
  final String groupId;
  final String cashboxId;
  final String title;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: AsyncView<Map<String, dynamic>>(
        load: () async =>
            await api.get('/groups/$groupId/cashboxes/$cashboxId/movements')
                as Map<String, dynamic>,
        builder: (context, journal, reload) {
          final entries = (journal['entries'] as List<dynamic>)
              .cast<Map<String, dynamic>>()
              .reversed;
          return ListView(
            children: [
              ListTile(
                title: const Text('Solde actuel'),
                trailing: Text(
                  formatMoney(journal['balance'] as String, currency),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              const Divider(),
              for (final e in entries)
                ListTile(
                  leading: Icon(
                    e['direction'] == 'IN'
                        ? Icons.south_west
                        : Icons.north_east,
                    color: e['direction'] == 'IN'
                        ? Colors.green.shade700
                        : Colors.red.shade700,
                  ),
                  title: Text(e['label'] as String),
                  subtitle: Text(
                    '${formatDate(e['createdAt'] as String)} · solde '
                    '${formatMoney(e['balanceAfter'] as String, currency)}',
                  ),
                  trailing: Text(
                    '${e['direction'] == 'IN' ? '+' : '−'}'
                    '${formatMoney(e['amount'] as String, currency)}',
                  ),
                ),
            ],
          );
        },
      ),
    );
  }
}

class _MembersTab extends StatelessWidget {
  const _MembersTab({required this.api, required this.groupId});

  final ApiClient api;
  final String groupId;

  @override
  Widget build(BuildContext context) {
    return AsyncView<List<dynamic>>(
      load: () async =>
          await api.get('/groups/$groupId/members') as List<dynamic>,
      builder: (context, members, reload) => ListView(
        children: [
          for (final m in members.cast<Map<String, dynamic>>())
            ListTile(
              leading: CircleAvatar(
                child: Text(
                    (m['fullName'] as String).substring(0, 1).toUpperCase()),
              ),
              title: Text(m['fullName'] as String),
              subtitle: Text(m['phone'] as String),
              trailing: m['status'] == 'INVITED'
                  ? const StatusChip('INVITED')
                  : Text(label(roleLabels, m['role'] as String)),
            ),
        ],
      ),
    );
  }
}

class _TontinesTab extends StatelessWidget {
  const _TontinesTab(
      {required this.session, required this.groupId, required this.currency});

  final Session session;
  final String groupId;
  final String currency;

  @override
  Widget build(BuildContext context) {
    return AsyncView<List<dynamic>>(
      load: () async =>
          await session.api.get('/groups/$groupId/tontines') as List<dynamic>,
      builder: (context, cycles, reload) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (cycles.isEmpty) const Text('Aucune tontine pour le moment.'),
          for (final c in cycles.cast<Map<String, dynamic>>())
            Card(
              child: ListTile(
                title: Text(c['name'] as String),
                subtitle: Text(
                  '${c['shareCount']} parts · '
                  '${formatMoney(c['contributionAmount'] as String, currency)} par part · '
                  'pot ${formatMoney(c['potAmount'] as String, currency)}',
                ),
                trailing: StatusChip(c['status'] as String),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => TontineScreen(
                    session: session,
                    groupId: groupId,
                    cycleId: c['id'] as String,
                  ),
                )),
              ),
            ),
        ],
      ),
    );
  }
}
