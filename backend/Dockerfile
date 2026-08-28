# ── Stage 1: install only production dependencies ────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
# Install prod-only packages; generate Prisma client
RUN npm ci --omit=dev && npx prisma generate

# ── Stage 2: compile TypeScript ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
COPY . .
RUN npm run build

# ── Stage 3: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as non-root to limit blast radius
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

# Copy compiled artefacts and prod node_modules only
COPY --from=builder /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY package.json ./

USER appuser

EXPOSE 5001

# Use node directly (not npm) so signals propagate correctly to the process
CMD ["node", "dist/index.js"]
