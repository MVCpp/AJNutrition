# Zero npm dependencies of our own at runtime: this image is node plus our
# TypeScript. That is the point — this box holds the signing key, so its
# supply chain is kept as close to empty as it can be.
#
# Build from the REPOSITORY ROOT, not from this directory:
#   docker build -f services/license-service/Dockerfile -t nutriplan-licences .
FROM node:24-alpine

WORKDIR /srv

# The workspace packages are placed where Node's resolver expects them, since
# there is no pnpm and therefore no workspace symlinks inside the image.
COPY packages/security/ /srv/node_modules/@ajnutrition/security/
COPY packages/shared/ /srv/node_modules/@ajnutrition/shared/
COPY services/license-service/ /srv/app/

# zod is the only third-party package in that chain (schema validation in
# @ajnutrition/shared). Nothing else is installed.
RUN npm install --no-save --omit=dev zod@^3.25.0

ENV DB_PATH=/data/license.db
ENV PORT=8080
ENV NODE_ENV=production

# The SQLite file is the entire business record — customers, licences, the
# devices each has been seen on. Mount a real volume and back it up.
VOLUME ["/data"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

# --experimental-strip-types runs the .ts sources directly: no build step, so
# what is deployed is exactly what is in the repository.
CMD ["node", "--experimental-strip-types", "/srv/app/src/main.ts"]
