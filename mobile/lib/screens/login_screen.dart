import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../session.dart';
import '../widgets/common.dart';

/// Parcours de connexion : numéro → code SMS → (nom à la première connexion).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.session});

  final Session session;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

enum _Step { phone, code, name }

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  final _name = TextEditingController();
  _Step _step = _Step.phone;
  bool _busy = false;
  String? _devCode;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } on ApiException catch (e) {
      if (e.code == 'FULL_NAME_REQUIRED') {
        setState(() => _step = _Step.name);
      } else if (mounted) {
        showError(context, e);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _sendCode() => _run(() async {
        final devCode = await widget.session.requestCode(_phone.text.trim());
        setState(() {
          _devCode = devCode;
          _step = _Step.code;
        });
      });

  void _verify() => _run(() => widget.session.verify(
        _phone.text.trim(),
        _code.text.trim(),
        fullName: _step == _Step.name ? _name.text.trim() : null,
      ));

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.savings_outlined, size: 64),
                  const SizedBox(height: 12),
                  Text('Cotisations',
                      style: text.headlineMedium, textAlign: TextAlign.center),
                  Text(
                    'Familles, villages et tontines',
                    style: text.bodyLarge,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  if (_step == _Step.phone) ...[
                    TextField(
                      controller: _phone,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                        labelText: 'Numéro de téléphone',
                        hintText: '620 00 00 00',
                        prefixIcon: Icon(Icons.phone),
                      ),
                      onSubmitted: (_) => _sendCode(),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _sendCode,
                      child: const Text('Recevoir mon code par SMS'),
                    ),
                  ] else ...[
                    Text('Code envoyé au ${_phone.text}',
                        style: text.bodyLarge),
                    if (_devCode != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Mode développement : code $_devCode',
                          style: TextStyle(color: Colors.orange.shade800),
                        ),
                      ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _code,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      decoration: const InputDecoration(
                        labelText: 'Code à 6 chiffres',
                        prefixIcon: Icon(Icons.lock_outline),
                      ),
                    ),
                    if (_step == _Step.name) ...[
                      const Text('Première connexion : indiquez votre nom.'),
                      const SizedBox(height: 8),
                      TextField(
                        controller: _name,
                        textCapitalization: TextCapitalization.words,
                        decoration: const InputDecoration(
                          labelText: 'Nom complet',
                          prefixIcon: Icon(Icons.person_outline),
                        ),
                      ),
                    ],
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy ? null : _verify,
                      child: const Text('Se connecter'),
                    ),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => setState(() {
                                _step = _Step.phone;
                                _code.clear();
                              }),
                      child: const Text('Changer de numéro'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
