# Image Playwright officielle (Chromium inclus).
# Idle ≈ quasi rien grâce à `sleep infinity`.
# Sur Coolify : Scheduled Task toutes les 15 min → `node scripts/check-rewards.mjs`
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY scripts ./scripts
RUN mkdir -p /app/data && chown -R pwuser:pwuser /app

USER pwuser

# Pas de scrape en continu : Coolify lance le check via Scheduled Task
CMD ["sleep", "infinity"]
