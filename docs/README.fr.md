<div align="center">

# OpenConnector

[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](../LICENSE.txt)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933)
![Cloudflare compatible](https://img.shields.io/badge/Cloudflare-compatible-F38020)
![MCP](https://img.shields.io/badge/MCP-ready-111827)
![OpenAPI](https://img.shields.io/badge/OpenAPI-3.1-6BA539)

[![Providers](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fconnector.oomol.com%2Fv1%2Fcatalog&query=data.providerCount&label=Providers&color=%237d7fe9)](https://oomol.com/apps)
[![Actions](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fconnector.oomol.com%2Fv1%2Fcatalog&query=data.actionCount&label=Actions&color=%237d7fe9)](https://oomol.com/apps)

</div>

OpenConnector est une alternative open source à Composio pour l'authentification SaaS, les outils
et les intégrations prêts pour les agents. C'est une couche connector pour les agents qui ont
besoin d'un accès fiable aux comptes utilisateurs dans des applications externes. Elle gère
l'authentification, l'exécution des outils et les intégrations orientées agents. Le catalog open
source couvre actuellement 840+ providers et 8 300+ Actions prêtes à l'emploi, s'exécute en local
ou sur une infrastructure compatible Cloudflare, et expose les mêmes outils via le
[Connector SDK](https://github.com/oomol-lab/connector-sdk), MCP, HTTP, OpenAPI et la Web Console
locale.

OpenConnector donne aux agents un chemin contrôlé vers de vrais produits tout en gardant les
credentials, scopes, schemas, policies et journaux d'exécution dans un runtime inspectable. Le
gateway, le provider catalog et les Action executors sont open source, afin que les équipes puissent
examiner les contrats, étendre les providers et contrôler la frontière de déploiement.

Le catalog open source correspond à la partie du connector catalog d'OOMOL dont la migration vers
des définitions et executors de providers maintenables est terminée. Le produit OOMOL hébergé
couvre aujourd'hui 1 000+ providers. Les deux surfaces utilisent des connector interfaces et des
Action contracts compatibles, afin que les équipes puissent commencer vite avec l'offre hébergée,
puis déplacer la même couche connector vers une infrastructure runtime privée ou self-hosted.

La prise en charge du runtime open source dans [oo CLI](https://github.com/oomol-lab/oo-cli) est en
cours d'ajout et vise mi-juillet 2026. En attendant, utilisez les chemins SDK, MCP, HTTP API,
OpenAPI et Web Console locale ci-dessous.

## Ce Que Fournit OpenConnector

- Un connector catalog prêt à l'emploi : [840+ providers et 8 300+ Actions prêtes à l'emploi](providers.md),
  couvrant GitHub, Gmail, Notion, BigQuery, Google Analytics, Supabase, Airtable, Slack et d'autres
  produits.
- Une gestion centralisée des credentials dans un seul runtime : API keys, OAuth2, custom
  credentials et providers sans authentification.
- Des Action contracts inspectables : request/response schemas, required scopes et executors chargés
  à la demande vivent dans le code source.
- Des options de déploiement adaptées à différentes frontières runtime : Docker ou Node.js en local
  pour le développement, plus un déploiement compatible Cloudflare sur Workers, D1, R2 et Static
  Assets.
- Des interfaces pour agents : [Connector SDK](https://github.com/oomol-lab/connector-sdk), MCP,
  HTTP API, OpenAPI et Web Console locale, avec
  [oo CLI](https://github.com/oomol-lab/oo-cli) en cours d'adaptation au runtime open source.
- Des garde-fous runtime pour la production : connection identity, scopes, runtime tokens, action
  allow/block policies, transit temporaire de fichiers et journaux d'exécution masqués.

## Où L'utiliser

OpenConnector convient aux produits où les agents doivent travailler dans les outils déjà utilisés
par les utilisateurs, avec une frontière opérationnelle claire pour les credentials, scopes, schemas
et journaux d'exécution. Les versions hébergée et open source restent compatibles au niveau des
interfaces, afin que la même couche connector puisse passer du service hébergé OOMOL à une
infrastructure privée ou self-hosted selon les exigences de déploiement.

- Produits d'agents qui nécessitent un accès réutilisable aux apps de travail, outils développeur,
  systèmes de données, plateformes de communication et services d'IA.
- Produits ajoutant des workflows d'agents et ayant besoin d'Action contracts stables et
  inspectables pour accéder aux applications des utilisateurs.
- Équipes qui veulent commencer avec l'hébergé pour aller vite tout en gardant une voie vers le
  contrôle d'un runtime privé ou self-hosted.

## Outils Développeur

| Outil                                                       | Rôle                                                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [Connector SDK](https://github.com/oomol-lab/connector-sdk) | Appeler des connector Actions, proxy des upstream APIs et inspecter le catalog depuis des apps TypeScript et runtimes d'agent. |
| [oo CLI](https://github.com/oomol-lab/oo-cli)               | La prise en charge du runtime open source est en cours d'ajout et vise mi-juillet 2026.                                        |
| MCP                                                         | Exposer les Actions d'app à des hosts d'agents compatibles MCP via `http://localhost:3000/mcp`.                                |
| HTTP / OpenAPI                                              | Appeler directement `/v1/actions/*` ou inspecter le document `/openapi.json` généré.                                           |

## Aperçu De La Couverture Provider

Pour planifier la couverture, la liste complète des providers est disponible dans
[providers.md](providers.md). Cet aperçu met en avant des apps de productivité, outils développeur,
produits d'analytics et services d'IA reconnaissables dans le catalog.

![Aperçu de la couverture provider](../assets/saas-logo-wall.png)

Les noms et marques des providers appartiennent à leurs propriétaires respectifs et sont utilisés
uniquement à des fins d'identification et d'interopérabilité.

## Fonctionnement

```mermaid
flowchart LR
  Agent["AI Agent / App"] -->|"SDK / MCP / HTTP"| Gateway["OpenConnector Gateway"]
  Gateway --> Auth["Credential & OAuth Boundary"]
  Gateway --> Catalog["Provider Catalog"]
  Gateway --> Actions["Open-source Action Executors"]
  Gateway --> Policy["Tokens, Scopes, Allow/Block Policy"]
  Gateway --> Logs["Run Logs"]
  Actions --> Providers["840+ Providers"]
  Console["Web Console"] --> Gateway
  Cloudflare["Cloudflare Workers, D1, R2"] -. deploy .-> Gateway
```

Les apps et agents découvrent les Actions, inspectent les schemas et scopes, sélectionnent un
connection alias et exécutent via le gateway. Les provider secrets restent derrière la frontière du
runtime ; les agents reçoivent les metadata, labels de compte sûrs et résultats d'exécution
nécessaires à la run.

## Parcours D'utilisation

| Parcours                          | Idéal pour                                                          | Inclus                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Open source self-host             | Développeurs et équipes qui veulent un contrôle total               | Runtime Docker ou Node local, stockage SQLite, MCP, HTTP, OpenAPI et Web Console                                                                   |
| Déploiement compatible Cloudflare | Équipes qui veulent un runtime hébergé léger                        | Workers runtime, état D1, fichiers de transit R2 et Static Assets pour la console                                                                  |
| [OOMOL](https://oomol.com/)       | Équipes bloquées par l'approbation OAuth ou les délais de lancement | Auth hébergée, runtime et catalog de 1 000+ providers ; compatible avec l'interface open source pour un déploiement privé ou self-hosted ultérieur |

## Vidéo De Démarrage Rapide Cloudflare

[![Déployer OpenConnector sur Cloudflare Workers](../assets/cloudflare-quickstart-video.png)](https://www.youtube.com/watch?v=R0V1ZdCuTgc)

Le
[guide vidéo de déploiement Cloudflare Workers](https://www.youtube.com/watch?v=R0V1ZdCuTgc)
montre comment lancer OpenConnector sur Cloudflare avec Workers, D1, R2 et la Web Console. La vidéo
suit le même flux que [cloudflare.md](cloudflare.md) : créer les ressources Cloudflare, copier
`wrangler.example.jsonc` vers `wrangler.local.jsonc`, appliquer les migrations D1, définir les
secrets requis et exécuter `npm run deploy:cloudflare`.

## Démarrage Rapide

Démarrez le runtime avec Docker Compose :

```bash
docker compose up --build
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

## Interfaces D'outils Pour Agents

OpenConnector expose le même Action catalog via plusieurs interfaces orientées agents :

- MCP : `http://localhost:3000/mcp`
- HTTP runtime API : `/v1/actions`
- Document OpenAPI : `/openapi.json`
- Action guides : `/api/actions/:actionId/agent.md`
- Exemples Web Console : snippets cURL, TypeScript et agent prompt pour chaque Action

Consultez [runtime-api.md](runtime-api.md) pour les endpoints, response envelopes, auth headers,
outils MCP et exemples d'Action guide.

## Web Console

Ouvrez `http://localhost:3000` après le démarrage du runtime. La console permet de parcourir les
providers, configurer les API keys et OAuth clients, créer des runtime tokens, inspecter les Action
schemas, déboguer les Actions, revoir les exécutions récentes et accéder aux metadata OpenAPI et MCP
générées.

## Déploiement Cloudflare

OpenConnector prend en charge Cloudflare Workers comme cible de déploiement pour les metadata et
l'état runtime avec Workers, D1, R2 et Static Assets.

Consultez [cloudflare.md](cloudflare.md) pour la création des ressources, les migrations, les
secrets, la preview Worker locale et le déploiement distant.

## OOMOL Et Wanta

Les équipes peuvent choisir le parcours produit correspondant au niveau de propriété runtime
souhaité. [OpenConnector](https://github.com/oomol-lab/open-connector) fournit le self-hosting open
source et le contrôle du déploiement. [OOMOL](https://oomol.com/) fournit l'auth hébergée,
l'infrastructure runtime et le catalog plus large de 1 000+ providers tout en conservant des
connector interfaces et Action contracts compatibles.

Pour les petites équipes ou les individus utilisant directement un Agent desktop,
[Wanta](https://wanta.ai/) connecte les apps via une expérience produit desktop avec team app
sharing, permission control, multiple connected accounts et workspace-specific connections.

## Documentation

- [Démarrage rapide](quickstart.md)
- [Outils développeur](sdk-cli.md)
- [Couverture provider](providers.md)
- [Runtime API et MCP](runtime-api.md)
- [Déploiement Cloudflare](cloudflare.md)
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
npm run build:web
npm run dev
```

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
