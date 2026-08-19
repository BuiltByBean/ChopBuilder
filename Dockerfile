# Stage 1 — build the Vite PWA
FROM node:22-alpine AS ui
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# Stage 2 — Python runtime serving the build + the sync API
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py ./
COPY --from=ui /app/dist ./dist
ENV PORT=8080
CMD gunicorn server:app --workers 2 --threads 8 --timeout 60 --bind 0.0.0.0:$PORT
