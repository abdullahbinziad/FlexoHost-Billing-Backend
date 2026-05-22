FROM node:22.12.0-alpine AS base
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true

FROM base AS deps
COPY package*.json ./
RUN npm ci

FROM deps AS builder
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22.12.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5001
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

RUN apk add --no-cache \
    ca-certificates \
    chromium \
    freetype \
    harfbuzz \
    nss \
    ttf-freefont

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package*.json ./
COPY src/seeders ./src/seeders
COPY src/scripts ./src/scripts

RUN mkdir -p uploads logs && chown -R node:node /app
USER node

EXPOSE 5001
CMD ["node", "dist/server.js"]
