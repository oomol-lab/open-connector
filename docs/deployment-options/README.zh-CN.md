# 部署方案

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [Русский](README.ru.md) | [Français](README.fr.md)

[OOMOL 托管](https://oomol.com/docs/connector-saas/)和
[自托管](https://oomol.com/docs/openconnector-self-hosting/)见
[README](../README.zh-CN.md)。本页列出可以部署 OpenConnector 的其他托管平台。后续新增的部署方案也会写在这里。

下面的价格来自各平台公开标价，上线前请以官方定价页为准。这些平台需要你自行注册 OAuth 应用；需要托管 OAuth 时请使用 OOMOL 托管。

<table>
  <thead>
    <tr>
      <th align="left" width="22%">平台</th>
      <th align="left">说明</th>
      <th align="center" width="18%">部署</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td valign="middle" align="center">
        <a href="https://www.cloudflare.com/"><img src="../../assets/deployment-options/cloudflare.svg" alt="Cloudflare" width="140"></a>
      </td>
      <td valign="top">
        在你的 Cloudflare 账号中用 Workers 运行 runtime，用 D1 保存状态，用 R2 或 Workers KV
        存放中转文件，用 Static Assets 提供 Web 控制台。
        <br><br>
        <strong>优点：</strong>全球边缘网络、可缩到零、免费额度较充足，R2 无出站流量费用。部署和 OAuth
        应用由你管理。
        <br><br>
        <strong>价格：</strong>Workers Free 每天包含 100,000 次请求。Workers Paid 起价 $5/月，包含
        1000 万次请求。D1 和 R2 也有免费额度。见
        <a href="https://developers.cloudflare.com/workers/platform/pricing/">Cloudflare Workers 定价</a>。
      </td>
      <td valign="middle" align="center">
        <a href="../cloudflare.md"><strong>部署指南</strong></a>
        <br>
        <a href="https://www.youtube.com/watch?v=R0V1ZdCuTgc">快速启动视频</a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://fly.io"><img src="../../assets/deployment-options/fly-io.svg" alt="Fly.io" width="140"></a>
      </td>
      <td valign="top">
        在 Fly Machines 上运行 Node Docker runtime，SQLite 持久化到 Fly volume；多实例时可改用
        PostgreSQL。Fly 提供 TLS、健康检查、滚动发布和自定义域名。
        <br><br>
        <strong>优点：</strong>接近常规 Docker 主机，有持久化卷、区域选择和直观的扩缩容。
        <br><br>
        <strong>价格：</strong>按秒计费。一台常开的小型 shared-cpu-1x 大约 $2/月；1 GB RAM 大约
        $6/月。Volume 另计。见 <a href="https://fly.io/docs/about/pricing/">Fly.io 定价</a>。
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
        应用市场一键部署。RepoCloud 运行已发布的 Docker 镜像，并处理 TLS、自定义域名和资源档位。除
        RepoCloud 账号外，不需要本地 Docker 或其他云账号。
        <br><br>
        <strong>优点：</strong>最快拿到托管实例，按小时预付费，暂停时按正常费率的 25% 计费。
        <br><br>
        <strong>价格：</strong>Container Apps 从 $3/月起 (1 GB RAM / 1 vCPU)。按小时预付积分，无长期合约。见
        <a href="https://repocloud.io/pricing">RepoCloud 定价</a>。
      </td>
      <td valign="middle" align="center">
        <a href="https://repocloud.io/details/Open%20Connector/"><strong>一键部署</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nibrun.com/"><img src="../../assets/deployment-options/nibrun.svg" alt="nibrun" width="140"></a>
      </td>
      <td valign="top">
        在独立的 Firecracker microVM 中运行 Linux x64 发行版二进制文件，带持久化磁盘和 HTTPS 地址。部署链接会
        预填二进制文件地址、端口和环境变量，并列出需要你在表单里填写的密钥。除 nibrun 外，不需要 Dockerfile 或
        其他云账号。
        <br><br>
        <strong>优点：</strong>单文件二进制一键部署，前几个应用免费，闲置应用 5 分钟后休眠并在下次请求时唤醒。
        <br><br>
        <strong>价格：</strong>前 3 个应用免费，之后每个应用 $1/月。每个应用配 1 vCPU、256 MiB RAM 和 8 GiB
        磁盘，因此部署链接会开启 <code>OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS</code> 以控制在该内存上限内。见
        <a href="https://nibrun.com/#pricing">nibrun 定价</a>。
      </td>
      <td valign="middle" align="center">
        <a href="https://app.nibrun.com/deploy?name=open-connector&amp;binary=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector%2Freleases%2Flatest%2Fdownload%2Fopen-connector-linux-x64&amp;port=3000&amp;env=HOST%3D0.0.0.0&amp;env=OOMOL_CONNECT_DATA_DIR%3D%24%7BNIBRUN_DATA_DIR%7D&amp;env=OOMOL_CONNECT_ORIGIN%3Dhttps%3A%2F%2F%24%7BNIBRUN_HOSTNAME%7D&amp;env=OOMOL_CONNECT_CATALOG_LAZY_SCHEMAS%3Dtrue&amp;env=OOMOL_CONNECT_ENCRYPTION_KEY&amp;env=OOMOL_CONNECT_ADMIN_TOKEN&amp;env=OOMOL_CONNECT_RUNTIME_TOKEN"><strong>一键部署</strong></a>
      </td>
    </tr>
    <tr>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/"><img src="../../assets/deployment-options/nexus-ai.svg" alt="NEXUS AI" width="140"></a>
      </td>
      <td valign="top">
        将仓库的 <code>docker/Dockerfile</code> 构建为带有独立 HTTPS URL 的容器。部署链接会把
        <code>OOMOL_CONNECT_ORIGIN</code> 设为该 URL，在表单中要求填写 admin token，并生成 encryption key 和
        runtime token，因此 Web Console 和所有 API 从第一次启动起就需要认证。secret 在表单中填写或由服务器
        生成，绝不会出现在链接中。
        <br><br>
        <strong>优点：</strong> 从源码一键部署，在同一个控制台查看日志和重新部署，付费套餐支持自定义域名。SQLite
        数据库位于容器内：重启后保留，但重新构建后不保留，因此需要长期保存的数据请把
        <code>OOMOL_CONNECT_DATABASE_URL</code> 设为 PostgreSQL。
        <br><br>
        <strong>价格：</strong> Free 套餐包含 1 个带公共 HTTPS URL 的活跃部署，无需信用卡；测试部署会自动过期。
        Starter 为 $29/月，含 2 个活跃部署和自定义域名；Pro 为 $149/月，含 5 个。每个应用有 512 MB 内存。参见<a href="https://nexusai.run/pricing">NEXUS AI 定价</a>。
      </td>
      <td valign="middle" align="center">
        <a href="https://nexusai.run/deploy?repo=https%3A%2F%2Fgithub.com%2Foomol-lab%2Fopen-connector&amp;dockerfile=docker%2FDockerfile&amp;env=OOMOL_CONNECT_ORIGIN%3D%7Burl%7D&amp;require=OOMOL_CONNECT_ADMIN_TOKEN&amp;generate=OOMOL_CONNECT_ENCRYPTION_KEY&amp;generate=OOMOL_CONNECT_RUNTIME_TOKEN&amp;template=open-connector"><strong>一键部署</strong></a>
      </td>
    </tr>
  </tbody>
</table>
