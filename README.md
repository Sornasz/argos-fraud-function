# argos-decisions-service

Serviço de decisão de fraude por similaridade. Recebe uma transação, a transforma em um vetor de 14 dimensões, busca os 5 vizinhos mais próximos num dataset de referência rotulado (KNN exato) e responde se a transação é aprovada. Cada decisão é publicada como evento `TransactionScored` num tópico do Azure Service Bus.

Projeto da disciplina de Arquitetura de Software com Cloud (PUCPR), pensado para rodar como Azure Functions.

## Equipe

- Arthur Sornas
- Eduardo Martins
- Guilherme Marafon
- Victor Ribeiro

## Tecnologias

- Node 22 e TypeScript
- Azure Functions v4 (`@azure/functions`)
- Azure Service Bus (`@azure/service-bus`)
- Vitest (testes unitários)
- dependency-cruiser (testes e checagem de arquitetura)

## Arquitetura

Clean Architecture com Vertical Slice: o código é dividido por feature, e cada feature tem as quatro camadas.

```
src/
  main.ts                        entrada do Azure Functions
  bootstrap/config.ts            leitura e validação das variáveis de ambiente
  features/
    score-transaction/           POST /fraud-score
      domain/                    regras puras: vetorização, distância, decisão
      application/               caso de uso, validação do payload, portas e contrato TransactionScored
      infrastructure/            dataset, índice KNN, cache de idempotência, Service Bus
      api/                       handler HTTP do Azure Functions
      feature.ts                 composição da feature
      index.ts                   API pública da feature
    health-check/                GET /ready
      (mesmas camadas)
resources/                       normalization.json e mcc_risk.json
tests/                           espelha src/ e inclui tests/architecture
```

Regras de dependência (`.dependency-cruiser.cjs`):

- `domain` não importa nada fora do próprio `domain`.
- `application` importa só `domain` e a própria `application`.
- `api` não importa `infrastructure`; quem liga os adapters concretos é o `feature.ts`.
- Uma feature só enxerga outra pelo `index.ts`; `main.ts` e `bootstrap` entram nas features só pelo `index.ts`.
- Sem ciclos e sem imports não resolvidos.

## Endpoints

### `POST /fraud-score`

Corpo (campos obrigatórios no formato da Rinha de Backend 2026: `id`, `transaction`, `customer`, `merchant`, `terminal` e `last_transaction`, que pode ser `null`), mais o parâmetro opcional:

| Campo | Tipo | Uso |
|---|---|---|
| `approvalThreshold` | número em (0, 1] | limite de aprovação desta requisição. Sem ele, vale `FRAUD_APPROVAL_THRESHOLD` (padrão 0.6). A transação é aprovada quando `fraud_score < limite` |

O limite usado em cada decisão é gravado no evento, em `decision.approvalThreshold`. Valor fora do intervalo ou que não seja número devolve `400` com `invalid_fields`.

Respostas:

- `200`: `{ "approved": boolean, "fraud_score": number }`. O header `idempotent-replayed: true` indica decisão repetida do cache (mesmo `id`; nesse caso vale a decisão original, com o limite original).
- `400`: `invalid_request` (com `invalid_fields`) ou `invalid_json`.
- `503`: `index_not_ready` enquanto o dataset carrega.

### `GET /ready`

Estado do carregamento do índice, quantidade de vetores e versão do dataset. Responde `503` até o índice ficar pronto.

## Dataset de referência

O dataset não está neste repositório e não deve ser adicionado a ele. Ele vem do repositório público da Rinha de Backend 2026:

```bash
git clone https://github.com/zanfranceschi/rinha-de-backend-2026.git
```

Também dá para baixar o ZIP da branch `main` pelo GitHub. O arquivo usado é `resources/references.json.gz`. Aponte `DATASET_PATH` para ele (arquivo `.json` ou `.json.gz`).

## Como rodar

Pré-requisitos: Node 22.12 ou superior e, para subir o host local, Azure Functions Core Tools 4.

```bash
npm install
npm run verify        # checagem de arquitetura, typecheck e testes
```

Rodando localmente:

```bash
cp local.settings.example.json local.settings.json   # ajuste DATASET_PATH
npm run dev
curl localhost:7071/ready
curl -X POST localhost:7071/fraud-score -H 'content-type: application/json' -d @payload.json
```

Scripts: `npm test` (Vitest), `npm run check:arch` (dependency-cruiser), `npm run typecheck`, `npm run build`.

## Variáveis de ambiente

Modelo em `.env.example`. No Azure, configure-as como App Settings da Function App. Nenhuma credencial é versionada; `local.settings.json` está no `.gitignore`.

| Variável | Padrão | Uso |
|---|---|---|
| `DATASET_PATH` | obrigatória | caminho do `references.json` ou `.json.gz` |
| `FRAUD_APPROVAL_THRESHOLD` | `0.6` | limite de aprovação padrão |
| `IDEMPOTENCY_TTL_SECONDS` | `900` | tempo que uma decisão fica no cache de idempotência |
| `IDEMPOTENCY_MAX_ENTRIES` | `100000` | limite de decisões no cache |
| `SERVICEBUS_CONNECTION_STRING` | vazio | sem valor, os eventos ficam num publicador em memória |
| `SERVICEBUS_TOPIC_NAME` | `transaction-scored` | tópico do evento |
| `NORMALIZATION_PATH`, `MCC_RISK_PATH` | arquivos em `resources/` | sobrescrevem as regras de normalização |
