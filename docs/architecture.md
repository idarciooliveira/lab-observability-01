# Architecture

## 1. Visão geral

A arquitectura do laboratório representa uma plataforma de observabilidade multi-tenant em escala reduzida.

O desenho possui duas zonas principais:

- **Edge**: fora do cluster k3d, representando a rede de um cliente.
- **Core**: dentro do cluster k3d, contendo storage, identidade, LGTM e routing.

A edge recebe telemetria da aplicação Java, processa os dados e exporta-os por HTTPS para o gateway do core.

## 2. Edge

A edge é executada em Docker Compose próprio.

### Componentes

- Grafana Alloy
- Blackbox Exporter
- Aplicação Java Spring Boot

### Responsabilidades do Alloy

O Alloy deve:

1. Receber OTLP em:
   - `4317` para gRPC
   - `4318` para HTTP
2. Fazer scraping de métricas.
3. Fazer tailing dos logs dos containers.
4. Processar a telemetria:
   - mascarar PII;
   - adicionar `tenant`;
   - adicionar `env`;
   - fazer batching.
5. Manter uma fila persistente em disco.
6. Exportar OTLP/HTTP por HTTPS para o gateway.

A fila persistente deve permitir que a edge continue a receber dados durante uma interrupção temporária da ligação ao core.

## 3. Cluster k3d

O core é executado num cluster k3s criado através de k3d.

### Topologia

- 1 server / control-plane
- 2 agents

### Namespaces

```text
storage
identity
observability
ingress
clients
```

O `local-path` deve ser a StorageClass default.

Um registry local do k3d é usado para imagens construídas durante o laboratório.

## 4. Storage

O MinIO corre no namespace `storage`.

Buckets:

```text
mimir-blocks
loki-chunks
tempo-traces
backups
```

Cada consumidor possui credenciais e policy próprias.

| Consumidor | Bucket |
|---|---|
| Mimir | `mimir-blocks` |
| Loki | `loki-chunks` |
| Tempo | `tempo-traces` |
| Backup | `backups` |

As credenciais root do MinIO ficam reservadas à administração.

## 5. Identity

O PostgreSQL é gerido pelo CloudNativePG.

Bases:

```text
keycloak
grafana
```

O Keycloak usa:

```text
Realm: observability-lab
Client: grafana
```

Grupos:

```text
lab-admins
lab-viewers
```

O client OIDC inclui o grupo no token através do claim:

```text
groups
```

O Grafana usa esse claim para atribuir roles.

## 6. Core LGTM

O namespace `observability` contém:

- Mimir
- Loki
- Tempo
- Grafana
- 2 instâncias de Memcached

Para o laboratório, cada componente LGTM utiliza modo monolítico.

### Storage

Mimir, Loki e Tempo usam MinIO como backend S3-compatible.

### Multi-tenancy

Mimir e Loki têm multi-tenancy activa desde o início.

O tenant é identificado através de:

```http
X-Scope-OrgID
```

### Grafana

O Grafana:

- usa PostgreSQL;
- autentica via Keycloak/OIDC;
- possui datasources provisionados para Mimir, Loki e Tempo.

## 7. Ingress e gateway

O Traefik funciona como ingress controller.

O TLS é fornecido através de:

- cert-manager com issuer self-signed; ou
- mkcert para certificados confiáveis localmente.

O gateway de ingestão é NGINX ou OpenResty.

Fluxo lógico:

```text
Bearer token
      ↓
Gateway
      ↓
resolução token → tenant
      ↓
X-Scope-OrgID
      ↓
Mimir / Loki / Tempo
```

O gateway também aplica rate limiting por tenant.

## 8. Tenancy

O laboratório deve ter pelo menos dois tenants de teste.

O objectivo é provar que:

```text
Tenant A → dados de A
Tenant B → dados de B
```

Uma credencial do tenant A não deve permitir que os dados sejam associados ao tenant B.

O gateway é responsável por resolver a credencial e definir o `X-Scope-OrgID` antes do encaminhamento.

## 9. Aplicação Java

A aplicação usa Spring Boot 3.x e o OpenTelemetry Java Agent.

A instrumentação inicial é zero-code:

```text
-javaagent
```

Variáveis principais:

```text
OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_SERVICE_NAME
OTEL_RESOURCE_ATTRIBUTES
```

A aplicação possui pelo menos:

1. endpoint rápido e estável;
2. endpoint com latência variável;
3. endpoint que falha de forma controlada.

Os logs são estruturados em JSON.

## 10. Alerting e meta-monitoring

O Grafana possui regras para:

- taxa de erro;
- latência.

Um pipeline de Alloy separado ou uma configuração adicional faz meta-monitoring do próprio core.

Esse pipeline utiliza um tenant próprio:

```text
meta
```

O dead-man switch corre fora do cluster e verifica a idade do heartbeat mais recente no Mimir.

Se o heartbeat ultrapassar o limite definido, o processo dispara um alerta.

## 11. Fluxo completo

```text
Java App
   │
   │ OTLP
   ▼
Grafana Alloy
   │
   │ HTTPS / OTLP
   ▼
Traefik
   │
   ▼
Ingestion Gateway
   │
   ├── resolve token
   ├── resolve tenant
   ├── rate limit
   └── inject X-Scope-OrgID
   │
   ├──────────────┬──────────────┐
   ▼              ▼              ▼
 Mimir           Loki           Tempo
   │              │              │
   └──────────────┼──────────────┘
                  ▼
                MinIO

Grafana ── OIDC ──> Keycloak ──> PostgreSQL
```

## 12. Deployment model

O laboratório mantém uma separação física entre edge e core:

```text
Docker Compose
     │
     └── Edge
          Alloy + Java + Blackbox

             HTTPS

k3d
 ├── Ingress
 ├── Gateway
 ├── LGTM
 ├── Keycloak
 ├── PostgreSQL
 └── MinIO
```

Esta separação é importante para praticar a fronteira entre a infraestrutura do cliente e a plataforma central de observabilidade.
