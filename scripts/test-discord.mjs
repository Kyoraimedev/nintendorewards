/**
 * Envoie une notification Discord de test (embed style récompense Nintendo).
 * Usage: DISCORD_WEBHOOK_URL=... npm run test:discord
 */
const NINTENDO_RED = 0xe60012;

const webhook = process.env.DISCORD_WEBHOOK_URL;
if (!webhook) {
  console.error('❌ DISCORD_WEBHOOK_URL manquant');
  process.exit(1);
}

const sample = {
  name: 'Pin’s My Nintendo – Test Discord',
  price: '300 Points platine',
  url: 'https://store.nintendo.com/fr-fr/my-nintendo/my-nintendo-rewards?page=1&sort=best-matches',
  image:
    'https://assets.nintendo.com/image/upload/f_auto/q_auto/dpr_1.0/c_scale,w_300/ncom/en_US/games/switch/n/nintendo-switch-online/hero',
};

const body = {
  username: 'Nintendo Rewards FR',
  content: '🧪 **Test** — notification Discord My Nintendo Rewards (setup OK)',
  embeds: [
    {
      title: sample.name,
      url: sample.url,
      color: NINTENDO_RED,
      description:
        '🕺 **Nouvelle récompense disponible** sur le Nintendo Store FR\n_(Ceci est un message de test du monitoring GitHub Actions)_',
      fields: [
        { name: 'Prix', value: `💰 ${sample.price}`, inline: true },
      ],
      thumbnail: { url: sample.image },
      footer: { text: 'Nintendo Rewards Monitor FR · test' },
      timestamp: new Date().toISOString(),
    },
  ],
};

const res = await fetch(webhook, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

if (!res.ok) {
  console.error(`❌ Discord error ${res.status}:`, await res.text());
  process.exit(1);
}

console.log('✅ Notification de test envoyée sur Discord');
