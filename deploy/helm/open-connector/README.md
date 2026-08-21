# OpenConnector Helm chart

A production-grade Helm chart for [OpenConnector](https://github.com/oomol-lab/open-connector) - the open-source connector gateway for AI agents.

The chart defaults mirror `docker compose up` so a fresh `helm install` gives you a working runtime in seconds. Flip a handful of switches in your prod values overlay to enable Ingress, autoscaling, network policy, ServiceMonitor, and PostgreSQL-backed migrations.

## TL;DR

```bash
# 1. Try it locally (mirrors `docker compose up`)
helm install open-connector ./deploy/helm/open-connector \
  --set secret.encryptionKey="$(openssl rand -hex 32)" \
  --set secret.adminToken="$(openssl rand -hex 24)" \
  --namespace open-connector --create-namespace

# 2. Port-forward and verify
kubectl -n open-connector port-forward svc/open-connector 3000:3000
curl -s http://localhost:3000/health
# -> {"ok":true}

# 3. Smoke-test a no-auth Action
curl -s -X POST http://localhost:3000/v1/actions/hackernews.get_top_stories \
  -H 'content-type: application/json' \
  -d '{"input":{}}'
```

## Production install (PostgreSQL + Ingress + TLS + autoscaling)

Create a `values-prod.yaml`:

```yaml
replicaCount: 3
image:
  tag: 1.4.0          # pin a release
ingress:
  enabled: true
  className: nginx
  hosts:
    - host: connector.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - hosts: [connector.example.com]
      secretName: connector-tls

database:
  enabled: true
  # Either set `url` directly (inline, see example below) OR reference
  # an externally-managed Secret via `existingUrlSecret` + key. Do NOT
  # set both at the same time.
  existingUrlSecret: open-connector-db
  existingUrlSecretKey: url
  migration:
    enabled: true

# Example with the URL inlined (use only when you cannot use an external
# Secret manager). NEVER commit real credentials to values.yaml:
#   database:
#     enabled: true
#     url: "postgresql://USER:PASSWORD@HOST:5432/DBNAME?sslmode=verify-full"
#     migration:
#       enabled: true

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

podDisruptionBudget:
  enabled: true
  minAvailable: 2

networkPolicy:
  enabled: true

metrics:
  enabled: true

config:
  origin: https://connector.example.com
  allowedActions: "github.*,hackernews.*,slack.*"
  allowedProxies: "github,slack"
  transitFileBackend: s3
  s3Bucket: open-connector-transit
  s3Region: us-east-1
  s3Endpoint: https://s3.amazonaws.com

# Reference external Secret sources rather than templating values here.
secret:
  existingSecret: open-connector-secrets
```

Install:

```bash
helm upgrade --install open-connector ./deploy/helm/open-connector \
  -f values-prod.yaml \
  --namespace open-connector --create-namespace
```

## Configuration

| Value | Description | Default |
|---|---|---|
| `replicaCount` | Number of Deployment replicas | `1` |
| `image.repository` | OCI image | `ghcr.io/oomol-lab/open-connector` |
| `image.tag` | Image tag | `latest` |
| `imageDigest` | Pin by digest (overrides `tag`) | `""` |
| `service.type` | `ClusterIP` / `NodePort` / `LoadBalancer` | `ClusterIP` |
| `service.port` | Service port | `3000` |
| `ingress.enabled` | Create an Ingress | `false` |
| `persistence.enabled` | Create a PVC for `/app/data` | `true` |
| `persistence.size` | PVC size | `5Gi` |
| `database.enabled` | Use PostgreSQL instead of SQLite | `false` |
| `database.migration.enabled` | Run a `migrate` Job as a Helm hook | `true` |
| `autoscaling.enabled` | HPA | `false` |
| `networkPolicy.enabled` | Restrict ingress to in-namespace Pods | `false` |
| `metrics.enabled` | Prometheus ServiceMonitor | `false` |
| `podDisruptionBudget.enabled` | PDB | `false` |
| `secret.existingSecret` | Use a pre-existing Secret | `""` |
| `secret.encryptionKey` | 32-byte random key (sensitive) | `""` |
| `secret.adminToken` | Bearer token for /api, /docs, / (sensitive) | `""` |

For every key under `config.*` and `secret.*`, see `docs/configuration.md` in the OpenConnector repo.

## Upgrading

```bash
helm upgrade open-connector ./deploy/helm/open-connector -f values-prod.yaml
```

The chart annotates Pod templates with the SHA-256 of the rendered ConfigMap and Secret so pods roll automatically when configuration changes.

## Rollback

```bash
helm history open-connector
helm rollback open-connector <revision>
```

For state-loss recovery, snapshot the PVC (`persistence.size`) before upgrading if you depend on SQLite state.

## Uninstall

```bash
helm uninstall open-connector
```

The PVC is **not** deleted automatically; remove it manually if you want a clean state:

```bash
kubectl -n open-connector delete pvc open-connector
```

## Security baseline

Even the "easy try" defaults ship hardened:

- Runs as non-root UID `10001` (the upstream image is root; the chart overrides this).
- `readOnlyRootFilesystem: true` with the data volume mounted at `/app/data`.
- All Linux capabilities dropped, `seccompProfile: RuntimeDefault`.
- `allowPrivilegeEscalation: false`.
- `automountServiceAccountToken: false`.

Before going to production, **set `secret.encryptionKey` and `secret.adminToken` to long random values** - without an admin token the runtime still starts, but `/api`, `/docs`, and the web console are unprotected.

## Architecture map

| File | Purpose |
|---|---|
| `Chart.yaml` | Chart metadata, version, appVersion, sources |
| `values.yaml` | All tunables, heavily commented |
| `values.schema.json` | JSON-schema validation on `helm install` |
| `templates/deployment.yaml` | Main runtime workload |
| `templates/service.yaml` | ClusterIP service on port 3000 |
| `templates/ingress.yaml` | Optional Ingress |
| `templates/serviceaccount.yaml` | Hardened ServiceAccount |
| `templates/configmap.yaml` | Non-secret OOMOL_CONNECT_* env |
| `templates/secret.yaml` | Auto-generated Secret (skipped if `existingSecret` is set) |
| `templates/pvc.yaml` | Persistent volume for SQLite/transit files |
| `templates/hpa.yaml` | Optional HPA |
| `templates/poddisruptionbudget.yaml` | Optional PDB |
| `templates/networkpolicy.yaml` | Optional NetworkPolicy |
| `templates/servicemonitor.yaml` | Optional Prometheus ServiceMonitor |
| `templates/migration-job.yaml` | Helm-hook Job for `runtime:migrate` |
| `templates/NOTES.txt` | Post-install instructions |

## License

Apache-2.0, matching the upstream OpenConnector project.