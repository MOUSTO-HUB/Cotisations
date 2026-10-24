import 'dart:convert';

import 'package:cotisations/api/api_client.dart';
import 'package:cotisations/screens/login_screen.dart';
import 'package:cotisations/session.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('demande le nom à la première connexion, puis connecte',
      (tester) async {
    final calls = <String>[];
    final client = MockClient((request) async {
      calls.add('${request.method} ${request.url.path}');
      final body = request.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(request.body) as Map<String, dynamic>;
      if (request.url.path == '/auth/otp/request') {
        return _json(
          jsonEncode({
            'phone': '+224620000000',
            'expiresInSeconds': 300,
            'devCode': '123456'
          }),
          200,
        );
      }
      if (body['fullName'] == null) {
        return _json(
          jsonEncode(
              {'message': 'Nom complet requis.', 'code': 'FULL_NAME_REQUIRED'}),
          400,
        );
      }
      return _json(
        jsonEncode({
          'token': 'jeton',
          'isNewUser': true,
          'user': {
            'id': 'u1',
            'fullName': body['fullName'],
            'phone': '+224620000000'
          },
        }),
        200,
      );
    });
    final session = Session(ApiClient(client: client, baseUrl: 'http://api'));

    await tester.pumpWidget(MaterialApp(home: LoginScreen(session: session)));
    await tester.enterText(find.byType(TextField), '620 00 00 00');
    await tester.tap(find.text('Recevoir mon code par SMS'));
    await tester.pumpAndSettle();

    // En développement, le code s'affiche pour tester sans SMS.
    expect(find.textContaining('code 123456'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, '123456');
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();

    expect(
        find.text('Première connexion : indiquez votre nom.'), findsOneWidget);
    await tester.enterText(find.byType(TextField).last, 'Aïssatou Bah');
    await tester.tap(find.text('Se connecter'));
    await tester.pumpAndSettle();

    expect(session.isLoggedIn, isTrue);
    expect(session.user!['fullName'], 'Aïssatou Bah');
    expect(calls, [
      'POST /auth/otp/request',
      'POST /auth/otp/verify',
      'POST /auth/otp/verify',
    ]);
  });
}

/// Réponse JSON encodée en UTF-8, comme celle de l'API.
http.Response _json(String body, int status) => http.Response.bytes(
      utf8.encode(body),
      status,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );
