{{/*
Expand the name of the chart.
*/}}
{{- define "open-connector.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to
this (by the DNS naming spec).
*/}}
{{- define "open-connector.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "open-connector.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Common labels - applied to every resource the chart creates.
Follows the Kubernetes recommended labels:
https://kubernetes.io/docs/concepts/overview/working-with-objects/common-labels/
*/}}
{{- define "open-connector.labels" -}}
helm.sh/chart: {{ include "open-connector.chart" . }}
{{ include "open-connector.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: open-connector
{{- with .Values.podLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/*
Selector labels - stable across upgrades. MUST NOT include version or
release-specific values. Used by the Deployment selector.
*/}}
{{- define "open-connector.selectorLabels" -}}
app.kubernetes.io/name: {{ include "open-connector.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Image reference. Prefers the digest if set, otherwise falls back to tag.
*/}}
{{- define "open-connector.image" -}}
{{- $repo := .Values.image.repository -}}
{{- $digest := .Values.imageDigest -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- if $digest -}}
{{- printf "%s@%s" $repo $digest -}}
{{- else -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}
{{- end -}}

{{/*
ServiceAccount name.
*/}}
{{- define "open-connector.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "open-connector.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
PVC name. Honours existingClaim if set, otherwise generates one.
*/}}
{{- define "open-connector.pvcName" -}}
{{- if .Values.persistence.existingClaim -}}
{{- .Values.persistence.existingClaim -}}
{{- else -}}
{{- include "open-connector.fullname" . -}}
{{- end -}}
{{- end -}}

{{/*
Secret name. Honours existingSecret if set.
*/}}
{{- define "open-connector.secretName" -}}
{{- if .Values.secret.existingSecret -}}
{{- .Values.secret.existingSecret -}}
{{- else -}}
{{- include "open-connector.fullname" . -}}
{{- end -}}
{{- end -}}

{{/*
Map a snake-case secret key name to its OOMOL_CONNECT_* env-var name.
*/}}
{{- define "open-connector.secretEnvName" -}}
{{- if eq . "encryptionKey" -}}OOMOL_CONNECT_ENCRYPTION_KEY
{{- else if eq . "adminToken" -}}OOMOL_CONNECT_ADMIN_TOKEN
{{- else if eq . "runtimeToken" -}}OOMOL_CONNECT_RUNTIME_TOKEN
{{- else if eq . "jwksUri" -}}OOMOL_CONNECT_JWKS_URI
{{- else if eq . "jwtIssuer" -}}OOMOL_CONNECT_JWT_ISSUER
{{- else if eq . "jwtAudience" -}}OOMOL_CONNECT_JWT_AUDIENCE
{{- else if eq . "s3AccessKeyId" -}}OOMOL_CONNECT_S3_ACCESS_KEY_ID
{{- else if eq . "s3SecretAccessKey" -}}OOMOL_CONNECT_S3_SECRET_ACCESS_KEY
{{- else if eq . "s3SessionToken" -}}OOMOL_CONNECT_S3_SESSION_TOKEN
{{- else -}}OOMOL_CONNECT_{{ . | upper }}
{{- end -}}
{{- end -}}

{{/*
Map a config key name to its OOMOL_CONNECT_* env-var name.
*/}}
{{- define "open-connector.configEnvName" -}}
{{- if eq . "transitFileBackend" -}}OOMOL_CONNECT_TRANSIT_FILE_BACKEND
{{- else if eq . "transitFileTTLSeconds" -}}OOMOL_CONNECT_TRANSIT_FILE_TTL_SECONDS
{{- else if eq . "transitFileMaxBytes" -}}OOMOL_CONNECT_TRANSIT_FILE_MAX_BYTES
{{- else if eq . "s3Bucket" -}}OOMOL_CONNECT_S3_BUCKET
{{- else if eq . "s3Region" -}}OOMOL_CONNECT_S3_REGION
{{- else if eq . "s3Endpoint" -}}OOMOL_CONNECT_S3_ENDPOINT
{{- else if eq . "s3ForcePathStyle" -}}OOMOL_CONNECT_S3_FORCE_PATH_STYLE
{{- else if eq . "allowPrivateNetwork" -}}OOMOL_CONNECT_ALLOW_PRIVATE_NETWORK
{{- else if eq . "allowedActions" -}}OOMOL_CONNECT_ALLOWED_ACTIONS
{{- else if eq . "blockedActions" -}}OOMOL_CONNECT_BLOCKED_ACTIONS
{{- else if eq . "allowedProxies" -}}OOMOL_CONNECT_ALLOWED_PROXIES
{{- else if eq . "blockedProxies" -}}OOMOL_CONNECT_BLOCKED_PROXIES
{{- else if eq . "allowedCustomOAuth" -}}OOMOL_CONNECT_ALLOWED_CUSTOM_OAUTH
{{- else if eq . "egressTrustedHosts" -}}OOMOL_CONNECT_EGRESS_TRUSTED_HOSTS
{{- else if eq . "logLevel" -}}OOMOL_CONNECT_LOG_LEVEL
{{- else if eq . "runLimit" -}}OOMOL_CONNECT_RUN_LIMIT
{{- else if eq . "dataDir" -}}OOMOL_CONNECT_DATA_DIR
{{- else if eq . "origin" -}}OOMOL_CONNECT_ORIGIN
{{- else -}}OOMOL_CONNECT_{{ . | upper }}
{{- end -}}
{{- end -}}