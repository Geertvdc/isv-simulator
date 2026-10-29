# The game server (server/), not the browser game: that one is static files
# from `npm run build` and can be hosted anywhere.
#
#   docker build -t isv-simulator-server .
#   docker run --rm -p 2567:2567 -v isv-profiles:/app/server/data isv-simulator-server
#
# In production also set ALLOWED_ORIGINS to the browser game's origin, and
# TRUST_PROXY=true behind a reverse proxy (see server/README.md):
#   -e ALLOWED_ORIGINS=https://isv.example.com -e TRUST_PROXY=true

# ---- build: bundle server/ (with the level maps inlined) into dist-server/
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:server

# ---- run: the bundle plus production dependencies only
FROM node:22-slim
ENV NODE_ENV=production
ENV PORT=2567
ENV PROFILE_STORE_PATH=/app/server/data/profiles.json
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist-server ./dist-server
# Profiles are written here; mount a volume on it to keep them.
RUN mkdir -p server/data && chown node:node server/data
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/main.js"]
