import 'dart:convert';

import 'package:http/http.dart' as http;

/// Adresse de l'API. À changer au lancement :
/// `flutter run --dart-define=API_URL=http://10.0.2.2:3400` (émulateur Android).
const apiUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://localhost:3400',
);

/// Erreur renvoyée par l'API, avec son message en français.
class ApiException implements Exception {
  ApiException(this.status, this.message, [this.code]);

  final int status;
  final String message;

  /// Code métier éventuel (ex. FULL_NAME_REQUIRED).
  final String? code;

  @override
  String toString() => message;
}

/// Client HTTP de l'API Cotisations. Le jeton de session est ajouté à
/// chaque requête une fois connecté.
class ApiClient {
  ApiClient({http.Client? client, this.baseUrl = apiUrl})
      : _http = client ?? http.Client();

  final http.Client _http;
  final String baseUrl;
  String? token;

  Future<dynamic> get(String path) => _send('GET', path);

  Future<dynamic> post(String path, [Map<String, dynamic>? body]) =>
      _send('POST', path, body);

  Future<dynamic> put(String path, Map<String, dynamic> body) =>
      _send('PUT', path, body);

  Future<dynamic> patch(String path, Map<String, dynamic> body) =>
      _send('PATCH', path, body);

  Future<dynamic> _send(
    String method,
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    final request = http.Request(method, Uri.parse('$baseUrl$path'))
      ..headers['Content-Type'] = 'application/json';
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    if (body != null) request.body = jsonEncode(body);

    final http.Response response;
    try {
      response = await http.Response.fromStream(await _http.send(request));
    } catch (_) {
      throw ApiException(
        0,
        'Connexion impossible. Vérifiez votre réseau et réessayez.',
      );
    }

    // L'API répond en UTF-8 ; un octet invalide ne doit jamais faire planter l'application.
    final text = utf8.decode(response.bodyBytes, allowMalformed: true);
    final data = text.isEmpty ? null : jsonDecode(text);
    if (response.statusCode >= 200 && response.statusCode < 300) return data;

    var message = 'Une erreur est survenue (${response.statusCode}).';
    String? code;
    if (data is Map<String, dynamic>) {
      final m = data['message'];
      if (m is String) message = m;
      if (m is List && m.isNotEmpty) message = m.join('\n');
      code = data['code'] as String?;
    }
    if (response.statusCode == 401 && token != null) {
      message = 'Votre session a expiré. Reconnectez-vous.';
    }
    throw ApiException(response.statusCode, message, code);
  }
}
