# Application mobile Cotisations (Flutter)

Application des membres et des trésoriers : connexion par SMS, mes groupes, mes échéances, confirmation des paiements, caisses, membres, calendrier des tontines, saisie d'un paiement en espèces (trésorier).

## Lancer

Prérequis : Flutter (stable) et l'API qui tourne (`backend/`, port 3400).

```bash
cd mobile
flutter pub get
flutter run -d chrome                                         # navigateur
flutter run -d emulator --dart-define=API_URL=http://10.0.2.2:3400   # émulateur Android
flutter test
```

`API_URL` vaut `http://localhost:3400` par défaut. Sur un téléphone réel, utilisez l'adresse IP du PC sur le réseau local (ex. `http://192.168.1.20:3400`).

En développement, si l'API a `OTP_DEV_ECHO=true`, le code SMS s'affiche sur l'écran de connexion.
