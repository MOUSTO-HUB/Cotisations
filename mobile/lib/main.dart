import 'package:flutter/material.dart';

import 'api/api_client.dart';
import 'screens/groups_screen.dart';
import 'screens/login_screen.dart';
import 'session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final session = Session(ApiClient());
  await session.restore();
  runApp(CotisationsApp(session: session));
}

class CotisationsApp extends StatelessWidget {
  const CotisationsApp({super.key, required this.session});

  final Session session;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Cotisations',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: const Color(0xFF1B7F3B),
        useMaterial3: true,
        // Gros boutons et textes lisibles pour un usage sur le terrain.
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            minimumSize: const Size(64, 52),
            textStyle: const TextStyle(fontSize: 16),
          ),
        ),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      home: ListenableBuilder(
        listenable: session,
        builder: (context, _) => session.isLoggedIn
            ? GroupsScreen(session: session)
            : LoginScreen(session: session),
      ),
    );
  }
}
