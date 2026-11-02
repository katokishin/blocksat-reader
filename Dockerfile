# syntax=docker/dockerfile:1
FROM node:26-alpine

WORKDIR /app

# Install production dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application source
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "./bin/www"]
