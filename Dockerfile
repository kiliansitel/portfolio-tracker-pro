# Portfolio Tracker Pro
# Multi-stage build for smaller image

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (argon2)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY server/package*.json ./

# Install all dependencies (devDependencies are needed to build native modules),
# then drop them so only production deps ship in the final image.
RUN npm ci && npm prune --omit=dev

# Production stage
FROM node:22-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S portfolio -u 1001

# Copy built dependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy application files (preserve server/ structure so relative paths work)
COPY server ./server
COPY public ./public

# Create data directory for database
RUN mkdir -p /app/data && chown -R portfolio:nodejs /app

# Switch to non-root user
USER portfolio

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/tickers/popular || exit 1

# Start application
CMD ["node", "server/index.js"]
