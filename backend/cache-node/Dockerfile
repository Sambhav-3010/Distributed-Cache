FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY cache-node/package.json cache-node/package.json

RUN npm ci --omit=dev --workspace cache-node

COPY cache-node/src cache-node/src

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["node", "cache-node/src/server.js"]
