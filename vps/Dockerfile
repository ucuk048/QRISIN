# Multi-platform production container
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Salin package definitions
COPY package*.json ./

# Install dependencies (hanya production)
RUN npm ci --only=production

# Salin source code
COPY . .

# Buat direktori data untuk SQLite & Log
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
