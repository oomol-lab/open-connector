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

OpenConnector — open-source альтернатива Composio для SaaS-аутентификации, инструментов и
интеграций, готовых для агентов. Это connector-слой для агентов, которым нужен надежный доступ к
пользовательским аккаунтам во внешних приложениях. Он отвечает за аутентификацию, выполнение
инструментов и интеграции для агентов. Текущий open-source catalog включает 840+ providers и 8 300+
готовых Actions, работает локально или в Cloudflare-совместимой инфраструктуре и предоставляет один
и тот же набор инструментов через
[Connector SDK](https://github.com/oomol-lab/connector-sdk), MCP, HTTP, OpenAPI и локальную Web
Console.

OpenConnector дает агентам контролируемый путь к реальным продуктам, оставляя credentials, scopes,
schemas, policies и журналы запусков внутри проверяемого runtime. Gateway, provider catalog и
Action executors открыты в исходном коде, поэтому команды могут проверять контракты, расширять
providers и контролировать границу развертывания.

Open-source catalog — это часть connector catalog OOMOL, которая уже перенесена в поддерживаемые
provider definitions и executors. Хостинговый продукт OOMOL сегодня покрывает 1 000+ providers.
Обе поверхности используют совместимые connector interfaces и Action contracts, поэтому команды
могут быстро начать с хостингового варианта, а затем перенести тот же connector-слой в приватную
или self-hosted runtime-инфраструктуру.

Поддержка open-source runtime в [oo CLI](https://github.com/oomol-lab/oo-cli) добавляется сейчас и
запланирована на середину июля 2026 года. До тех пор используйте SDK, MCP, HTTP API, OpenAPI и
локальную Web Console, описанные ниже.

## Что Дает OpenConnector

- Рабочий connector catalog: [840+ providers и 8 300+ готовых Actions](providers.md) для GitHub,
  Gmail, Notion, BigQuery, Google Analytics, Supabase, Airtable, Slack и других продуктов.
- Управление credentials в одном runtime: API keys, OAuth2, custom credentials и providers без
  аутентификации.
- Проверяемые Action contracts: request/response schemas, required scopes и executors с ленивой
  загрузкой находятся в исходном коде.
- Варианты развертывания под разные runtime-границы: локальный Docker или Node.js для разработки,
  а также Cloudflare-совместимое развертывание на Workers, D1, R2 и Static Assets.
- Интерфейсы для агентов: [Connector SDK](https://github.com/oomol-lab/connector-sdk), MCP, HTTP
  API, OpenAPI и локальная Web Console; поддержка
  [oo CLI](https://github.com/oomol-lab/oo-cli) адаптируется для open-source runtime.
- Runtime-ограничения для production: connection identity, scopes, runtime tokens, action
  allow/block policies, временный транзит файлов и редактированные журналы запусков.

## Где Это Уместно

OpenConnector подходит продуктам, где агентам нужно работать внутри инструментов, которыми уже
пользуются пользователи, сохраняя четкую операционную границу для credentials, scopes, schemas и
журналов выполнения. Хостинговая и open-source версии остаются совместимыми по интерфейсам, поэтому
один и тот же connector-слой можно перенести из хостингового сервиса OOMOL в приватную или
self-hosted инфраструктуру по мере изменения требований к развертыванию.

- Агентские продукты, которым нужен переиспользуемый доступ к рабочим приложениям, инструментам
  разработчика, системам данных, коммуникационным платформам и AI-сервисам.
- Продукты, добавляющие agent workflows и нуждающиеся в стабильных, проверяемых Action contracts
  для доступа к пользовательским приложениям.
- Команды, которые хотят быстро стартовать с хостингового решения и сохранить путь к приватному или
  self-hosted контролю runtime.

## Инструменты Разработчика

| Инструмент                                                  | Назначение                                                                                                                  |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Connector SDK](https://github.com/oomol-lab/connector-sdk) | Вызывать connector Actions, проксировать upstream APIs и просматривать catalog из TypeScript-приложений и runtimes агентов. |
| [oo CLI](https://github.com/oomol-lab/oo-cli)               | Поддержка open-source runtime добавляется сейчас и запланирована на середину июля 2026 года.                                |
| MCP                                                         | Экспортировать app Actions в MCP-совместимые hosts агентов через `http://localhost:3000/mcp`.                               |
| HTTP / OpenAPI                                              | Вызывать `/v1/actions/*` напрямую или просматривать сгенерированный документ `/openapi.json`.                               |

## Обзор Покрытия Providers

Для планирования покрытия полный список providers доступен в [providers.md](providers.md). Этот
обзор выделяет узнаваемые productivity apps, developer tools, analytics products и AI-сервисы из
catalog.

![Обзор покрытия providers](../assets/saas-logo-wall.png)

Названия и товарные знаки providers принадлежат их владельцам и используются только для
идентификации и совместимости.

## Как Это Работает

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

Приложения и агенты обнаруживают Actions, просматривают schemas и scopes, выбирают connection alias
и выполняют запросы через gateway. Provider secrets остаются за границей runtime; агенты получают
только metadata, безопасные account labels и результаты выполнения, необходимые для запуска.

## Пути Использования

| Путь                                 | Лучше всего подходит для                                | Включает                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Open-source self-host                | Разработчиков и команд, которым нужен полный контроль   | Локальный Docker или Node runtime, SQLite storage, MCP, HTTP, OpenAPI и Web Console                                                           |
| Cloudflare-совместимое развертывание | Команд, которым нужен легкий hosted runtime             | Workers runtime, состояние D1, транзитные файлы R2 и Static Assets для console                                                                |
| [OOMOL](https://oomol.com/)          | Команд, ограниченных OAuth approval или сроками запуска | Hosted auth, runtime и catalog на 1 000+ providers; совместимость с open-source interface для последующего private или self-hosted deployment |

## Видео Быстрого Старта Cloudflare

[![Развернуть OpenConnector на Cloudflare Workers](../assets/cloudflare-quickstart-video.png)](https://www.youtube.com/watch?v=R0V1ZdCuTgc)

[Пошаговое видео по развертыванию на Cloudflare Workers](https://www.youtube.com/watch?v=R0V1ZdCuTgc)
показывает, как запустить OpenConnector на Cloudflare с Workers, D1, R2 и Web Console. Видео
следует тому же процессу, что и [cloudflare.md](cloudflare.md): создать ресурсы Cloudflare,
скопировать `wrangler.example.jsonc` в `wrangler.local.jsonc`, применить D1 migrations, задать
обязательные secrets и выполнить `npm run deploy:cloudflare`.

## Быстрый Старт

Запустите runtime через Docker Compose:

```bash
docker compose up --build
```

Откройте локальную console и сгенерированную API reference:

```text
http://localhost:3000
http://localhost:3000/docs
```

Выполните Action без аутентификации, чтобы проверить runtime:

```bash
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

Полную локальную настройку, первое provider connection, OAuth flow и runtime settings см. в
[quickstart.md](quickstart.md).

## Подключить Provider

GitHub — самый простой пример с credentials, потому что он может использовать personal access
token:

```bash
curl -s -X PUT http://localhost:3000/api/connections/github \
  -H 'content-type: application/json' \
  -d '{"authType":"api_key","values":{"apiKey":"github_pat_..."}}'

curl -s -X POST http://localhost:3000/v1/actions/github.get_current_user \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

OAuth2 apps, named connections, credential encryption, token refresh и action policies описаны в
[credentials.md](credentials.md) и [configuration.md](configuration.md).

## Интерфейсы Инструментов Для Агентов

OpenConnector предоставляет один и тот же Action catalog через несколько интерфейсов для агентов:

- MCP: `http://localhost:3000/mcp`
- HTTP runtime API: `/v1/actions`
- OpenAPI document: `/openapi.json`
- Action guides: `/api/actions/:actionId/agent.md`
- Примеры Web Console: cURL, TypeScript и agent prompt snippets для каждой Action

Подробности об endpoints, response envelopes, auth headers, MCP tools и примерах Action guide см. в
[runtime-api.md](runtime-api.md).

## Web Console

Откройте `http://localhost:3000` после запуска runtime. Console поддерживает просмотр providers,
настройку API key и OAuth client, создание runtime tokens, просмотр Action schemas, отладку
Actions, проверку недавних запусков и доступ к сгенерированным OpenAPI и MCP metadata.

## Развертывание Cloudflare

OpenConnector поддерживает Cloudflare Workers как цель развертывания для metadata и runtime-state с
использованием Workers, D1, R2 и Static Assets.

Создание ресурсов, migrations, secrets, локальная Worker preview и remote deployment описаны в
[cloudflare.md](cloudflare.md).

## OOMOL И Wanta

Команды могут выбрать продуктовый путь, соответствующий желаемому уровню владения runtime.
[OpenConnector](https://github.com/oomol-lab/open-connector) предоставляет open-source self-hosting
и контроль развертывания. [OOMOL](https://oomol.com/) предоставляет hosted auth, runtime
infrastructure и более широкий catalog из 1 000+ providers, сохраняя совместимые connector
interfaces и Action contracts.

Для небольших команд или отдельных пользователей, которые напрямую используют desktop Agent,
[Wanta](https://wanta.ai/) подключает приложения через desktop-продукт с team app sharing,
permission control, multiple connected accounts и workspace-specific connections.

## Документация

- [Быстрый старт](quickstart.md)
- [Инструменты разработчика](sdk-cli.md)
- [Покрытие providers](providers.md)
- [Runtime API и MCP](runtime-api.md)
- [Развертывание Cloudflare](cloudflare.md)
- [Configuration](configuration.md)
- [Credentials и OAuth](credentials.md)
- [Формат catalog](catalog-format.md)
- [Язык verification](verification.md)
- [Contributing](../CONTRIBUTING.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Security](../SECURITY.md)

## Разработка

Используйте Node.js 22 или новее:

```bash
npm install
npm run build:web
npm run dev
```

Перед открытием pull request:

```bash
npm run fix-check
npm test
```

Provider code находится в `src/providers/<service>`. Правила добавления providers см. в
[CONTRIBUTING.md](../CONTRIBUTING.md#adding-providers).

## Область Действия Лицензии

Если не указано иное, исходный код, scripts, сгенерированное project scaffolding, tests и
documentation, созданные для этого repository, лицензируются по Apache License, Version 2.0. См.
[LICENSE.txt](../LICENSE.txt).

Лицензия Apache-2.0 для этого repository не предоставляет прав на third-party products, providers,
apps, APIs, trademarks, service marks, trade names, logos, icons, brand assets, documentation,
screenshots или другие copyrighted materials, принадлежащие соответствующим правообладателям.

Названия providers и apps, metadata, links, scopes, permissions и optional logos/icons включены
только для идентификации сервисов и обеспечения совместимости. Все права на third-party brands и
products остаются у их владельцев. Включение в этот catalog не означает одобрения, спонсорства,
партнерства, сертификации или проверки со стороны этих владельцев.

Если вы добавляете provider metadata или assets, отправляйте только материалы, на передачу которых
у вас есть права. Предпочитайте ссылки на официальные публичные assets вместо копирования brand
files в этот repository.

## Сообщество

Пожалуйста, делайте issues и pull requests сфокусированными, уважительными и пригодными к
исполнению. Участие в проекте регулируется [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md).
