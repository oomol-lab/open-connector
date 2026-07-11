<div align="center">

<img src="../assets/openconnector-readme-banner.png" alt="OpenConnector - Connect Once. Use Everywhere." width="100%" />

[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](../LICENSE.txt)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933)
![Cloudflare compatible](https://img.shields.io/badge/Cloudflare-compatible-F38020)
![MCP](https://img.shields.io/badge/MCP-ready-111827)
![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-6BA539)

[![Providers](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fconnector.oomol.com%2Fv1%2Fcatalog&query=data.providerCount&label=Providers&color=%237d7fe9)](https://oomol.com/apps)
[![Actions](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fconnector.oomol.com%2Fv1%2Fcatalog&query=data.actionCount&label=Actions&color=%237d7fe9)](https://oomol.com/apps)

</div>

OpenConnector est un connector gateway open source pour AI agents, et une alternative à Composio.
Connectez les comptes d'apps utilisateur une fois, puis exposez un catalog partagé de 1,000+
providers et 10 000+ Actions prêtes à l'emploi aux agents et applications.

Utilisez le [Connector SDK](https://github.com/oomol-lab/connector-sdk) dans le code applicatif,
[oo CLI](https://github.com/oomol-lab/oo-cli) comme relais pour les agents locaux, MCP pour les
hosts d'agents, HTTP/OpenAPI pour les clients personnalisés, et la Web Console locale pour
l'administration et le débogage.

- Gardez credentials, scopes, schemas, policies et run logs dans un runtime inspectable.
- Exécutez-le en local, sur Fly.io, sur une infrastructure compatible Cloudflare ou via le runtime
  hébergé d'OOMOL.
- Utilisez les mêmes provider ids, Action ids, schemas et contracts entre les déploiements open
  source et SaaS commercial.

## Ce Qu'il Fournit

- Un connector catalog prêt à l'emploi couvrant GitHub, Gmail, Notion, BigQuery, Google Analytics,
  Supabase, Airtable, Slack et d'autres produits.
- Une gestion centralisée des credentials dans un seul runtime : API keys, OAuth2, custom
  credentials et providers sans authentification.
- Des Action contracts inspectables et extensibles : request/response schemas, required scopes et
  executor source chargé à la demande.
- Des runtime controls pour la production : connection identity, scopes, runtime tokens, action
  allow/block policies, transit temporaire de fichiers et journaux d'exécution masqués.
- Des options de déploiement via Docker ou Node.js en local, Fly.io avec stockage SQLite persistant,
  Cloudflare Workers / D1 / R2 / Static Assets, ou le runtime hébergé d'OOMOL.

## Où L'utiliser

OpenConnector convient aux produits où les agents ont besoin d'un accès durable aux outils des
utilisateurs sans donner les provider credentials au processus agent.

- Produits d'agents qui nécessitent un accès réutilisable aux apps de travail, outils développeur,
  systèmes de données, plateformes de communication et services d'IA.
- Produits ajoutant des workflows d'agents et ayant besoin d'Action contracts stables et
  inspectables pour accéder aux applications des utilisateurs.
- Équipes qui veulent commencer vite avec hosted auth tout en gardant une voie vers un runtime privé
  ou self-hosted.

## Outils Développeur

| Outil                                                       | Rôle                                                                                                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Connector SDK](https://github.com/oomol-lab/connector-sdk) | Client HTTP TypeScript léger. Utilisez `OpenConnector` pour un runtime self-hosted, et `Connector` / `ProjectConnector` pour les connexions personnelles et SaaS end-user hébergées par OOMOL. |
| [oo CLI](https://github.com/oomol-lab/oo-cli)               | Relais de connector Actions pour agents locaux. `oo connector` peut chercher, inspecter et exécuter des Actions sur les runtimes OOMOL-hosted ou OpenConnector self-hosted.                    |
| MCP                                                         | Exposer les Actions d'app à des hosts d'agents compatibles MCP via `http://localhost:3000/mcp`.                                                                                                |
| HTTP / OpenAPI                                              | Appeler directement `/v1/actions/*` ou inspecter le document `/openapi.json` généré.                                                                                                           |

Consultez [runtime-api.md](runtime-api.md) pour les endpoints, response envelopes, auth headers,
outils MCP et exemples d'Action guide.

## Aperçu du Dashboard

OpenConnector inclut un Dashboard local pour parcourir les connectors, configurer les credentials,
créer des runtime tokens et inspecter l'usage du runtime.

### Connector Catalog

Le connector catalog permet de voir les services disponibles, de rechercher des providers et
d'ouvrir leurs Actions et leur credential setup depuis un seul endroit.

![OpenConnector connector catalog dashboard](../assets/open-console-en.jpg)

### Usage Overview

Après le déploiement, la page Overview affiche le runtime readiness, les providers disponibles, les
Actions exécutables, les failures récentes, les tool call trends et les recent calls.

![OpenConnector runtime overview dashboard](../assets/overview-page-en.jpg)

Les noms et marques des providers appartiennent à leurs propriétaires respectifs et sont utilisés
uniquement à des fins d'identification et d'interopérabilité.

## Fonctionnement

```mermaid
flowchart LR
  Agent["AI Agent / App"] -->|"SDK / CLI / MCP / HTTP"| Gateway["OpenConnector Gateway"]
  Gateway --> Auth["Credential & OAuth Boundary"]
  Gateway --> Catalog["Provider Catalog"]
  Gateway --> Actions["Open-source Action Executors"]
  Gateway --> Policy["Tokens, Scopes, Allow/Block Policy"]
  Gateway --> Logs["Run Logs"]
  Actions --> Providers["1,000+ Providers"]
  Console["Web Console"] --> Gateway
  Cloudflare["Cloudflare Workers, D1, R2"] -. deploy .-> Gateway
```

Les apps et agents découvrent les Actions, inspectent les schemas et scopes, sélectionnent un
connection alias et exécutent via le gateway. Les provider secrets restent derrière la frontière du
runtime ; les agents reçoivent les metadata, labels de compte sûrs et résultats d'exécution
nécessaires à la run.

## Parcours D'utilisation

| Parcours                          | Idéal pour                                                          | Inclus                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open source self-host             | Développeurs et équipes qui veulent un contrôle total               | Runtime Docker ou Node local, stockage SQLite, MCP, HTTP, OpenAPI et Web Console                                                                                                 |
| Fly.io self-host                  | Équipes qui veulent un runtime Docker hébergé                       | Runtime Docker Node, stockage SQLite sur un volume Fly, TLS, health checks, MCP, HTTP, OpenAPI et Web Console                                                                    |
| Déploiement compatible Cloudflare | Équipes qui veulent un runtime hébergé léger                        | Workers runtime, état D1, fichiers de transit R2 et Static Assets pour la console                                                                                                |
| [OOMOL](https://oomol.com/)       | Équipes bloquées par l'approbation OAuth ou les délais de lancement | Auth hébergée et infrastructure runtime avec les mêmes provider et Action contracts ; compatible avec l'interface open source pour un déploiement privé ou self-hosted ultérieur |

## Vidéo De Démarrage Rapide Cloudflare

[![Déployer OpenConnector sur Cloudflare Workers](../assets/cloudflare-quickstart-video.png)](https://www.youtube.com/watch?v=R0V1ZdCuTgc)

Le
[guide vidéo de déploiement Cloudflare Workers](https://www.youtube.com/watch?v=R0V1ZdCuTgc)
montre comment lancer OpenConnector sur Cloudflare avec Workers, D1, R2 et la Web Console. La vidéo
suit le même flux que [cloudflare.md](cloudflare.md) : créer les ressources Cloudflare, copier
`wrangler.example.jsonc` vers `wrangler.local.jsonc`, appliquer les migrations D1, définir les
secrets requis et exécuter `npm run deploy:cloudflare`.

## Démarrage Rapide

Démarrez le runtime depuis l'image publiée avec Docker Compose :

```bash
docker compose up
```

Cela récupère `ghcr.io/oomol-lab/open-connector:latest`. Pour builder depuis les sources :

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

Ouvrez la console locale et la référence API générée :

```text
http://localhost:3000
http://localhost:3000/docs
```

Exécutez une Action sans authentification pour vérifier le runtime :

```bash
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Consultez [quickstart.md](quickstart.md) pour la configuration locale complète, la première
connexion provider, le flux OAuth et les paramètres runtime.

## Connecter Un Provider

GitHub est l'exemple authentifié le plus simple, car il peut utiliser un personal access token :

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"github_pat_..."}}'

curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Pour les apps OAuth2, named connections, credential encryption, token refresh et action policies,
consultez [credentials.md](credentials.md) et [configuration.md](configuration.md).

## Web Console

Ouvrez `http://localhost:3000` après le démarrage du runtime. La console permet de parcourir les
providers, configurer les API keys et OAuth clients, créer des runtime tokens, inspecter les Action
schemas, déboguer les Actions, revoir les exécutions récentes et accéder aux metadata OpenAPI et MCP
générées.

## Déploiement Cloudflare

OpenConnector peut être déployé sur Cloudflare : Workers exécute le runtime, D1 stocke l'état, R2
gère les fichiers de transit et Static Assets sert la Web Console.

Consultez [cloudflare.md](cloudflare.md) pour la création des ressources, les migrations, les
secrets, la preview Worker locale et le déploiement distant.

## Déploiement Fly.io

OpenConnector peut aussi être déployé sur Fly.io avec le runtime Docker Node et un stockage SQLite
persistant sur un volume Fly.

Consultez [fly-io.md](fly-io.md) pour créer l'app Fly, configurer le volume et les secrets,
déployer, définir un domaine personnalisé et ajuster le scaling.

## Image Docker (GHCR)

Exécutez OpenConnector depuis une image préconstruite sur GitHub Packages (GHCR) :
`ghcr.io/oomol-lab/open-connector`. Utilisez `latest` pour la dernière release, une version épinglée comme
`v1.0.0` en production, ou `tip` pour le dernier build de `main`.

Consultez [docker-ghcr.md (anglais)](docker-ghcr.md) pour les tags d'image, le pull et l'exécution.

## Vous voulez l'utiliser directement ?

Les parcours ci-dessus s'adressent aux équipes qui intègrent le connector dans leurs produits,
runtimes ou infrastructures d'entreprise. Si vous voulez d'abord essayer l'expérience de connexion
SaaS, ou l'utiliser directement dans le travail quotidien, vous n'avez pas besoin de déployer
OpenConnector ni d'intégrer d'abord le SDK, la CLI, MCP ou l'API HTTP.

[Wanta](https://wanta.ai/) est le point d'entrée desktop product qui utilise la même couverture
1,000+ SaaS/providers. Après avoir connecté des comptes, vous pouvez chercher, organiser, créer et
synchroniser dans les outils connectés en natural language.

| Si Vous Voulez                                       | Wanta Fournit                                                                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Essayer directement les connexions 1,000+ SaaS       | Utiliser la même couverture SaaS/provider sans déployer un runtime ni intégrer d'abord le SDK/la CLI.                               |
| Utiliser des Agents dans le travail quotidien        | Travailler en natural language à travers email, chat, docs, data, projets, support, developer tools et marketing tools.             |
| Partager des capabilities connectées avec une équipe | Configurer connections et access scopes une fois ; les teammates les utilisent sans setup, avec keys, tokens et credentials cachés. |

## Documentation

- [Démarrage rapide](quickstart.md)
- [Outils développeur](sdk-cli.md)
- [Tutoriel Gmail OAuth et SDK (anglais)](gmail-oauth-sdk.md)
- [Runtime API et MCP](runtime-api.md)
- [Déploiement Fly.io](fly-io.md)
- [Déploiement Cloudflare](cloudflare.md)
- [Image Docker (GHCR) (anglais)](docker-ghcr.md)
- [Configuration](configuration.md)
- [Credentials et OAuth](credentials.md)
- [Format du catalog](catalog-format.md)
- [Langage de verification](verification.md)
- [Contribution](../CONTRIBUTING.md)
- [Code de conduite](../CODE_OF_CONDUCT.md)
- [Sécurité](../SECURITY.md)

## Développement

Utilisez Node.js 22 ou plus récent :

```bash
npm install
npm run dev
```

Le runtime API local écoute sur `http://localhost:3000`. Le serveur de développement Web Console
écoute sur `http://localhost:5173` et proxy les requêtes API vers le runtime.

Avant d'ouvrir une pull request :

```bash
npm run fix-check
npm test
```

Le code provider se trouve dans `src/providers/<service>`. Consultez
[CONTRIBUTING.md](../CONTRIBUTING.md#adding-providers) pour les règles de contribution des
providers.

## Portée De La Licence

Sauf indication contraire, le code source, les scripts, les échafaudages de projet générés, les
tests et la documentation rédigés pour ce repository sont sous Apache License, Version 2.0. Consultez
[LICENSE.txt](../LICENSE.txt).

La licence Apache-2.0 de ce repository n'accorde aucun droit sur les produits, providers, apps,
APIs, trademarks, service marks, trade names, logos, icons, brand assets, documentation,
screenshots ou autres contenus protégés appartenant à leurs détenteurs respectifs.

Les noms de providers et d'apps, metadata, liens, scopes, permissions et logos/icons optionnels sont
inclus uniquement pour identifier les services et permettre l'interopérabilité. Tous les droits sur
les marques et produits tiers restent la propriété de leurs détenteurs respectifs. Leur présence
dans ce catalog n'implique aucune approbation, sponsorisation, partenariat, certification ou
vérification par ces détenteurs.

Si vous contribuez des provider metadata ou assets, soumettez uniquement des éléments pour lesquels
vous avez les droits nécessaires. Préférez les liens vers les assets publics officiels plutôt que de
copier des fichiers de marque dans ce repository.

## Communauté

Gardez les issues et pull requests ciblées, respectueuses et actionnables. La participation à ce
projet est régie par [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).
