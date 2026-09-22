# ADRs

## ADR-001 — Executar o core num cluster k3d de 3 nós

- **Status:** Accepted
- **Contexto:** O laboratório precisa praticar Kubernetes multi-nó sem depender de um cluster gerido.
- **Decisão:** Usar k3d com um server/control-plane e dois agents.
- **Consequência:** O ambiente continua local, mas permite praticar conceitos de cluster, networking, storage e ingress entre nós.

## ADR-002 — Usar MinIO como object storage

- **Status:** Accepted
- **Contexto:** Mimir, Loki e Tempo precisam de um backend S3-compatible no laboratório.
- **Decisão:** Usar MinIO dentro do cluster.
- **Buckets:** `mimir-blocks`, `loki-chunks`, `tempo-traces`, `backups`.
- **Consequência:** O mesmo object storage é usado pelos três componentes, mantendo credenciais e policies separadas por consumidor.

## ADR-003 — Começar com MinIO standalone

- **Status:** Accepted
- **Contexto:** O objectivo inicial é aprender o fluxo completo antes de introduzir complexidade adicional.
- **Decisão:** Usar single-drive no lab base.
- **Extensão:** MinIO distributed com 4 drives para praticar erasure coding.
- **Consequência:** O lab base é mais simples de operar e a versão distribuída permanece como exercício adicional.

## ADR-004 — Usar CloudNativePG para PostgreSQL

- **Status:** Accepted
- **Contexto:** O PostgreSQL é necessário para Keycloak e Grafana.
- **Decisão:** Usar o operador CloudNativePG.
- **Consequência:** O laboratório permite praticar um PostgreSQL gerido por operador dentro do Kubernetes e, opcionalmente, failover com três instâncias.

## ADR-005 — Usar Keycloak + OIDC para Grafana

- **Status:** Accepted
- **Contexto:** O Grafana precisa de autenticação federada e de roles baseadas em grupos.
- **Decisão:** Keycloak fornece OIDC ao Grafana.
- **Configuração:** Realm `observability-lab`, client `grafana`, grupos `lab-admins` e `lab-viewers`.
- **Consequência:** A autenticação e autorização humana ficam separadas da autenticação usada para ingestão de telemetria.

## ADR-006 — Activar multi-tenancy desde o início

- **Status:** Accepted
- **Contexto:** O objectivo do laboratório inclui uma plataforma multi-tenant.
- **Decisão:** Activar multi-tenancy no Mimir e no Loki desde o início.
- **Mecanismo:** `X-Scope-OrgID`.
- **Consequência:** O isolamento de tenants faz parte da arquitectura base e pode ser validado antes da expansão do laboratório.

## ADR-007 — Resolver tenant no gateway de ingestão

- **Status:** Accepted
- **Contexto:** Os clientes enviam telemetria para uma entrada única.
- **Decisão:** NGINX/OpenResty resolve o Bearer token para um tenant e injecta `X-Scope-OrgID`.
- **Consequência:** A aplicação cliente não precisa de controlar directamente o header de tenancy usado internamente pelo core.

## ADR-008 — Separar edge e core

- **Status:** Accepted
- **Contexto:** O laboratório precisa simular uma plataforma central recebendo telemetria de uma rede de cliente.
- **Decisão:** Alloy e aplicação Java correm fora do cluster k3d, em Docker Compose próprio.
- **Consequência:** A fronteira de rede entre cliente e plataforma torna-se parte do exercício.

## ADR-009 — Usar Grafana Alloy na edge

- **Status:** Accepted
- **Contexto:** A edge precisa receber OTLP, fazer scraping, recolher logs, processar dados e manter uma fila durante falhas de rede.
- **Decisão:** Usar Grafana Alloy.
- **Consequência:** Um único componente na edge cobre as funções de recepção, processamento e exportação previstas pelo lab.

## ADR-010 — Usar OpenTelemetry Java Agent

- **Status:** Accepted
- **Contexto:** A aplicação Java precisa produzir sinais reais sem começar por instrumentação manual.
- **Decisão:** Usar `opentelemetry-javaagent` com `-javaagent`.
- **Consequência:** A primeira versão da aplicação permanece simples e o foco fica no fluxo de observabilidade.

## ADR-011 — Usar Grafana como camada de acesso e alerting

- **Status:** Accepted
- **Contexto:** O lab precisa consultar os três sinais e criar alertas.
- **Decisão:** Grafana será ligado a Mimir, Loki e Tempo e será usado para alerting.
- **Consequência:** O laboratório valida observabilidade e alerting através de uma interface central.

## ADR-012 — Adicionar meta-monitoring e dead-man switch

- **Status:** Accepted
- **Contexto:** Um sistema de observabilidade também precisa detectar quando deixou de receber dados.
- **Decisão:** Criar um pipeline de meta-monitoring e um dead-man switch externo.
- **Consequência:** O laboratório cobre também o cenário em que a ausência de dados impede que alertas normais sejam disparados.
