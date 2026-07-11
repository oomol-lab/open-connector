[English](docker-ghcr.md) | [简体中文](docker-ghcr.zh-CN.md)

# Docker 镜像（GHCR）

OpenConnector 在 GitHub Packages 容器镜像仓库（GHCR）提供了预构建的 Docker 镜像，你无需克隆仓库或自己构建即可
运行 OpenConnector。镜像地址为：

```text
ghcr.io/oomol-lab/open-connector
```

## 选择标签（Tag）

| 标签          | 指向                             | 适用场景                               |
| ------------- | -------------------------------- | -------------------------------------- |
| `latest`      | 最新发布的 release               | 想要当前的稳定 runtime                 |
| `v1.0.0`      | 某个具体 release（不可变）       | 部署到生产环境，需要固定、可复现的构建 |
| `tip`         | `main` 上的最新 commit           | 想体验尚未发布的改动                   |
| `<short-sha>` | 某个具体 `main` commit（不可变） | 想固定到某个确切的预发布构建           |

生产环境请固定到某个 release 版本，例如 `v1.0.0`。

## 拉取

镜像是 public 的，无需登录即可拉取：

```bash
docker pull ghcr.io/oomol-lab/open-connector:latest
```

如果遇到 `unauthorized` 或 `denied` 错误，用带 `read:packages` scope 的 GitHub token 登录：

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <github-username> --password-stdin
```

镜像是多架构的（`linux/amd64` + `linux/arm64`），Docker 会自动拉取与你机器匹配的那个变体——在 Intel/AMD
主机和 arm64 主机（如 Apple Silicon、AWS Graviton）上都是原生运行，无需 `--platform` 参数。

## 运行

镜像监听 `3000` 端口，绑定到 `0.0.0.0`，并把运行时数据存放在 `/app/data`。

先生成运行时 secret 并妥善保存。`OOMOL_CONNECT_ENCRYPTION_KEY` 用于加密存储的凭据和 OAuth client secret；一旦
丢失，`/app/data` 里加密的数据将无法恢复。`OOMOL_CONNECT_ADMIN_TOKEN` 用于 admin API 和控制台的鉴权。

```bash
# 运行前请把两个值保存到密码管理器或 secrets vault。
export OOMOL_CONNECT_ENCRYPTION_KEY=$(openssl rand -base64 32)
export OOMOL_CONNECT_ADMIN_TOKEN=$(openssl rand -base64 32)
```

然后运行镜像，并挂载 volume 让数据在重启后保留：

```bash
docker run -d \
  --name open-connector \
  -p 3000:3000 \
  -v open_connector_data:/app/data \
  -e OOMOL_CONNECT_ORIGIN="https://api.example.com" \
  -e OOMOL_CONNECT_ENCRYPTION_KEY="$OOMOL_CONNECT_ENCRYPTION_KEY" \
  -e OOMOL_CONNECT_ADMIN_TOKEN="$OOMOL_CONNECT_ADMIN_TOKEN" \
  ghcr.io/oomol-lab/open-connector:latest
```

完整环境变量参考见 [configuration.md](configuration.md)，连接 provider 见 [credentials.md](credentials.md)。

### Docker Compose

仓库自带一个 [`docker-compose.yml`](../docker-compose.yml)，直接运行这个发布镜像。在仓库目录下，先 export
上面的 secret，再启动：

```bash
docker compose up
```

想改为从源码构建而不是拉取：

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

## 验证

检查健康检查端点：

```bash
curl http://localhost:3000/health
```

预期响应为：

```json
{ "ok": true }
```

## 镜像如何发布

镜像会自动构建并推送，因此上面的标签始终保持最新：每次 push 到 `main` 会更新 `tip` 并新增 `<short-sha>`
标签，每次发布 release 会新增 `latest` 和 release 版本号。每个标签都是为 `linux/amd64` 和 `linux/arm64`
原生构建的多架构 manifest。构建定义见
[`.github/workflows/publish-docker.yml`](../.github/workflows/publish-docker.yml)。
