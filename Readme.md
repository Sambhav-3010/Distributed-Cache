# CacheGrid

CacheGrid is a distributed in-memory cache with a deterministic Node.js core, a React dashboard and a separate Python AI operations service.

## Project layout

```text
backend/
  package.json            # npm workspace root
  cache-node/             # Express cache node (port 8000)
frontend/                 # React + Vite + TypeScript dashboard
CacheGrid_Documentation_Pack/
Readme.md
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
PORT=8001 CACHE_NODE_ID=node-2 npm start
```

## Test

```bash
cd backend
npm test
```

## API

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/cache?key=user:101&value=Sambhav` | Store or replace a value |
| `GET` | `/cache/user:101` | Retrieve a value |
| `DELETE` | `/cache/user:101` | Delete a value |
| `GET` | `/health` | Plain-text liveness check |
| `GET` | `/actuator/health` | JSON health status |

```bash
curl -X POST "http://localhost:8000/cache?key=user:101&value=Sambhav"
curl "http://localhost:8000/cache/user:101"
curl -X DELETE "http://localhost:8000/cache/user:101"
```

Missing keys return `404`; blank keys and missing values return `400`.

## Docker

```bash
docker compose up --build
```

## Documentation

The design, API contracts, testing strategy and sprint plan live in
[`CacheGrid_Documentation_Pack/`](CacheGrid_Documentation_Pack/README.md).
The Sprint 1 implementation guide is
[`CacheGrid_Sprint_1_Implementation.md`](CacheGrid_Sprint_1_Implementation.md).

## Core rule

Node.js owns cache correctness. The AI layer analyzes telemetry and recommends
changes, but recommendations require validation, approval and audit before they
are applied.
