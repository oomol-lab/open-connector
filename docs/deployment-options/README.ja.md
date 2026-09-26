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
    <tr>
      <td valign="middle" align="center">
        <a href="https://nibrun.com/"><img src="../../assets/deployment-options/nibrun.svg" alt="nibrun" width="140"></a>
      </td>
      <td valign="top">
        Linux x64 の release binary を専用の Firecracker microVM で実行します。永続 disk と HTTPS URL が
        付きます。deploy link は binary の URL、port、environment variable を事前入力し、フォームで入力する
        secret を一覧表示します。nibrun 以外の Dockerfile やクラウドアカウントは不要です。
        <br><br>
        <strong>利点:</strong> single binary をワンクリックでデプロイでき、最初の app は無料で、アイドル状態の
        app は 5 分でスリープし次のリクエストで復帰します。
        <br><br>
        <strong>料金:</strong> 最初の 3 app は無料で、それ以降は 1 app あたり $1/月です。各 app は 1 vCPU、
        256 MiB RAM、8 GiB disk なので、deploy link はこの memory 上限に収まるように
        <code>OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS</code> を有効にします。
        <a href="https://nibrun.com/#pricing">nibrun の料金</a> を参照してください。
      </td>
      <td valign="middle" align="center">
        <a href="https://app.nibrun.com/deploy?name=open-connector&amp;binary=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector%2Freleases%2Flatest%2Fdownload%2Fopen-connector-linux-x64&amp;port=3000&amp;env=HOST%3D0.0.0.0&amp;env=OOMOL_CONNECT_DATA_DIR%3D%24%7BNIBRUN_DATA_DIR%7D&amp;env=OOMOL_CONNECT_ORIGIN%3Dhttps%3A%2F%2F%24%7BNIBRUN_HOSTNAME%7D&amp;env=OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS%3Dtrue&amp;env=OOMOL_CONNECT_ENCRYPTION_KEY&amp;env=OOMOL_CONNECT_ADMIN_TOKEN&amp;env=OOMOL_CONNECT_RUNTIME_TOKEN"><strong>ワンクリックデプロイ</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/"><img src="../../assets/deployment-options/nexus-ai.svg" alt="NEXUS AI" width="140"></a>
      </td>
      <td valign="top">
        repository の <code>docker/Dockerfile</code> を build し、専用の HTTPS URL を持つ container で
        実行します。deploy link は <code>OOMOL_CONNECT_ORIGIN</code> をその URL に設定し、admin token を
        フォームで入力させ、encryption key と runtime token を生成するため、Web Console とすべての API は
        最初の起動から認証が必要です。secret はフォームで入力するか server で生成され、link には含まれません。
        <br><br>
        <strong>利点:</strong> source からワンクリックでデプロイでき、log と redeploy を 1 つの dashboard で
        管理でき、有料プランでは custom domain を使えます。SQLite database は container 内にあり、再起動では
        保持されますが rebuild では保持されないため、長期保存するデータには
        <code>OOMOL_CONNECT_DATABASE_URL</code> を PostgreSQL に設定してください。
        <br><br>
        <strong>料金:</strong> Free プランは public HTTPS URL 付きの active deployment 1 つを含み、
        クレジットカードは不要です。test deployment は自動的に期限切れになります。Starter は $29/月で
        active deployment 2 つと custom domain、Pro は $149/月で 5 つです。各 app は 512 MB RAM です。
        <a href="https://nexusai.run/pricing">NEXUS AI の料金</a> を参照してください。
      </td>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/deploy?repo=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector&amp;dockerfile=docker%2FDockerfile&amp;env=OOMOL_CONNECT_ORIGIN%3D%7Burl%7D&amp;require=OOMOL_CONNECT_ADMIN_TOKEN&amp;generate=OOMOL_CONNECT_ENCRYPTION_KEY&amp;generate=OOMOL_CONNECT_RUNTIME_TOKEN&amp;template=open-connector"><strong>ワンクリックデプロイ</strong></a>
      </td>
    </tr>
  </tbody>
</table>
