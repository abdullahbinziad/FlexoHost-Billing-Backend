FROM node:22.12.0-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:22.12.0-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

COPY --from=deps /app/node_modules ./node_modules
COPY . .

EXPOSE 5000

CMD ["npm", "start"]