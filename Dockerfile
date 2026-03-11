FROM node:20-slim
RUN apt-get update && apt-get install -y ffmpeg wget ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
RUN mkdir -p sessions
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s CMD wget -qO- http://localhost:${PORT:-3000}/api/status || exit 1
CMD ["node", "index.js"]
