# Cotisations — consignes de développement

Plateforme de gestion des cotisations pour trois types de groupes : familles, communautés villageoises / associations, et tontines rotatives. Pays pilote : Guinée (GNF), puis Sénégal et Côte d'Ivoire (XOF).

Le cahier des charges complet est dans [docs/cahier-des-charges.md](docs/cahier-des-charges.md). Il fait foi : en cas de doute sur une règle métier, s'y référer (sections 4 et 5) plutôt que d'inventer. Si une règle manque ou est ambiguë, poser la question au lieu de supposer.

## Stack

- `backend/` : API NestJS (TypeScript, Node.js 24), Prisma, PostgreSQL 16, tests Jest.
- `mobile/` : application Flutter (pas encore créée — Flutter n'est pas installé sur le poste).
- `web/` : application web trésorier en Next.js (lot 2, pas encore créée).
- `docker-compose.yml` à la racine : PostgreSQL local.

## Commandes

```bash
docker compose up -d                 # démarre PostgreSQL (port 5433)
cd backend
npm install
npx prisma migrate dev               # applique les migrations
npm run start:dev                    # API sur http://localhost:3400, documentation interactive sur /docs
npm test                             # tests unitaires
npm run test:e2e                     # tests bout en bout
npm run lint
```

## Règles non négociables

1. **Argent en entiers.** Les montants sont des entiers dans l'unité de la devise (GNF et XOF n'ont pas de centimes). Type `BigInt` en base, `bigint` en TypeScript. Jamais de `number` à virgule ni de `Float`/`Decimal` pour un montant.
2. **Dates.** Stockées en UTC. Les échéances se calculent dans le fuseau du groupe (`Africa/Conakry` par défaut).
3. **Écritures financières immuables.** Un paiement ou un mouvement n'est jamais supprimé ni modifié : une erreur s'annule par une contre-écriture avec motif (RG-C4).
4. **Transactions + audit.** Toute opération financière s'exécute dans une transaction Prisma et écrit une ligne dans le journal d'audit (qui, quoi, quand).
5. **La plateforme ne détient pas les fonds** en V1 : elle trace les paiements (espèces saisies par le trésorier, puis Mobile Money via une société de paiement à choisir).
6. **Paramètres de tontine verrouillés** après le premier versement (sauf vote unanime).
7. **Données sensibles.** Pas de diagnostic médical stocké pour les collectes de solidarité, seulement un motif général. Codes PIN et OTP toujours hachés.

## Conventions

- Code, noms de variables, tables et routes en anglais ; messages d'erreur renvoyés à l'utilisateur, interface et documentation en français.
- Un module NestJS par domaine : `auth`, `users`, `groups`, `tontines`, `contributions`, `cashbox`, `projects`, `solidarity`, `notifications`, `audit`.
- La logique métier pure (calculs de tontine, imputation des paiements, pénalités) vit dans des fonctions sans dépendance à la base, testées unitairement. Les services NestJS orchestrent.
- Validation des entrées avec `class-validator` sur les DTO.
- Chaque nouvelle règle métier (RG-xx du cahier des charges) a au moins un test qui la nomme dans sa description.
- Toutes les routes exigent une session (garde globale `AuthGuard`) ; une route publique se marque `@Public()`. L'utilisateur connecté s'obtient avec `@CurrentAuth()`.
- Sessions : jeton opaque aléatoire (`Authorization: Bearer <jeton>`), seule son empreinte SHA-256 est stockée, révocable à la déconnexion. Pas de JWT.
- Numéros de téléphone toujours passés par `normalizePhone` (format E.164, Guinée par défaut).
- En développement, `OTP_DEV_ECHO=true` dans `backend/.env` renvoie le code SMS dans la réponse (`devCode`) ; ignoré si `NODE_ENV=production`, forcé à `false` dans les tests.
- Swagger (`@nestjs/swagger` v11, compatible NestJS 11) : les formulaires sont déduits des DTO par le plugin déclaré dans `nest-cli.json`.
- Le SMS passe par l'abstraction `SmsSender` ; en développement, `ConsoleSmsSender` affiche le code dans la console de l'API.
- Tests e2e : base dédiée `cotisations_test` (port 5433), jamais effacée ; chaque test crée ses propres données (numéros aléatoires). Ne jamais lancer `prisma migrate reset` ni supprimer de données sans l'accord explicite de l'utilisateur.
- Montants dans l'API : toujours des chaînes d'entiers (`"50000"`), via `AMOUNT_PATTERN` / `parseAmount` (`src/common/money.ts`).
- Dates d'échéance : chaînes `AAAA-MM-JJ` manipulées avec `src/common/calendar.ts` (`toDbDate` / `fromDbDate` pour les colonnes `@db.Date`). Le statut « en retard » et la confirmation automatique après 7 jours se calculent à la lecture, rien n'est stocké.
- Saisie de paiement : clé d'idempotence obligatoire, verrou `SELECT … FOR UPDATE` sur les échéances, compteur de reçus par groupe incrémenté dans la transaction.
- Migrations : `npx prisma migrate dev --name <nom>` ; si Prisma refuse (« non-interactive », à cause d'un avertissement), générer le SQL avec `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` dans `prisma/migrations/<horodatage>_<nom>/migration.sql`, le relire (aucun DROP sans accord), puis `npx prisma migrate deploy` et `npx prisma generate`.
- Configuration commune de l'API (validation, filtre d'erreurs Prisma) dans `src/app.setup.ts` (`configureApp`), utilisée par `main.ts` et les tests e2e.
- Règles financières d'un groupe (délai de grâce, seuil de double validation) : `readGroupRules` dans `src/groups/domain/group-rules.ts`, jamais lues directement depuis le JSON.
- Commits au format conventionnel (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), en français ou en anglais, une fonctionnalité par commit.

## Ordre de développement (section 16 du cahier des charges)

1. Socle API : configuration, base, Docker, point de santé. ✅
2. Moteur de tontine : calendrier, pot, tours, date de fin, avec tests. ✅
3. Comptes : inscription par téléphone + OTP (SMS simulé en développement), profil, PIN, déconnexion. ✅
4. Groupes, membres et rôles (invitation, membres sans smartphone, au moins un président, audit). ✅
5. Cotisations, échéances, paiements en espèces, reçus, confirmation / contestation, annulation par contre-écriture, solde des caisses. ✅
6. Caisses, mouvements, double validation, journal d'audit (dépenses, seuil par groupe, justificatifs, contre-écritures, consultation de l'audit). ✅
7. Projets budgétés et collectes de solidarité.
8. Application mobile Flutter.
9. Paiement Mobile Money (après choix de la société de paiement, section 15).

Mettre à jour cette liste (✅) quand une étape est terminée.
