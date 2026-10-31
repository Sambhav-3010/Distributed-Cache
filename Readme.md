# CacheGrid

CacheGrid is a distributed in-memory cache with a deterministic Node.js core, a React dashboard and a separate Python AI operations service.

## Project layout

```text
backend/
  package.json            # npm workspace root
  common-library/         # Shared errors, events, IDs and latency helpers
  cache-node/             # Express cache node (port 8000)
  gateway-service/        # Routing, rate limiting and cluster monitoring (port 8001)
frontend/                 # React + Vite + TypeScript dashboard
Doc/                      # Design, API contracts, testing strategy and sprints
docker-compose.yml
```

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- Docker only if you want to run the container image

## Run the cache node

```bash
cd backend
npm install
npm start
```

For development with automatic restarts:

```bash
cd backend
npm run dev
```

The node listens on `http://localhost:8000` by default. Override it with `PORT`
and set a node identity with `CACHE_NODE_ID`:

```bash
PORT=8002 CACHE_NODE_ID=node-2 npm start
```

The cache supports TTL, count-based capacity and `LRU` or `LFU` eviction.
An omitted TTL uses `CACHE_DEFAULT_TTL_SECONDS` (default `300`); zero disables
expiry. LFU writes count as accesses, and ties evict the least recently used
entry.

## Run the gateway

```bash
cd backend
npm run start:gateway
```

The gateway listens on `http://localhost:8001` and routes to healthy nodes from
`CACHE_NODES` (default `node-1=http://localhost:8000`). It performs round-robin
routing, bounded health checks, retry only for idempotent reads, token-bucket
rate limiting and returns `503` when no node is healthy.

## Test

```bash
cd backend
npm test
```

## Cache node API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/cache?key=user:101&value=Sambhav&ttlSeconds=60` | Store or replace a value |
| `PUT` | `/api/v1/cache/user:101` | Store with `{ "value": "...", "ttlSeconds": 60 }` |
| `GET` | `/api/v1/cache/user:101` | Retrieve an entry and its metadata |
| `DELETE` | `/api/v1/cache/user:101` | Delete a value |
| `GET` | `/health` | Plain-text liveness check |
| `GET` | `/actuator/health` | JSON health status |
| `GET` | `/api/v1/status` | Node, cache and metrics status |
| `GET` | `/api/v1/metrics` | Node metrics |
| `GET` | `/api/v1/events` | Recent node events |

```bash
curl -X PUT "http://localhost:8001/api/v1/cache/user:101" \
  -H "content-type: application/json" \
  -d '{"value":"Sambhav","ttlSeconds":60}'
curl "http://localhost:8001/api/v1/cache/user:101"
curl -X DELETE "http://localhost:8001/api/v1/cache/user:101"
```

Missing keys return `404`; blank keys, missing values and `ttlSeconds <= 0`
return `400`.

## Gateway API

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/cluster/status` | Node health and cluster status |
| `GET` | `/api/v1/cluster/metrics` | Aggregated metrics |
| `GET` | `/api/v1/cluster/events` | Merged cluster events |
| `GET` | `/api/v1/rate-limits/status` | Token-bucket policy and state |
| `GET` | `/api/v1/rate-limits/metrics` | Allowed/rejected counters |
| `PUT` | `/api/v1/rate-limits/policies/default` | Update `capacity` or `refillPerSecond` |

## Docker

```bash
docker compose up --build
```

## Documentation

The design, API contracts, testing strategy and sprint plan live in
[`Doc/`](Doc/README.md).

## Core rule

Node.js owns cache correctness. The AI layer analyzes telemetry and recommends
changes, but recommendations require validation, approval and audit before they
are applied.
