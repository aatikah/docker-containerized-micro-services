FROM node:20.16.0-alpine3.20 AS dependencies
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
COPY package*.json ./
RUN npm ci --no-audit --no-fund

FROM node:20.16.0-alpine3.20 AS production
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup
COPY --from=dependencies /app/node_modules ./node_modules
COPY src ./src
USER appuser
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=5 CMD node -e "const http=require('http'); const req=http.get('http://127.0.0.1:3002/health', res => process.exit(res.statusCode===200?0:1)); req.on('error', ()=>process.exit(1));" 
CMD ["node", "src/server.js"]
