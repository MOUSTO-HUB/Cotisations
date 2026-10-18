# Cotisations

Plateforme de gestion des cotisations pour les familles, les communautés villageoises et les tontines. Pays pilote : Guinée, puis Sénégal et Côte d'Ivoire.

- Cahier des charges : [docs/cahier-des-charges.md](docs/cahier-des-charges.md)
- Consignes de développement : [CLAUDE.md](CLAUDE.md)

## Démarrer en local

Prérequis : Node.js 24, Docker.

```bash
docker compose up -d
cd backend
cp .env.example .env
npm install
npx prisma migrate dev
npm run start:dev
```

L'API répond sur http://localhost:3400 (point de santé : `GET /health`).

## Structure

| Dossier | Contenu | État |
| --- | --- | --- |
| `backend/` | API NestJS + Prisma + PostgreSQL | En cours |
| `mobile/` | Application Flutter | À venir |
| `web/` | Application web trésorier (Next.js) | Lot 2 |
| `docs/` | Cahier des charges et décisions | |
