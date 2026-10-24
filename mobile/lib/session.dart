import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api/api_client.dart';

/// Session de l'utilisateur : jeton conservé sur le téléphone, profil.
class Session extends ChangeNotifier {
  Session(this.api);

  final ApiClient api;
  Map<String, dynamic>? user;

  bool get isLoggedIn => api.token != null && user != null;

  static const _tokenKey = 'session_token';

  /// Reprend la session enregistrée, si elle est encore valide.
  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_tokenKey);
    if (saved == null) return;
    api.token = saved;
    try {
      user = await api.get('/me') as Map<String, dynamic>;
    } on ApiException {
      api.token = null;
      await prefs.remove(_tokenKey);
    }
    notifyListeners();
  }

  /// Envoie le code SMS ; renvoie le code en développement (devCode).
  Future<String?> requestCode(String phone) async {
    final res = await api.post('/auth/otp/request', {'phone': phone})
        as Map<String, dynamic>;
    return res['devCode'] as String?;
  }

  /// Vérifie le code. Lève ApiException(code: FULL_NAME_REQUIRED) à la
  /// première connexion si le nom manque.
  Future<void> verify(String phone, String code, {String? fullName}) async {
    final res = await api.post('/auth/otp/verify', {
      'phone': phone,
      'code': code,
      if (fullName != null && fullName.isNotEmpty) 'fullName': fullName,
      'device': 'mobile',
    }) as Map<String, dynamic>;
    api.token = res['token'] as String;
    user = res['user'] as Map<String, dynamic>;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, api.token!);
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await api.post('/auth/logout');
    } on ApiException {
      // déjà expirée : on nettoie quand même
    }
    api.token = null;
    user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    notifyListeners();
  }
}
