# デプロイ方法

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[OOMOL Hosted](https://oomol.com/docs/connector-saas/) と
[セルフホスト](https://oomol.com/docs/openconnector-self-hosting/) は
[README](../README.ja.md) を参照してください。このページは OpenConnector をデプロイできるその他のマネージド
platform をまとめています。今後追加されるデプロイ先もここに掲載します。

価格は各社の公開料金です。本番利用前に公式の pricing page で最新額を確認してください。これらの
platform では OAuth app を自分で登録する必要があります。マネージド OAuth が必要な場合は OOMOL Hosted
を使ってください。

<table>
  <thead>
    <tr>
      <th align="left" width="22%">プラットフォーム</th>
      <th align="left">概要</th>
      <th align="center" width="18%">デプロイ</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="middle" align="center">
        <a href="https://www.cloudflare.com/"><img src="../../assets/deployment-options/cloudflare.svg" alt="Cloudflare" width="140"></a>
      </td>
      <td valign="top">
        Cloudflare アカウントで Workers が runtime を実行し、D1 が state を保存し、R2 または Workers KV が
        transit file を扱い、Static Assets が Web Console を配信します。
        <br><br>
        <strong>利点:</strong> グローバルな edge network、scale to zero、十分な無料枠、R2 の egress
        料金なし。デプロイと OAuth app は自身で管理します。
        <br><br>
        <strong>料金:</strong> Workers Free は 1 日 100,000 リクエストを含みます。Workers Paid は
        $5/月からで、1,000 万リクエストが含まれます。D1 と R2 にも無料枠があります。
        <a href="https://developers.cloudflare.com/workers/platform/pricing/">Cloudflare Workers の料金</a>
        を参照してください。
      </td>
      <td valign="middle" align="center">
        <a href="../cloudflare.md"><strong>デプロイガイド</strong></a>
        <br>
        <a href="https://www.youtube.com/watch?v=R0V1ZdCuTgc">クイックスタート動画</a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://fly.io"><img src="../../assets/deployment-options/fly-io.svg" alt="Fly.io" width="140"></a>
      </td>
      <td valign="top">
        Fly Machines 上で Node Docker runtime を実行し、SQLite を Fly volume に永続化します。複数
        machine では PostgreSQL も使えます。Fly は TLS、health check、rolling deploy、custom domain
        を提供します。
        <br><br>
        <strong>利点:</strong> 通常の Docker host に近く、永続 volume、リージョン配置、わかりやすい
        scaling が使えます。
        <br><br>
        <strong>料金:</strong> 秒単位の従量課金です。常時起動の小型 shared-cpu-1x は約 $2/月、1 GB RAM
        は約 $6/月です。Volume は別料金です。
        <a href="https://fly.io/docs/about/pricing/">Fly.io の料金</a> を参照してください。
      </td>
      <td valign="middle" align="center">
        <a href="../fly-io.md"><strong>デプロイガイド</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/"><img src="../../assets/deployment-options/repocloud.svg" alt="RepoCloud" width="140"></a>
      </td>
      <td valign="top">
        マーケットプレイスからワンクリックでデプロイします。RepoCloud が公開済み Docker image を実行し、TLS、
        custom domain、resource tier を扱います。RepoCloud アカウント以外の Docker やクラウドアカウントは不要です。
        <br><br>
        <strong>利点:</strong> hosted instance を最も早く用意でき、前払いの時間課金、一時停止時は通常料金の
        25% です。
        <br><br>
        <strong>料金:</strong> Container Apps は 1 GB RAM / 1 vCPU で $3/月から。時間単位の前払い
        credit で、長期契約はありません。
        <a href="https://repocloud.io/pricing">RepoCloud の料金</a> を参照してください。
      </td>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/details/Open%20Connector/"><strong>ワンクリックデプロイ</strong></a>
      </td>
    </tr>
  </tbody>
</table>
