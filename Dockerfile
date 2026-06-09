# Dockerfile for Starcom LeadGen Backend
FROM node:20-slim

# Install Chrome dependencies for Puppeteer
# Note: Debian Bookworm (node:20-slim) doesn't use t64 suffix
RUN apt-get update && apt-get install -y \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    ca-certificates \
    fonts-liberation \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src ./src
COPY database ./database
COPY tsconfig.json ./

# Install TypeScript and build dependencies
RUN npm install -D typescript tsx @types/node

# Build TypeScript (optional, we can use tsx directly)
# RUN npm run build

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Expose API port
EXPOSE 3001

# Run HTTP server for on-demand agent execution
CMD ["npx", "tsx", "src/server.ts"]
