# Варианты развертывания

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[OOMOL Hosted](https://oomol.com/docs/connector-saas/) и
[self-hosting](https://oomol.com/docs/openconnector-self-hosting/) описаны в
[README](../README.ru.md). На этой странице собраны дополнительные управляемые платформы, на которых
можно развернуть OpenConnector. Новые варианты развертывания будут добавляться сюда.

Цены ниже взяты из публичных тарифов. Перед запуском сверьтесь с официальной страницей pricing.
На этих платформах OAuth apps регистрируете вы сами; управляемый OAuth дает OOMOL Hosted.

<table>
  <thead>
    <tr>
      <th align="left" width="22%">Платформа</th>
      <th align="left">Обзор</th>
      <th align="center" width="18%">Развертывание</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="middle" align="center">
        <a href="https://www.cloudflare.com/"><img src="../../assets/deployment-options/cloudflare.svg" alt="Cloudflare" width="140"></a>
      </td>
      <td valign="top">
        Runtime работает на Workers, состояние хранится в D1, транзитные файлы — в R2 или Workers KV,
        а Web Console отдается через Static Assets в вашем аккаунте Cloudflare.
        <br><br>
        <strong>Преимущества:</strong> глобальная edge-сеть, scale to zero, щедрый бесплатный лимит и
        отсутствие платы за egress у R2. Deployment и OAuth apps вы ведете сами.
        <br><br>
        <strong>Цена:</strong> Workers Free включает 100 000 запросов в день. Workers Paid начинается
        с $5/месяц и включает 10 миллионов запросов. У D1 и R2 тоже есть бесплатные лимиты. См.
        <a href="https://developers.cloudflare.com/workers/platform/pricing/">тарифы Cloudflare Workers</a>.
      </td>
      <td valign="middle" align="center">
        <a href="../cloudflare.md"><strong>Руководство</strong></a>
        <br>
        <a href="https://www.youtube.com/watch?v=R0V1ZdCuTgc">Видео быстрого старта</a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://fly.io"><img src="../../assets/deployment-options/fly-io.svg" alt="Fly.io" width="140"></a>
      </td>
      <td valign="top">
        Node Docker runtime запускается на Fly Machines, SQLite хранится на Fly volume; для нескольких
        машин можно использовать PostgreSQL. Fly дает TLS, health checks, rolling deploys и custom
        domains.
        <br><br>
        <strong>Преимущества:</strong> близко к обычному Docker-хосту, есть постоянные тома,
        размещение по регионам и понятный scaling.
        <br><br>
        <strong>Цена:</strong> compute тарифицируется посекундно. Небольшая постоянно включенная
        машина shared-cpu-1x стоит около $2/месяц; 1 GB RAM — около $6/месяц. Volumes оплачиваются
        отдельно. См. <a href="https://fly.io/docs/about/pricing/">тарифы Fly.io</a>.
      </td>
      <td valign="middle" align="center">
        <a href="../fly-io.md"><strong>Руководство</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/"><img src="../../assets/deployment-options/repocloud.svg" alt="RepoCloud" width="140"></a>
      </td>
      <td valign="top">
        Развертывание в один клик из marketplace. RepoCloud запускает опубликованный Docker image и
        берет на себя TLS, custom domains и resource tiers. Кроме аккаунта RepoCloud не нужны локальный
        Docker или другие облачные аккаунты.
        <br><br>
        <strong>Преимущества:</strong> самый быстрый путь к hosted instance, почасовая предоплата и
        пауза по 25% от обычного тарифа.
        <br><br>
        <strong>Цена:</strong> Container Apps начинаются с $3/месяц за 1 GB RAM / 1 vCPU. Почасовые
        prepaid credits, без долгосрочного контракта. См.
        <a href="https://repocloud.io/pricing">тарифы RepoCloud</a>.
      </td>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/details/Open%20Connector/"><strong>Развернуть в один клик</strong></a>
      </td>
    </tr>
  </tbody>
</table>
