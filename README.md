# Lab de Observabilidade

Java · k3s (k3d) de 3 nós · Stack LGTM · Grafana Alloy na edge · MinIO · Keycloak

## Objetivo

Este laboratório replica, em escala reduzida e local, uma plataforma de observabilidade multi-tenant real.

A arquitectura separa:

- **Edge**: simula a rede de um cliente e recebe a telemetria da aplicação Java.
- **Core**: executa dentro de um cluster k3s e contém LGTM, identidade e object storage.
- **Gateway**: recebe a telemetria da edge, resolve o tenant e encaminha os dados para o componente LGTM correcto.

O laboratório foi concebido para orientar a construção e a validação por fases. Não é um script de instalação.

## O que será praticado

- k3s multi-nó via k3d
- StorageClass, ingress, DNS interno e networking entre nós
- MinIO como object storage S3-compatible para Mimir, Loki e Tempo
- Keycloak + OIDC para autenticação do Grafana
- Multi-tenancy com `X-Scope-OrgID`
- Grafana Alloy na edge
- Recepção OTLP, scraping, tailing de logs, processamento e fila persistente
- Instrumentação de uma aplicação Java com OpenTelemetry Java Agent
- Alerting, meta-monitoring e dead-man switch

## Dependências

1. Cluster k3d
2. MinIO
3. PostgreSQL + Keycloak
4. Core LGTM
5. Ingress multi-tenant
6. Edge com Alloy
7. Aplicação Java
8. Alerting e dead-man switch

## Ambiente

Requisitos indicados pelo laboratório:

- Docker
- k3d >= 5.7
- kubectl
- Helm
- Pelo menos 8 vCPU e 16 GB de RAM disponíveis para o Docker

## Estrutura

```text
lab-observability/
├── cluster/
│   └── k3d-config.yaml
├── infra/
│   ├── storage/
│   ├── identity/
│   └── core/
├── ingress/
│   ├── traefik/
│   └── gateway/
├── edge/
│   └── alloy/
│       ├── config.alloy
│       └── docker-compose.yml
├── app/
│   └── java-demo-service/
└── docs/
    ├── README.md
    ├── architecture.md
    ├── diagram.md
    └── adr.md
```

## Fases

| Fase | Componente | Resultado esperado |
|---|---|---|
| 1 | k3d | Cluster de 3 nós funcional |
| 2 | MinIO | Buckets e credenciais isoladas |
| 3 | PostgreSQL + Keycloak | Identidade e OIDC preparados |
| 4 | Core LGTM | Mimir, Loki, Tempo e Grafana funcionais |
| 5 | Ingress multi-tenant | TLS, autenticação de ingestão e routing por tenant |
| 6 | Alloy | Pipeline de telemetria na edge |
| 7 | Java | Métricas, logs e traces reais |
| 8 | Alerting | Alertas, meta-monitoring e dead-man switch |

## Critério geral de conclusão

O laboratório está concluído quando uma aplicação Java gera telemetria na edge e essa telemetria atravessa o gateway, é associada ao tenant correcto e chega ao Mimir, Loki e Tempo, com Grafana autenticado pelo Keycloak.

Além disso, deve ser possível demonstrar isolamento entre pelo menos dois tenants e detectar a interrupção do heartbeat através do dead-man switch.

## Fonte

Este conjunto de documentos foi separado a partir do guia original do laboratório fornecido para este projecto. O guia original define as especificações, fases e critérios de validação.
