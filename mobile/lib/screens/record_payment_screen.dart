import 'dart:math';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../format.dart';
import '../widgets/common.dart';

/// Le trésorier enregistre un paiement en espèces : membre, cotisation, montant.
class RecordPaymentScreen extends StatefulWidget {
  const RecordPaymentScreen({
    super.key,
    required this.api,
    required this.groupId,
    required this.currency,
  });

  final ApiClient api;
  final String groupId;
  final String currency;

  @override
  State<RecordPaymentScreen> createState() => _RecordPaymentScreenState();
}

class _RecordPaymentScreenState extends State<RecordPaymentScreen> {
  final _amount = TextEditingController();
  String? _membershipId;
  String? _planId;
  bool _busy = false;

  /// Une clé par saisie : si le réseau coupe et qu'on renvoie, pas de doublon.
  String _idempotencyKey = _newKey();

  static String _newKey() {
    final random = Random.secure();
    return List.generate(16, (_) => random.nextInt(256))
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
  }

  Future<(List<dynamic>, List<dynamic>)> _load() async {
    final members = await widget.api.get('/groups/${widget.groupId}/members')
        as List<dynamic>;
    final plans = await widget.api.get('/groups/${widget.groupId}/plans')
        as List<dynamic>;
    return (
      members.where((m) => (m as Map)['status'] == 'ACTIVE').toList(),
      plans,
    );
  }

  Future<void> _submit() async {
    final amount = _amount.text.replaceAll(RegExp(r'\s'), '');
    if (_membershipId == null || _planId == null || amount.isEmpty) {
      showInfo(context, 'Choisissez le membre, la cotisation et le montant.');
      return;
    }
    setState(() => _busy = true);
    try {
      final receipt =
          await widget.api.post('/groups/${widget.groupId}/payments/cash', {
        'membershipId': _membershipId,
        'planId': _planId,
        'amount': amount,
        'idempotencyKey': _idempotencyKey,
      }) as Map<String, dynamic>;
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Paiement enregistré'),
          content: Text(
            'Reçu ${receipt['receiptNumber']}\n'
            '${(receipt['member'] as Map)['fullName']} — '
            '${formatMoney(receipt['amount'] as String, widget.currency)}\n\n'
            'Le membre doit confirmer ce paiement dans son application.',
          ),
          actions: [
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('OK'),
            ),
          ],
        ),
      );
      setState(() {
        _amount.clear();
        _idempotencyKey = _newKey();
      });
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Paiement en espèces')),
      body: AsyncView<(List<dynamic>, List<dynamic>)>(
        load: _load,
        builder: (context, data, reload) {
          final (members, plans) = data;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              DropdownButtonFormField<String>(
                initialValue: _membershipId,
                decoration: const InputDecoration(labelText: 'Membre'),
                items: [
                  for (final m in members.cast<Map<String, dynamic>>())
                    DropdownMenuItem(
                      value: m['membershipId'] as String,
                      child: Text(m['fullName'] as String),
                    ),
                ],
                onChanged: (v) => setState(() => _membershipId = v),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _planId,
                decoration: const InputDecoration(labelText: 'Cotisation'),
                items: [
                  for (final p in plans.cast<Map<String, dynamic>>())
                    DropdownMenuItem(
                      value: p['id'] as String,
                      child: Text(
                        '${p['name']} (${formatMoney(p['amount'] as String, widget.currency)})',
                      ),
                    ),
                ],
                onChanged: (v) => setState(() => _planId = v),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'Montant reçu',
                  suffixText: widget.currency,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Le montant solde d’abord les échéances les plus anciennes.',
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _busy ? null : _submit,
                icon: const Icon(Icons.receipt_long),
                label: const Text('Enregistrer et émettre le reçu'),
              ),
            ],
          );
        },
      ),
    );
  }
}
