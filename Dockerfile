FROM node:24-alpine

ENV NODE_ENV=production PORT=5000
WORKDIR /app

COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force
COPY backend ./backend
COPY frontend ./frontend
COPY detection/sample-data ./detection/sample-data

RUN mkdir -p /app/backend/data && chmod 700 /app/backend/data && chown -R node:node /app
USER node
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.js"]
