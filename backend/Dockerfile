# ── Build stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Python + build deps for the geometry engine (cadquery/trimesh at runtime).
RUN apk add --no-cache python3 py3-pip

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache python3 py3-pip \
  && pip3 install --no-cache-dir --break-system-packages numpy trimesh

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY analyze_geometry.py ./
COPY emails ./emails

EXPOSE 8787
USER node
CMD ["node", "dist/index.js"]
