# 部署方案

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[OOMOL 代管](https://oomol.com/docs/connector-saas/)與
[自行代管](https://oomol.com/docs/openconnector-self-hosting/)見
[README](../README.zh-TW.md)。本頁列出可部署 OpenConnector 的其他代管平台。後續新增的部署方案也會寫在這裡。

下列價格來自各平台公開標價，上線前請以官方定價頁為準。這些平台需要你自行註冊 OAuth 應用程式；若需要代管 OAuth，請使用 OOMOL 代管。

<table>
  <thead>
    <tr>
      <th align="left" width="22%">平台</th>
      <th align="left">說明</th>
      <th align="center" width="18%">部署</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="middle" align="center">
        <a href="https://www.cloudflare.com/"><img src="../../assets/deployment-options/cloudflare.svg" alt="Cloudflare" width="140"></a>
      </td>
      <td valign="top">
        在你的 Cloudflare 帳號中以 Workers 執行 runtime，以 D1 儲存狀態，以 R2 或 Workers KV
        存放傳輸檔案，並以 Static Assets 提供 Web 控制台。
        <br><br>
        <strong>優點：</strong>全球邊緣網路、可縮至零、免費額度較充足，R2 無輸出流量費用。部署與 OAuth
        應用程式由你管理。
        <br><br>
        <strong>價格：</strong>Workers Free 每天包含 100,000 次請求。Workers Paid 起價 $5/月，包含
        1,000 萬次請求。D1 與 R2 也有免費額度。見
        <a href="https://developers.cloudflare.com/workers/platform/pricing/">Cloudflare Workers 定價</a>。
      </td>
      <td valign="middle" align="center">
        <a href="../cloudflare.md"><strong>部署指南</strong></a>
        <br>
        <a href="https://www.youtube.com/watch?v=R0V1ZdCuTgc">快速入門影片</a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://fly.io"><img src="../../assets/deployment-options/fly-io.svg" alt="Fly.io" width="140"></a>
      </td>
      <td valign="top">
        在 Fly Machines 上執行 Node Docker runtime，將 SQLite 持久化到 Fly volume；多實例時可改用
        PostgreSQL。Fly 提供 TLS、健康檢查、滾動發布與自訂網域。
        <br><br>
        <strong>優點：</strong>接近一般 Docker 主機，具備持久化磁碟區、區域選擇與直覺的擴縮容。
        <br><br>
        <strong>價格：</strong>按秒計費。一台常開的小型 shared-cpu-1x 約 $2/月；1 GB RAM 約
        $6/月。Volume 另計。見 <a href="https://fly.io/docs/about/pricing/">Fly.io 定價</a>。
      </td>
      <td valign="middle" align="center">
        <a href="../fly-io.md"><strong>部署指南</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/"><img src="../../assets/deployment-options/repocloud.svg" alt="RepoCloud" width="140"></a>
      </td>
      <td valign="top">
        應用程式市集一鍵部署。RepoCloud 執行已發布的 Docker 映像檔，並處理 TLS、自訂網域與資源層級。除
        RepoCloud 帳號外，不需要本機 Docker 或其他雲端帳號。
        <br><br>
        <strong>優點：</strong>最快取得代管執行個體，採預付小時計費，暫停時以正常費率的 25% 計費。
        <br><br>
        <strong>價格：</strong>Container Apps 從 $3/月起 (1 GB RAM / 1 vCPU)。按小時預付額度，無長期合約。見
        <a href="https://repocloud.io/pricing">RepoCloud 定價</a>。
      </td>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/details/Open%20Connector/"><strong>一鍵部署</strong></a>
      </td>
    </tr>
  </tbody>
</table>
