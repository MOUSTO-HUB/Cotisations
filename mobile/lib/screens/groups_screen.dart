import 'package:flutter/material.dart';

import '../format.dart';
import '../session.dart';
import '../widgets/common.dart';
import 'group_screen.dart';

/// Mes groupes, invitations en attente et création d'un groupe.
class GroupsScreen extends StatefulWidget {
  const GroupsScreen({super.key, required this.session});

  final Session session;

  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen> {
  Key _listKey = UniqueKey();

  void _refresh() => setState(() => _listKey = UniqueKey());

  Future<void> _createGroup() async {
    final created = await showDialog<bool>(
      context: context,
      builder: (_) => _CreateGroupDialog(session: widget.session),
    );
    if (created == true) _refresh();
  }

  Future<void> _join(String groupId) async {
    try {
      await widget.session.api.post('/groups/$groupId/join');
      if (mounted) showInfo(context, 'Invitation acceptée.');
      _refresh();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.session.user!;
    return Scaffold(
      appBar: AppBar(
        title: Text('Bonjour ${user['fullName']}'),
        actions: [
          IconButton(
            tooltip: 'Se déconnecter',
            icon: const Icon(Icons.logout),
            onPressed: widget.session.logout,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _createGroup,
        icon: const Icon(Icons.add),
        label: const Text('Créer un groupe'),
      ),
      body: AsyncView<List<dynamic>>(
        key: _listKey,
        load: () async =>
            await widget.session.api.get('/groups') as List<dynamic>,
        builder: (context, groups, reload) {
          if (groups.isEmpty) {
            return ListView(children: const [
              SizedBox(height: 120),
              Center(
                child: Text(
                  'Vous n’êtes encore dans aucun groupe.\n'
                  'Créez-en un, ou demandez au bureau de vous ajouter.',
                  textAlign: TextAlign.center,
                ),
              ),
            ]);
          }
          return ListView.separated(
            padding: const EdgeInsets.only(bottom: 96),
            itemCount: groups.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (context, i) {
              final g = groups[i] as Map<String, dynamic>;
              final invited = g['myStatus'] == 'INVITED';
              return ListTile(
                leading: CircleAvatar(
                  child: Icon(switch (g['type']) {
                    'FAMILY' => Icons.family_restroom,
                    'COMMUNITY' => Icons.holiday_village_outlined,
                    _ => Icons.autorenew,
                  }),
                ),
                title: Text(g['name'] as String),
                subtitle: Text(
                  '${label(groupTypeLabels, g['type'] as String)} · '
                  '${label(roleLabels, g['myRole'] as String)} · ${g['currency']}',
                ),
                trailing: invited
                    ? FilledButton(
                        onPressed: () => _join(g['id'] as String),
                        child: const Text('Accepter'),
                      )
                    : const Icon(Icons.chevron_right),
                onTap: invited
                    ? null
                    : () => Navigator.of(context).push(MaterialPageRoute(
                          builder: (_) => GroupScreen(
                            session: widget.session,
                            groupId: g['id'] as String,
                            groupName: g['name'] as String,
                          ),
                        )),
              );
            },
          );
        },
      ),
    );
  }
}

class _CreateGroupDialog extends StatefulWidget {
  const _CreateGroupDialog({required this.session});

  final Session session;

  @override
  State<_CreateGroupDialog> createState() => _CreateGroupDialogState();
}

class _CreateGroupDialogState extends State<_CreateGroupDialog> {
  final _name = TextEditingController();
  String _type = 'FAMILY';
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    try {
      await widget.session.api
          .post('/groups', {'type': _type, 'name': _name.text.trim()});
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Nouveau groupe'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Nom du groupe'),
          ),
          const SizedBox(height: 16),
          SegmentedButton<String>(
            segments: [
              for (final e in groupTypeLabels.entries)
                ButtonSegment(value: e.key, label: Text(e.value)),
            ],
            selected: {_type},
            onSelectionChanged: (s) => setState(() => _type = s.first),
          ),
          const SizedBox(height: 8),
          const Text('Vous en deviendrez le président.'),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Annuler'),
        ),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: const Text('Créer'),
        ),
      ],
    );
  }
}
