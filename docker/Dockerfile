FROM node:20-alpine

WORKDIR /app

COPY collection/ ./collection/
COPY templates/ ./templates/
COPY npm/package.json ./npm/
COPY npm/bin/ ./npm/bin/
COPY npm/src/ ./npm/src/

RUN cd npm && npm install --production

ENV PATH="/app/npm/node_modules/.bin:/app/npm/bin:$PATH"

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "console.log('ok')" || exit 1

ENTRYPOINT ["node", "/app/npm/bin/aiei.js"]
CMD ["score", "--help"]
