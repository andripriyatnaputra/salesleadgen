# Dockerfile for Starcom LeadGen Backend
FROM node:20-alpine

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

# Expose port (if needed for API)
EXPOSE 3000

# Default command - run agents manually or via cron
CMD ["npx", "tsx", "src/agents-runner.ts"]
