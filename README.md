# Nintendo Rewards Discord Monitor (FR)

Surveille le Nintendo Store FR (My Nintendo Rewards) et envoie une notif Discord
quand une récompense devient disponible.

Conçu pour tourner sur **Coolify** (cron fiable), pas sur GitHub Actions.

## Coolify

1. Application / Docker Compose depuis ce repo (`main`, auto-deploy)
2. Variables d'environnement :
   - `DISCORD_WEBHOOK_URL`
   - `DISCORD_PING_ROLE_ID` (défaut : rôle Petit filou)
3. Volume persistant sur `/app/data`
4. Scheduled Task :
   - Cron : `*/15 * * * *`
   - Commande : `node scripts/check-rewards.mjs`

Le container idle fait `sleep infinity` (peu de RAM). Chromium ne tourne que pendant le check.

## Local

```bash
cp .env.example .env
npm ci
npx playwright install chromium
npm run check
```

## Extension Chrome

L'extension navigateur est dans un repo / dossier séparé :
`nintendo-rewards-extension`
