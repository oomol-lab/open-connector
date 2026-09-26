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
    <tr>
      <td valign="middle" align="center">
        <a href="https://nibrun.com/"><img src="../../assets/deployment-options/nibrun.svg" alt="nibrun" width="140"></a>
      </td>
      <td valign="top">
        在獨立的 Firecracker microVM 中執行 Linux x64 發行版二進位檔，帶持久磁碟與 HTTPS 網址。部署連結會
        預先填入二進位檔網址、連接埠與環境變數，並列出需要你在表單裡填寫的密鑰。除 nibrun 外，不需要 Dockerfile
        或其他雲端帳號。
        <br><br>
        <strong>優點：</strong>單一二進位檔一鍵部署，前幾個應用程式免費，閒置應用程式 5 分鐘後休眠並在下次請求時
        喚醒。
        <br><br>
        <strong>價格：</strong>前 3 個應用程式免費，之後每個應用程式 $1/月。每個應用程式配備 1 vCPU、256 MiB
        RAM 與 8 GiB 磁碟，因此部署連結會啟用 <code>OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS</code> 以控制在該記憶體
        上限內。見 <a href="https://nibrun.com/#pricing">nibrun 定價</a>。
      </td>
      <td valign="middle" align="center">
        <a href="https://app.nibrun.com/deploy?name=open-connector&amp;binary=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector%2Freleases%2Flatest%2Fdownload%2Fopen-connector-linux-x64&amp;port=3000&amp;env=HOST%3D0.0.0.0&amp;env=OOMOL_CONNECT_DATA_DIR%3D%24%7BNIBRUN_DATA_DIR%7D&amp;env=OOMOL_CONNECT_ORIGIN%3Dhttps%3A%2F%2F%24%7BNIBRUN_HOSTNAME%7D&amp;env=OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS%3Dtrue&amp;env=OOMOL_CONNECT_ENCRYPTION_KEY&amp;env=OOMOL_CONNECT_ADMIN_TOKEN&amp;env=OOMOL_CONNECT_RUNTIME_TOKEN"><strong>一鍵部署</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/"><img src="../../assets/deployment-options/nexus-ai.svg" alt="NEXUS AI" width="140"></a>
      </td>
      <td valign="top">
        將儲存庫的 <code>docker/Dockerfile</code> 建置為具有獨立 HTTPS URL 的容器。部署連結會把
        <code>OOMOL_CONNECT_ORIGIN</code> 設為該 URL，在表單中要求填寫 admin token，並產生 encryption key 和
        runtime token，因此 Web Console 和所有 API 從第一次啟動起就需要驗證。secret 在表單中填寫或由伺服器
        產生，絕不會出現在連結中。
        <br><br>
        <strong>優點：</strong> 從原始碼一鍵部署，在同一個主控台查看日誌和重新部署，付費方案支援自訂網域。SQLite
        資料庫位於容器內：重新啟動後保留，但重新建置後不保留，因此需要長期保存的資料請把
        <code>OOMOL_CONNECT_DATABASE_URL</code> 設為 PostgreSQL。
        <br><br>
        <strong>價格：</strong> Free 方案包含 1 個具公開 HTTPS URL 的活躍部署，無需信用卡；測試部署會自動過期。
        Starter 為 $29/月，含 2 個活躍部署和自訂網域；Pro 為 $149/月，含 5 個。每個應用程式有 512 MB 記憶體。參見<a href="https://nexusai.run/pricing">NEXUS AI 定價</a>。
      </td>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/deploy?repo=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector&amp;dockerfile=docker%2FDockerfile&amp;env=OOMOL_CONNECT_ORIGIN%3D%7Burl%7D&amp;require=OOMOL_CONNECT_ADMIN_TOKEN&amp;generate=OOMOL_CONNECT_ENCRYPTION_KEY&amp;generate=OOMOL_CONNECT_RUNTIME_TOKEN&amp;template=open-connector"><strong>一鍵部署</strong></a>
      </td>
    </tr>
  </tbody>
</table>
