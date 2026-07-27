# CraftOneWiki

Wiki communautaire francophone consacré à Minecraft, avec recherche, catégories et publication réservée aux comptes Discord autorisés.

## Démarrer

1. Renseignez `SESSION_SECRET` et les identifiants de votre application Discord dans `.env`.
2. Exécutez `npm.cmd install`, puis `npm.cmd start`.
3. Ouvrez `http://localhost:3000`.

## Configurer Discord

Dans le [portail développeur Discord](https://discord.com/developers/applications), créez une application et ajoutez l’URL de redirection `http://localhost:3000/auth/discord/callback` (ou celle de votre domaine). Renseignez ensuite dans `.env` :

- `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` ;
- `DISCORD_REDIRECT_URI` ;
- `DISCORD_STAFF_USER_IDS`, avec les IDs Discord des administrateurs, séparés par des virgules.

À la connexion, CraftOneWiki compare l’identifiant du compte Discord à cette liste. Aucun serveur Discord n’est nécessaire.

Les articles et catégories sont stockés dans `data/articles.json` et `data/categories.json`. Chaque article a une URL lisible, comme `/guide-de-survie-dans-le-nether`. Le tableau de bord inclut un éditeur riche avec polices, couleurs, liens, listes et images ; les images sont déposées dans `public/uploads`.
