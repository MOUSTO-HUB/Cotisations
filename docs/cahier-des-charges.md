# Cahier des charges — Plateforme de gestion des cotisations

Version du 18 octobre 2026 · Document de référence : https://claude.ai/code/artifact/62290ee5-a939-4307-8978-eb97d173d7ba

## 1. Contexte et objectifs

La plateforme remplace le cahier papier et les groupes WhatsApp par un registre partagé, transparent et vérifiable des cotisations d'un groupe. Elle vise trois usages : la caisse familiale, la caisse de développement d'un village ou d'une association, et la tontine rotative. Le lancement vise la Guinée, le Sénégal et la Côte d'Ivoire, avec la Guinée comme pays pilote.

**Problèmes à résoudre**

- Manque de transparence : les membres ne voient pas qui a payé, combien reste en caisse, ni où va l'argent.
- Erreurs et litiges : calculs manuels, reçus perdus, oublis de tour dans les tontines.
- Dispersion géographique : membres de la diaspora qui cotisent à distance.
- Suivi des projets communs (puits, école, mosquée, église, route) sans rapport de dépenses ni justificatifs.

**Objectifs mesurables (12 mois après lancement)**

| Objectif | Indicateur | Cible |
| --- | --- | --- |
| Adoption | Groupes actifs | 500 |
| Transparence | Part des cotisations avec reçu numérique | 100 % |
| Ponctualité | Taux de cotisations payées à l'échéance | > 85 % |
| Paiement à distance | Part des paiements via Mobile Money | > 60 % |
| Satisfaction | Note moyenne des trésoriers | ≥ 4/5 |

## 2. Périmètre et types de groupes

Un même socle (membres, cotisations, caisse, reçus, rapports) sert trois modèles de groupe, chacun activant des règles propres.

| Type de groupe | Taille typique | Logique financière | Fonctions spécifiques |
| --- | --- | --- | --- |
| Famille | 5 à 50 membres | Caisse commune alimentée régulièrement ou ponctuellement | Cotisations événementielles (décès, mariage, baptême, maladie), aide à un membre, fonds de solidarité |
| Communauté villageoise / association | 50 à 2 000 membres | Caisse de développement, cotisation annuelle par foyer ou par membre | Projets communs avec budget, jalons, dépenses justifiées, votes, sections (village / diaspora) |
| Tontine rotative | 5 à 40 membres | Chaque membre verse un montant fixe par période ; un bénéficiaire reçoit la totalité à tour de rôle | Calendrier des tours, tirage au sort ou ordre fixé, enchères, pénalités, garanties |

**Dans le périmètre** : application mobile (Android prioritaire, iOS), application web pour les trésoriers, back-office administrateur, intégration Mobile Money, notifications SMS / WhatsApp / push.

**Hors périmètre (version 1)** : octroi de crédit par la plateforme, épargne rémunérée, conservation des fonds par la plateforme (voir section 7, modèle de détention des fonds).

### Pays de lancement

Trois pays et deux monnaies au départ, avec la Guinée comme pays pilote (lot 1) puis le Sénégal et la Côte d'Ivoire (lot 2) : le Sénégal et la Côte d'Ivoire partagent le franc CFA (XOF) et le régulateur BCEAO ; la Guinée a sa propre monnaie (GNF) et son propre régulateur (BCRG), ce qui demande une intégration et une analyse juridique distinctes.

| Pays | Monnaie | Opérateurs Mobile Money à intégrer | Régulateur paiement | Loi sur les données personnelles |
| --- | --- | --- | --- | --- |
| Guinée | Franc guinéen (GNF) | Orange Money, MTN Mobile Money | BCRG | Loi L/2016/037/AN |
| Sénégal | Franc CFA (XOF) | Wave, Orange Money, Free Money | BCEAO | Loi 2008-12 (CDP) |
| Côte d'Ivoire | Franc CFA (XOF) | Orange Money, MTN MoMo, Moov Money, Wave | BCEAO | Loi 2013-450 (ARTCI) |

Liste des opérateurs et textes à confirmer par l'agrégateur retenu et par un juriste local avant le lot 1.

L'extension aux autres pays de la zone franc CFA (Mali, Burkina Faso, Bénin, Togo, Niger, puis zone XAF : Cameroun, Gabon, Congo) se fait sans changement de monnaie en zone XOF, et avec ajout de la devise XAF et du régulateur BEAC en Afrique centrale.

## 3. Acteurs et rôles

Les droits sont définis par groupe : une même personne peut être trésorière de sa tontine et simple membre de la caisse familiale.

| Rôle | Qui | Peut faire | Ne peut pas faire |
| --- | --- | --- | --- |
| Super-administrateur | Équipe plateforme | Gérer les comptes, la conformité, les litiges signalés, la facturation | Modifier les écritures d'un groupe |
| Président / créateur du groupe | Chef de famille, chef de village, responsable de tontine | Créer le groupe, fixer les règles, nommer les rôles, clôturer un cycle | Valider seul une dépense au-delà du seuil |
| Trésorier | Membre désigné | Enregistrer les paiements en espèces, saisir les dépenses, émettre les reçus, verser le pot | Supprimer une écriture (seulement l'annuler avec motif) |
| Secrétaire | Membre désigné | Gérer les membres, les réunions, les procès-verbaux, les annonces | Toucher aux finances |
| Commissaire aux comptes / contrôleur | 1 ou 2 membres | Consulter tout, valider les dépenses (double validation), exporter | Saisir des écritures |
| Membre | Toute personne inscrite | Payer, voir son historique et la caisse, voter, commenter | Voir le détail des autres membres si le groupe l'interdit |
| Contributeur externe | Donateur, parrain, ressortissant non-membre | Faire un don ciblé à un projet, recevoir un reçu | Voter, voir les données des membres |

## 4. Exigences fonctionnelles

Dix modules ; la priorité suit la méthode MoSCoW (M = indispensable au MVP, S = souhaitable en V1, C = plus tard).

### 4.1 Comptes et authentification

- (M) Inscription par numéro de téléphone + code OTP par SMS ; e-mail facultatif.
- (M) Code PIN à 4–6 chiffres et déverrouillage biométrique.
- (M) Profil : nom, photo, village d'origine, pays de résidence, numéro Mobile Money.
- (S) Vérification d'identité (pièce d'identité) pour les trésoriers et les tontines à gros montants.

### 4.2 Gestion des groupes et des membres

- (M) Création d'un groupe avec choix du type (famille, communauté, tontine) et d'un modèle de règles pré-rempli.
- (M) Invitation par lien, QR code ou numéro ; ajout manuel de membres sans smartphone (gérés par le trésorier).
- (M) Attribution des rôles ; historique des changements de rôle.
- (S) Sous-groupes : foyers, quartiers, sections diaspora (Paris, Abidjan, Dakar…), chacun avec son responsable.
- (S) Règlement intérieur attaché au groupe, accepté par chaque membre à l'adhésion.

### 4.3 Cotisations

- (M) Types : récurrente (hebdomadaire, mensuelle, annuelle), ponctuelle (événement), libre (don).
- (M) Montant fixe, montant par foyer, ou montant différencié par catégorie (résident / diaspora, actif / retraité).
- (M) Échéancier généré automatiquement ; statut par membre : à payer, payé, partiel, en retard, exonéré.
- (M) Paiement Mobile Money in-app ; saisie manuelle des paiements en espèces par le trésorier, avec confirmation du membre.
- (M) Reçu numérique horodaté et numéroté pour chaque paiement (PDF + lien partageable).
- (S) Paiement anticipé de plusieurs échéances ; paiement pour le compte d'un autre membre (un fils pour son père).
- (S) Relances automatiques avant et après échéance.

### 4.4 Tontine rotative

- (M) Paramètres obligatoires à la création : montant à verser par chaque membre, nombre de membres, période de versement (jour, semaine, mois, année) et date de début ; le montant du pot, le nombre de tours et la date de fin sont calculés automatiquement (détail ci-dessous).
- (M) Ordre des bénéficiaires : fixé par le président, tirage au sort tracé dans l'application, ou choix par enchères.
- (M) Calendrier visible de tous : qui reçoit quand, montant attendu, avancement des versements du tour.
- (M) Déclaration du versement du pot au bénéficiaire, avec accusé de réception de celui-ci.
- (S) Parts multiples (un membre détient 2 parts) et demi-parts partagées entre deux membres.
- (S) Échange de tour entre deux membres, avec accord des deux et validation du président.
- (S) Tontine à enchères : le membre qui cède le plus gros escompte reçoit en premier ; l'escompte est redistribué ou mis en caisse.
- (C) Caution / garantie : retenue sur le pot des premiers bénéficiaires, restituée en fin de cycle.

**Paramétrage d'une tontine**

| Paramètre | Saisi ou calculé | Valeurs possibles | Exemple |
| --- | --- | --- | --- |
| Nombre de membres (parts) | Saisi | 2 à 100 | 12 |
| Montant à verser par membre et par période | Saisi | Montant libre en GNF ou en FCFA | 500 000 GNF |
| Période de versement | Saisi | Quotidienne, hebdomadaire, mensuelle, annuelle ; personnalisée (ex. tous les 15 jours) | Mensuelle |
| Jour de versement | Saisi | Chaque jour, tel jour de la semaine, tel jour du mois, telle date de l'année | Le 5 de chaque mois |
| Date de début | Saisi | Toute date future | 5 janvier |
| Ordre des bénéficiaires | Saisi | Ordre fixé, tirage au sort, enchères | Tirage au sort |
| Montant du pot par tour | Calculé | Montant par membre × nombre de membres | 6 000 000 GNF |
| Nombre de tours | Calculé | Égal au nombre de parts | 12 |
| Durée du cycle et date de fin | Calculé | Nombre de tours × période | 12 mois, fin le 5 décembre |

Autres exemples : une tontine quotidienne de marché de 30 membres à 10 000 GNF par jour verse un pot de 300 000 GNF chaque jour pendant 30 jours ; une tontine annuelle de 5 membres à 2 000 000 GNF dure 5 ans.

Une fois le premier versement effectué, ces paramètres sont verrouillés pour tout le cycle ; seul un vote unanime permet de les changer.

### 4.5 Projets communs et réalisations

- (M) Fiche projet : description, budget, objectif de collecte, dates, responsable, photos.
- (M) Barre de progression de la collecte ; liste des contributeurs (nominative ou anonyme selon réglage).
- (M) Dépenses rattachées au projet avec justificatif (photo de facture, devis).
- (S) Jalons avec photos d'avancement (fondations, toiture, inauguration).
- (S) Appel de fonds ciblé ouvert aux contributeurs externes.
- (C) Carte des réalisations du village.

**Budgétisation et cotisation d'un projet**

Un projet suit six étapes, chacune visible de tous les membres :

1. Proposé : un membre du bureau décrit le besoin (puits, salle de classe, piste, mosquée, église, centre de santé).
2. Budgétisé : budget détaillé par poste (matériaux, main-d'œuvre, transport, imprévus), devis joints.
3. Voté : validation du budget et du mode de cotisation par l'assemblée ou le bureau.
4. En collecte : appel à cotisation ouvert jusqu'à l'objectif.
5. En réalisation : dépenses saisies avec justificatifs, photos d'avancement par jalon.
6. Achevé : rapport final (prévu, collecté, dépensé, reliquat) diffusé à tous.

- (M) Objectif de collecte = budget total − fonds déjà en caisse affectés au projet − subventions ou dons annoncés.
- (M) Mode de cotisation au choix : montant fixe par membre ou par foyer (objectif ÷ nombre de cotisants, proposé automatiquement), montant différencié (résident / diaspora), ou contribution libre.
- (M) Échéancier de la cotisation projet : en une fois ou en plusieurs versements (ex. 3 versements mensuels), avec relances.
- (M) Suivi budgétaire par poste : prévu, engagé, dépensé, écart ; alerte en cas de dépassement de plus de 10 %.
- (S) Révision du budget en cours de projet, soumise à un nouveau vote.
- (S) Plusieurs projets en parallèle, chacun avec sa propre caisse.

**Collectes de solidarité (malade grave, décès, sinistre)**

- (M) Ouverture rapide d'une collecte d'urgence par le président ou un membre du bureau, en moins d'une minute : bénéficiaire, motif, montant cible, date limite.
- (M) Montant suggéré par membre ou contribution libre ; collecte ouverte aux contributeurs externes et à la diaspora.
- (M) Notification immédiate à tous les membres par push et SMS, avec relance avant la date limite.
- (M) Versement au bénéficiaire, à sa famille ou directement à l'hôpital ou à la pharmacie, avec preuve (reçu, facture) visible des contributeurs.
- (M) Confidentialité : le diagnostic n'est jamais affiché, seul un motif général (« raison de santé »).
- (S) Fonds de solidarité permanent alimenté par une part de chaque cotisation (ex. 10 %), pour débloquer une aide immédiate avant la fin de la collecte.
- (S) Barème d'aide défini par le règlement (ex. montant fixe en cas de décès d'un membre, plafond annuel par membre).

### 4.6 Caisse, dépenses et comptabilité

- (M) Solde en temps réel par caisse (caisse générale, caisse de solidarité, caisse projet).
- (M) Journal des mouvements : entrée, sortie, catégorie, auteur, justificatif, date.
- (M) Double validation des dépenses au-delà d'un seuil paramétrable.
- (M) Écritures non supprimables : toute correction passe par une contre-écriture motivée.
- (S) Rapprochement avec les relevés Mobile Money.
- (S) Clôture d'exercice et report du solde.

### 4.7 Gouvernance et vie du groupe

- (S) Votes et sondages (choix d'un projet, validation du budget, admission d'un membre), avec quorum.
- (S) Réunions : convocation, ordre du jour, liste de présence, procès-verbal.
- (S) Fil d'annonces et messagerie du groupe.

### 4.8 Notifications

- (M) Push et SMS : rappel d'échéance, paiement reçu, c'est votre tour, nouvelle dépense.
- (S) WhatsApp Business pour les rappels et reçus.
- (S) Résumé mensuel envoyé à tous les membres.

### 4.9 Rapports et exports

- (M) Tableau de bord du groupe : collecté, dépensé, solde, taux de paiement, retardataires.
- (M) Relevé individuel de chaque membre.
- (S) Export PDF et Excel ; rapport annuel prêt à lire en assemblée générale.

### 4.10 Back-office plateforme

- (M) Gestion des utilisateurs et groupes, suspension, support.
- (M) Suivi des transactions et des échecs de paiement.
- (S) Traitement des litiges signalés ; statistiques globales ; gestion des abonnements.

## 5. Règles de gestion

Toutes les règles ci-dessous sont des paramètres du groupe, fixés à la création et modifiables seulement par vote ou par le président selon le règlement.

**Tontine**

- RG-T1 : montant du pot = montant par part × nombre de parts actives du tour (hors escompte d'enchère).
- RG-T2 : un tour est « complet » quand toutes les parts ont payé ; le pot n'est déclaré versé qu'après confirmation du bénéficiaire.
- RG-T3 : un membre ayant déjà bénéficié reste tenu de cotiser jusqu'à la fin du cycle ; son statut de défaillance est visible du groupe.
- RG-T4 : le tirage au sort est généré par le serveur, horodaté et archivé ; il ne peut être relancé.
- RG-T5 : un nouveau membre ne peut rejoindre une tontine qu'en début de cycle, sauf reprise de la part d'un sortant.
- RG-T6 : sortie anticipée d'un membre : si non bénéficiaire, remboursement ou transfert de part ; si déjà bénéficiaire, dette envers le groupe.

**Retards et pénalités**

- RG-P1 : délai de grâce paramétrable (par défaut 3 jours).
- RG-P2 : pénalité fixe ou en pourcentage, versée à la caisse ; le président peut l'annuler avec motif tracé.
- RG-P3 : après N retards (paramétrable), alerte au bureau et suspension possible des droits de vote ou du tour.

**Cotisations et caisse**

- RG-C1 : un paiement en espèces saisi par le trésorier reste « en attente » jusqu'à confirmation du membre (ou 7 jours sans contestation).
- RG-C2 : un paiement partiel est imputé à l'échéance la plus ancienne.
- RG-C3 : un membre exonéré (malade, étudiant, âgé) l'est par décision tracée, avec date de fin.
- RG-C4 : aucune écriture n'est supprimée ; seule une contre-écriture motivée annule une erreur.

**Projets et dépenses**

- RG-D1 : toute dépense au-delà du seuil (ex. 50 000 FCFA ou 750 000 GNF) exige la validation du trésorier et d'un contrôleur.
- RG-D2 : une dépense sans justificatif est marquée « à justifier » et signalée dans le rapport.
- RG-D3 : les fonds d'un projet ne peuvent financer un autre projet sans vote.
- RG-D4 : un projet clôturé avec excédent renvoie le reliquat à la caisse générale, sauf décision contraire.

**Solidarité**

- RG-S1 : une collecte d'urgence peut être ouverte par un seul membre du bureau, mais tout versement au bénéficiaire exige la validation d'un second membre.
- RG-S2 : une avance sur le fonds de solidarité est remboursée en priorité par la collecte qui suit.
- RG-S3 : l'excédent d'une collecte revient au bénéficiaire ou au fonds de solidarité, selon le règlement du groupe.
- RG-S4 : la cotisation à une collecte de solidarité est volontaire, sauf si le règlement la rend obligatoire (ex. décès d'un membre).

## 6. Exigences non fonctionnelles

L'application doit fonctionner sur un téléphone Android d'entrée de gamme, en zone rurale à faible connexion, pour des utilisateurs peu lettrés.

| Domaine | Exigence |
| --- | --- |
| Accessibilité terrain | Android 8+, 2 Go de RAM, application < 25 Mo ; mode hors-ligne pour la saisie du trésorier avec synchronisation différée |
| Faible littératie | Icônes explicites, gros boutons, montants en chiffres lisibles, messages vocaux optionnels |
| Accès sans smartphone | Canal USSD ou SMS pour consulter son solde et sa prochaine échéance (V2) |
| Langues | Français et anglais au lancement ; langues locales ajoutables : pular, malinké, soussou (Guinée), wolof (Sénégal), dioula, baoulé (Côte d'Ivoire) |
| Devises | FCFA (XOF) et franc guinéen (GNF) ; une devise par groupe ; montants sans décimales avec séparateurs de milliers (les sommes en GNF sont élevées) ; contributions diaspora en EUR ou USD converties avec taux affiché ; XAF ajouté lors de l'extension en Afrique centrale |
| Sécurité | Chiffrement TLS 1.2+ en transit et AES-256 au repos ; PIN + biométrie ; session expirée après 15 min d'inactivité |
| Traçabilité | Journal d'audit immuable de toute action financière (qui, quoi, quand, depuis quel appareil) |
| Données personnelles | Conformité aux lois locales (loi guinéenne L/2016/037/AN, loi sénégalaise 2008-12, loi ivoirienne 2013-450) et au RGPD pour les membres en Europe ; consentement explicite |
| Performance | Ouverture du tableau de bord < 2 s en 3G ; 10 000 utilisateurs simultanés en V1 |
| Disponibilité | 99,5 % mensuelle ; sauvegarde quotidienne, rétention 30 jours, test de restauration trimestriel |
| Fiabilité des paiements | Idempotence des transactions, aucune double imputation, rapprochement automatique quotidien |

## 7. Architecture technique et paiements

Architecture en trois couches (applications, API et services métier, intégrations externes) ; en V1, la plateforme ne détient jamais l'argent : elle déclenche et trace les paiements réalisés chez l'opérateur.

```
  Application mobile      Web trésorier/admin     SMS · USSD · WhatsApp
  (Flutter)               (React · Next.js)       (sans smartphone)
         |                      |                      |
          v                     v                     v
  +------------------------------------------------------------+
  |  API REST · authentification OTP + JWT · journal d'audit   |
  +------------------------------------------------------------+
                                |
  +------------------------------------------------------------+
  |  Services métier (NestJS)                                  |
  |  Groupes/membres · Cotisations/caisse · Tontines · Projets |
  +------------------------------------------------------------+
         |                      |                      |
         v                      v                      v
     Données              Notifications        Agrégateur de paiement
  PostgreSQL·Redis      SMS·push·WhatsApp              |
                                                       v  paiement + webhook
                                            Opérateurs Mobile Money
                                         (Orange Money, MTN, Wave, Moov)
```

Chaque paiement part de l'application vers l'agrégateur, qui débite le membre chez son opérateur puis confirme par webhook ; seule cette confirmation passe le paiement au statut « payé ».

| Composant | Choix proposé (à confirmer avec le prestataire) | Justification |
| --- | --- | --- |
| Mobile | Flutter (Android + iOS, une seule base de code) | Léger, bon support hors-ligne (base locale SQLite) |
| Web | React / Next.js | Tableaux de bord et exports pour trésoriers |
| Back-end | NestJS (Node.js, TypeScript) — retenu, voir section 16 | Compétences disponibles localement |
| Base de données | PostgreSQL + Redis (cache, files d'attente) | Transactions fiables pour les écritures financières |
| Fichiers | Stockage objet compatible S3 | Reçus PDF, justificatifs, photos de projets |
| Hébergement | Cloud avec région proche (Europe ou Afrique), conteneurs Docker | Coût maîtrisé, montée en charge |
| Paiement | Agrégateur multi-opérateurs (CinetPay, PayDunya, Flutterwave ou équivalent) | Un seul contrat pour les trois pays ; vérifier en priorité la couverture de la Guinée (Orange Money, MTN), moins bien servie que la zone XOF |
| SMS / OTP | Agrégateur SMS local ou Africa's Talking / Twilio | Couverture et coût par SMS |

**Modèle de détention des fonds** : deux options. (A) Chaque cotisation est versée directement sur le compte Mobile Money du groupe ou du trésorier ; la plateforme ne fait que tracer. (B) Les fonds sont placés chez un partenaire agréé (banque, établissement de monnaie électronique) en compte de cantonnement. L'option A est recommandée pour la V1 ; l'option B exige un avis juridique (BCEAO pour le Sénégal et la Côte d'Ivoire, BCRG pour la Guinée).

## 8. Modèle de données principal

Douze entités couvrent les trois types de groupe ; le type de groupe active ou non les entités Tontine et Projet.

| Entité | Attributs clés | Relations |
| --- | --- | --- |
| Utilisateur | id, téléphone, nom, PIN (haché), langue, pays, numéro Mobile Money | Membre de 0..n groupes |
| Groupe | id, type (famille / communauté / tontine), nom, devise, règles (JSON), statut | 1..n membres, 1..n caisses |
| Adhésion | utilisateur, groupe, rôle, catégorie, date d'entrée, statut | Lien Utilisateur ↔ Groupe |
| Caisse | id, groupe, nom (générale, solidarité, projet), solde calculé | Reçoit les mouvements |
| Plan de cotisation | groupe, type, montant, périodicité, catégories, date début / fin | Génère les échéances |
| Échéance | membre, plan, montant dû, date, statut | Soldée par 0..n paiements |
| Paiement | id, membre, montant, canal (Mobile Money / espèces / virement), réf. opérateur, statut, reçu | Impute 1..n échéances |
| Mouvement | caisse, sens (entrée / sortie), montant, catégorie, auteur, justificatif, validations | Écriture du journal |
| Tontine (cycle) | groupe, montant par part, périodicité, mode d'ordre, date début | 1..n tours |
| Tour | cycle, numéro, date, bénéficiaire(s), montant du pot, statut, preuve de versement | Lié aux échéances du tour |
| Projet | groupe, titre, budget, objectif, jalons, photos, statut | 1 caisse projet, 0..n dépenses |
| Vote | groupe, question, options, quorum, date limite, résultats | 0..n bulletins |

Un journal d'audit transversal enregistre toute création ou modification sur Paiement, Mouvement, Tour et Adhésion.

## 9. Lotissement, planning et livrables

Le projet se livre en trois lots sur environ 9 mois ; le MVP vise une tontine et une caisse familiale fonctionnelles en 4 mois, testées avec 10 groupes pilotes en Guinée.

| Lot | Durée indicative | Contenu | Critère de passage au lot suivant |
| --- | --- | --- | --- |
| Lot 0 — Cadrage et maquettes | 4 semaines | Entretiens en Guinée (Conakry et au moins un village de l'intérieur) avec 10 trésoriers et présidents de tontine, parcours utilisateurs, maquettes Figma, choix de l'agrégateur de paiement | Maquettes validées par les groupes pilotes |
| Lot 1 — MVP | 12 semaines | Comptes OTP, groupes et membres, cotisations récurrentes, tontine (ordre fixé et tirage), saisie espèces, Mobile Money en Guinée (Orange Money, MTN, en GNF), reçus, rappels SMS, tableau de bord | 10 groupes pilotes actifs 2 cycles sans litige non résolu |
| Lot 2 — V1 publique | 10 semaines | Projets communs, dépenses avec double validation, enchères et échanges de tours, pénalités, exports PDF/Excel, application web trésorier, ouverture du Sénégal et de la Côte d'Ivoire (XOF, Wave, Orange Money, MTN, Moov, Free Money) | 100 groupes actifs, taux de paiement à l'échéance > 80 % |
| Lot 3 — Extensions | 10 semaines | Votes, réunions et PV, sous-groupes diaspora, WhatsApp, multi-devises, USSD, langues locales | — |

**Livrables attendus du prestataire**

- Code source (applications mobile, web, API) sur un dépôt appartenant au porteur du projet.
- Documentation technique : architecture, API, procédure de déploiement, plan de reprise.
- Guide utilisateur illustré (trésorier, membre) et vidéos courtes en langue locale.
- Cahier de recette et rapport de tests (dont tests de charge et de sécurité).
- Applications publiées sur Google Play et App Store sous le compte du porteur.
- Garantie corrective de 3 mois après la mise en production, puis contrat de maintenance.

## 10. Modèle économique, risques et recette

**Modèle économique (options à arbitrer)**

| Option | Principe | Avantage | Limite |
| --- | --- | --- | --- |
| Freemium | Gratuit jusqu'à 20 membres, abonnement au-delà (ex. 2 000–5 000 FCFA ou 30 000–75 000 GNF / mois / groupe) | Adoption rapide | Revenus lents au début |
| Commission sur transaction | Petit pourcentage (ex. 0,5–1 %) sur les paiements Mobile Money | Revenu proportionnel à l'usage | Perçu comme une taxe sur la solidarité |
| Offre associations / ONG | Licence annuelle avec rapports avancés et support dédié | Clients solvables | Cycle de vente long |
| Partenariat IMF / banque | Mise en relation des groupes avec des produits d'épargne ou de crédit | Revenu à forte valeur | Exige un cadre réglementaire solide |

**Principaux risques**

| Risque | Impact | Mesure de maîtrise |
| --- | --- | --- |
| Qualification d'établissement de paiement si la plateforme détient les fonds | Bloquant (BCEAO, BCRG) | V1 sans détention : l'argent transite vers le compte Mobile Money du trésorier ou un compte séquestre d'un partenaire agréé ; avis juridique avant le lot 1 |
| Fraude ou détournement par un trésorier | Élevé | Double validation, transparence totale des mouvements, confirmation des paiements par les membres |
| Membre défaillant après avoir touché le pot | Élevé (tontine) | Historique de fiabilité, caution, ordre favorisant les membres fiables |
| Faible adoption (habitude du cahier, méfiance) | Moyen | Ambassadeurs locaux, mode espèces, interface en langue locale, gratuité initiale |
| Connectivité faible | Moyen | Mode hors-ligne, SMS, légèreté de l'application |
| Dépendance à un opérateur de paiement | Moyen | Agrégateur multi-opérateurs, couche d'abstraction des paiements |

**Critères de recette**

- [ ] Un cycle complet de tontine de 10 membres et 10 tours se déroule sans erreur de calcul ni double paiement.
- [ ] Le solde de chaque caisse égale la somme des mouvements, vérifié par un script de contrôle.
- [ ] Un paiement Mobile Money interrompu (réseau coupé) ne crée ni doublon ni perte après reprise.
- [ ] Une saisie hors-ligne du trésorier se synchronise sans conflit au retour du réseau.
- [ ] Un membre sans formation paie sa cotisation en moins de 2 minutes (test avec 5 utilisateurs).
- [ ] Aucune faille critique ou haute au test d'intrusion.
- [ ] Le tableau de bord s'ouvre en moins de 2 s en 3G sur un téléphone de référence.

**Questions ouvertes**

- Quel agrégateur de paiement couvre la Guinée, et à quel coût par transaction ?
- La plateforme détient-elle les fonds à terme, ou reste-t-elle un outil de suivi ?
- Budget et développement interne ou prestataire externe ?

## 11. Parcours utilisateurs clés

Cinq parcours servent de référence aux maquettes et à la recette ; chacun doit se faire en moins de 2 minutes par un utilisateur non formé.

**Créer une tontine (président)**

1. Choisir « Nouvelle tontine ».
2. Saisir le montant par membre, le nombre de membres, la période et la date de début ; l'application affiche le pot, le nombre de tours et la date de fin.
3. Choisir l'ordre des bénéficiaires (fixé, tirage, enchères) et les pénalités.
4. Inviter les membres par lien WhatsApp, QR code ou numéro.
5. Lancer le tirage quand tous ont accepté ; le calendrier est publié à tous.

**Payer sa cotisation (membre)**

1. Recevoir le rappel SMS ou push la veille de l'échéance.
2. Ouvrir l'application, voir le montant dû, appuyer sur « Payer ».
3. Choisir Orange Money ou MTN, valider avec son code sur le téléphone.
4. Recevoir le reçu numérique ; le statut passe à « payé » pour tout le groupe.

**Recevoir le pot (bénéficiaire du tour)**

1. Être prévenu que son tour arrive (J-3).
2. Suivre en direct qui a payé dans le tour.
3. Recevoir le pot sur son compte Mobile Money (ou en espèces des mains du trésorier).
4. Confirmer la réception dans l'application ; le tour est clôturé.

**Lancer un projet communautaire (bureau)**

1. Créer la fiche projet, saisir le budget par poste, joindre les devis.
2. Soumettre au vote ; une fois validé, choisir le mode de cotisation.
3. Ouvrir la collecte ; suivre la barre de progression.
4. Saisir les dépenses avec photos de factures ; publier les photos d'avancement.
5. Clôturer et diffuser le rapport final.

**Collecte d'urgence pour un malade (bureau puis membres)**

1. Un membre du bureau ouvre la collecte : bénéficiaire, montant cible, date limite.
2. Tous les membres reçoivent un SMS et un push.
3. Chacun contribue en deux appuis.
4. Un second membre du bureau valide le versement à la famille ou à l'hôpital ; la preuve est publiée.

## 12. Budget estimatif

Le MVP en Guinée (lots 0 et 1) demande en ordre de grandeur 10 000 à 25 000 €, soit environ 100 à 250 millions GNF, avec une équipe ou une agence d'Afrique de l'Ouest ; les montants ci-dessous sont des estimations à remplacer par les devis reçus (taux approximatif : 1 € ≈ 10 000 GNF).

**Coûts de réalisation**

| Poste | Lot 0 + lot 1 (MVP) | Lot 2 (V1) | Remarque |
| --- | --- | --- | --- |
| Cadrage, maquettes (UX/UI) | 1 500 – 3 000 € | 1 000 – 2 000 € | Inclut les tests avec les groupes pilotes |
| Développement mobile + back-end | 7 000 – 18 000 € | 6 000 – 15 000 € | Selon agence locale, freelances ou équipe interne |
| Intégration paiement | 1 000 – 2 500 € | 1 000 – 2 000 € par pays | Dépend de la société de paiement retenue |
| Avis juridique (BCRG, données personnelles) | 500 – 1 500 € | 1 000 – 2 000 € | Sénégal et Côte d'Ivoire au lot 2 |

**Coûts de fonctionnement mensuels (phase pilote)**

| Poste | Estimation | Remarque |
| --- | --- | --- |
| Hébergement cloud + sauvegardes | 50 – 150 € / mois | Augmente avec le nombre de groupes |
| SMS (OTP, rappels) | 0,02 – 0,05 € par SMS | Poste qui grossit vite : privilégier le push et WhatsApp |
| Frais de transaction Mobile Money | 1 – 3 % par paiement | À négocier avec la société de paiement ; qui les paie (membre ou groupe) reste à décider |
| Comptes développeur stores | 25 $ une fois (Google), 99 $ / an (Apple) |  |
| Maintenance et support | 10 – 20 % du coût de développement par an |  |
| Ambassadeurs terrain | À définir | Prime par groupe actif recruté |

## 13. Organisation et équipe projet

Une équipe de 5 à 7 personnes suffit pour le MVP ; le porteur du projet garde la propriété du code, des comptes stores et du contrat de paiement.

| Rôle | Mission | Profil / temps |
| --- | --- | --- |
| Porteur du projet | Vision, décisions, budget, relations avec les partenaires | Vous ; temps partiel ou plein |
| Chef de projet / Product owner | Priorise les fonctionnalités, valide les livraisons, anime les tests terrain | 1 personne, idéalement basée en Guinée |
| Designer UX/UI | Maquettes simples pour des utilisateurs peu lettrés | Mission de 4 à 6 semaines |
| Développeur mobile (Flutter) | Application Android et iOS | 1 personne, plein temps |
| Développeur back-end | API, base de données, intégration paiement, sécurité | 1 personne, plein temps |
| Testeur / support | Recette, assistance aux groupes pilotes | 1 personne, temps partiel |
| Juriste | Conformité BCRG, données personnelles, conditions d'utilisation | Prestation ponctuelle |
| Ambassadeurs terrain | Recrutent et accompagnent les groupes (tontines de marché, associations de ressortissants) | 2 à 3 personnes, rémunérées au résultat |

Rituels : point hebdomadaire d'avancement, démonstration toutes les 2 semaines, retour terrain mensuel des groupes pilotes.

## 14. Comment démarrer : les 8 premières semaines

La première action est d'aller écouter 10 groupes réels en Guinée avant d'écrire une ligne de code ; la société de paiement se choisit en dernier, une fois les besoins confirmés.

**Semaines 1–2 : valider le besoin**

- [ ] Identifier 10 groupes pilotes : 4 tontines (dont 1 quotidienne de marché), 3 familles, 3 associations villageoises ou de ressortissants.
- [ ] Interroger le président et le trésorier de chacun : comment ils gèrent aujourd'hui, montants, périodes, litiges vécus.
- [ ] Photographier (avec accord) leurs cahiers et registres pour reproduire leur logique.
- [ ] Mettre à jour ce cahier des charges avec ce qui a été appris.

**Semaines 2–4 : cadrer juridiquement et nommer le projet**

- [ ] Consulter un juriste guinéen : statut de la société, règles BCRG, protection des données.
- [ ] Confirmer le modèle « la plateforme ne détient pas les fonds » pour la V1.
- [ ] Choisir le nom, réserver le nom de domaine et les comptes Google Play et App Store.
- [ ] Créer la structure juridique (ex. SARL ou SAS) si ce n'est pas déjà fait.

**Semaines 3–6 : maquettes et choix du prestataire**

- [ ] Faire dessiner les maquettes des 5 parcours clés (section 11).
- [ ] Tester les maquettes sur papier ou téléphone avec 2 ou 3 groupes pilotes.
- [ ] Envoyer ce cahier des charges à 3 prestataires (agence ou freelances) et comparer les devis.
- [ ] Choisir le prestataire ; signer un contrat qui prévoit la propriété du code et la garantie de 3 mois.

**Semaines 6–8 : préparer le développement et le paiement**

- [ ] Lancer le développement des fonctionnalités sans paiement (comptes, groupes, tontine, saisie espèces, reçus).
- [ ] Contacter 2 à 3 sociétés de paiement couvrant la Guinée et ouvrir leurs comptes de test (section 15).
- [ ] Recruter les 2 premiers ambassadeurs terrain.
- [ ] Fixer la date du pilote et les objectifs (10 groupes actifs, 2 cycles sans litige).

Astuce : le paiement en espèces saisi par le trésorier (section 4.3) permet de lancer le pilote avant même que l'intégration Mobile Money soit prête.

## 15. Choix de la société de paiement (dernière étape)

Le critère décisif est la capacité à encaisser ET à verser (décaissement) en GNF via Orange Money et MTN en Guinée : sans versement automatique, le pot de la tontine et l'aide d'urgence doivent être versés à la main par le trésorier.

**Grille d'évaluation**

| Critère | Question à poser | Poids |
| --- | --- | --- |
| Couverture Guinée | Orange Money et MTN en GNF, en production (pas seulement annoncé) ? | Éliminatoire |
| Décaissement | Peut-on verser vers un numéro Mobile Money par API ? Délai, plafond ? | Éliminatoire |
| Agrément | Agrément BCRG ou partenaire agréé ? Puis BCEAO pour le lot 2 ? | Éliminatoire |
| Frais | Pourcentage par encaissement et par versement, frais fixes, minimum mensuel | Élevé |
| Couverture lot 2 | Sénégal et Côte d'Ivoire (Wave, Orange, MTN, Moov, Free) avec le même contrat ? | Élevé |
| Technique | API documentée, environnement de test, webhooks de confirmation, idempotence | Élevé |
| Reversement | Délai de mise à disposition des fonds sur le compte marchand | Moyen |
| Support | Interlocuteur local à Conakry, délai de réponse | Moyen |
| Dossier d'ouverture | Documents exigés (KYC entreprise), délai d'activation | Moyen |

**Pistes à étudier (non vérifiées à ce stade)**

- Intégration directe des opérateurs : API Orange Money et API MTN MoMo pour la Guinée. Avantage : frais souvent plus bas. Limite : deux contrats et deux intégrations par pays.
- Agrégateurs régionaux couvrant plusieurs pays d'Afrique de l'Ouest (ex. CinetPay, PayDunya, Flutterwave) : un seul contrat, mais la couverture réelle de la Guinée est à confirmer pour chacun.
- Agrégateurs guinéens locaux : à identifier sur place (souvent mieux connectés aux opérateurs guinéens).

Méthode : demander une offre écrite à 3 candidats, tester l'environnement de test, puis faire un paiement réel de 1 000 GNF et un versement réel avant de signer.

## 16. Choix techniques retenus et organisation du dépôt

Le développement démarre par l'API (NestJS + PostgreSQL) dans le dépôt [MOUSTO-HUB/Cotisations](https://github.com/MOUSTO-HUB/Cotisations) ; l'application mobile Flutter suit dès que l'API couvre les comptes, les groupes et les tontines.

| Couche | Choix retenu | Raison |
| --- | --- | --- |
| Langage back-end | TypeScript sur Node.js 24 | Déjà installé, typage strict pour les calculs financiers |
| Framework API | NestJS | Modules clairs, validation, tests intégrés |
| Base de données | PostgreSQL 16, lancé avec Docker en local | Transactions fiables |
| Accès aux données | Prisma (schéma + migrations) | Schéma lisible, migrations versionnées |
| Tests | Jest (unitaires et bout en bout) | Standard NestJS |
| Mobile | Flutter (après le socle API) | Android d'abord, iOS ensuite |
| Web trésorier | Next.js (lot 2) |  |

**Règles techniques non négociables**

- Montants stockés en entiers dans l'unité de la devise (GNF et XOF n'ont pas de centimes) ; jamais de nombre à virgule pour de l'argent.
- Dates stockées en UTC ; échéances calculées dans le fuseau du groupe (Africa/Conakry pour la Guinée).
- Aucune écriture financière supprimée ni modifiée : annulation par contre-écriture (RG-C4).
- Toute opération financière dans une transaction de base de données et tracée dans le journal d'audit.
- Code et noms techniques en anglais ; interface, messages et documentation en français.

**Organisation du dépôt**

```
Cotisations/
  CLAUDE.md              consignes de développement (fichier de prompt)
  docs/                  cahier des charges et décisions
  backend/               API NestJS + Prisma
  mobile/                application Flutter (à venir)
  web/                   application web trésorier (lot 2)
  docker-compose.yml     PostgreSQL local
```

**Ordre de développement**

1. Socle API : configuration, base de données, Docker, point de santé.
2. Moteur de tontine : calendrier, montant du pot, tours, date de fin, avec tests.
3. Comptes : inscription par téléphone et code OTP (SMS simulé en développement).
4. Groupes, membres et rôles.
5. Cotisations, échéances, paiements en espèces, reçus.
6. Caisses, mouvements, double validation, journal d'audit.
7. Projets budgétés et collectes de solidarité.
8. Application mobile Flutter.
9. Paiement Mobile Money, une fois la société de paiement choisie (section 15).

## 17. Glossaire

| Terme | Définition |
| --- | --- |
| Tontine rotative | Groupe où chacun verse le même montant à chaque période ; un membre différent reçoit la totalité à chaque tour |
| Part | Unité de participation à une tontine ; un membre peut détenir plusieurs parts ou une demi-part |
| Pot | Somme versée au bénéficiaire d'un tour : montant par part × nombre de parts |
| Tour | Une période de la tontine, avec un bénéficiaire |
| Cycle | Ensemble des tours, jusqu'à ce que chaque part ait reçu le pot une fois |
| Enchère | Mode où le membre qui accepte le plus gros escompte reçoit le pot en premier |
| Caisse | Réserve d'argent du groupe (générale, solidarité, projet) |
| Échéance | Montant dû par un membre à une date donnée |
| Contre-écriture | Écriture inverse qui annule une erreur sans effacer l'écriture d'origine |
| Décaissement | Versement d'argent par la plateforme vers un compte Mobile Money |
| Agrégateur de paiement | Société qui donne accès à plusieurs opérateurs Mobile Money par un seul contrat |
| MVP | Première version minimale, testée avec les groupes pilotes |
| OTP | Code à usage unique envoyé par SMS pour se connecter |
| BCRG / BCEAO | Banques centrales de la Guinée / des pays de l'UEMOA (Sénégal, Côte d'Ivoire…) |
| GNF / XOF | Franc guinéen / franc CFA d'Afrique de l'Ouest |
