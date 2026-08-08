/**
 * Scrape store.nintendo.com (FR My Nintendo Rewards) via Playwright,
 * détecte les nouvelles récompenses disponibles (ou restocks),
 * notifie Discord, et persiste l'état dans data/known-rewards.json.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const STATE_PATH = join(ROOT, 'data', 'known-rewards.json');

const STORE_BASE =
  'https://store.nintendo.com/fr-fr/my-nintendo/my-nintendo-rewards?page=1&sort=best-matches';
const MAX_PAGES = 20;
const PAGE_SETTLE_MS = 2500;
const NINTENDO_RED = 0xe60012;

function urlForPage(pageNum) {
  const u = new URL(STORE_BASE);
  u.searchParams.set('page', String(pageNum));
  return u.toString();
}

/** Même logique d'extraction que background.js de l'extension. */
function extractRewardsFromDom() {
  const PRODUCT_ID_RE = /-\d{10,}(?:[/?#]|$)/;
  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const seen = new Set();
  const results = [];

  let maxPage = 1;
  for (const a of anchors) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/[?&]page=(\d+)/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > maxPage) maxPage = n;
    }
  }
  try {
    const curPage = parseInt(new URL(location.href).searchParams.get('page'), 10);
    if (!isNaN(curPage) && curPage > maxPage) maxPage = curPage;
  } catch {
    /* ignore */
  }

  for (const a of anchors) {
    const rawHref = a.getAttribute('href') || '';
    if (!PRODUCT_ID_RE.test(rawHref)) continue;

    let href;
    try {
      href = new URL(rawHref, location.href).href;
    } catch {
      continue;
    }
    if (seen.has(href)) continue;

    const h3 = a.querySelector('h3');
    let name = h3 ? h3.textContent.trim() : '';
    if (!name) {
      const aria = a.getAttribute('aria-label') || '';
      if (aria && aria !== '[object Object]') name = aria.trim();
    }
    if (!name || name.length < 2 || name.length > 200) continue;

    let price = null;
    const pointsImg = a.querySelector('img[title*="oints" i], img[alt*="oints" i]');
    if (pointsImg) {
      const wrapper = pointsImg.closest('div');
      const p = wrapper ? wrapper.querySelector('p') : null;
      const numText = p ? p.textContent.trim() : '';
      if (/^\d[\d\s.,\u00A0]*$/.test(numText)) {
        const label =
          pointsImg.getAttribute('title') || pointsImg.getAttribute('alt') || 'Points';
        price = `${numText} ${label}`;
      }
    }
    if (!price) continue;

    let image = null;
    for (const img of a.querySelectorAll('img')) {
      if (img === pointsImg) continue;
      const rawSrc = img.currentSrc || img.getAttribute('src') || '';
      if (!rawSrc || rawSrc.startsWith('data:')) continue;
      try {
        image = new URL(rawSrc, location.href).href;
      } catch {
        continue;
      }
      break;
    }

    let available = true;
    const classAttr = a.getAttribute('class') || '';
    if (/\bopacity-40\b/.test(classAttr)) available = false;
    if (available) {
      const cardText = a.textContent || '';
      if (/rupture de stock|indisponible|épuisé|out of stock/i.test(cardText)) {
        available = false;
      }
    }

    seen.add(href);
    results.push({ name, price, url: href, image, available });
  }

  return { rewards: results, maxPage };
}

async function scrapeRewards() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    locale: 'fr-FR',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  });

  try {
    const byUrl = new Map();
    let maxPage = 1;
    let pageNum = 1;

    while (pageNum <= maxPage && pageNum <= MAX_PAGES) {
      const url = urlForPage(pageNum);
      console.log(`📄 Page ${pageNum} → ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await new Promise((r) => setTimeout(r, PAGE_SETTLE_MS));

      const result = await page.evaluate(extractRewardsFromDom);
      console.log(
        `   ${result.rewards.length} récompense(s), maxPage=${result.maxPage || 1}`,
      );

      for (const r of result.rewards) {
        if (!byUrl.has(r.url)) byUrl.set(r.url, r);
      }
      if (result.maxPage && result.maxPage > maxPage) maxPage = result.maxPage;
      pageNum++;
    }

    const now = new Date().toISOString();
    return Array.from(byUrl.values()).map((r) => ({
      name: r.name,
      price: r.price,
      url: r.url,
      image: r.image || null,
      available: r.available !== false,
      foundAt: now,
    }));
  } finally {
    await browser.close();
  }
}

async function loadState() {
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    const data = JSON.parse(raw);
    return {
      rewards: Array.isArray(data.rewards) ? data.rewards : [],
      lastCheck: data.lastCheck || null,
    };
  } catch {
    return { rewards: [], lastCheck: null };
  }
}

async function saveState(rewards) {
  await mkdir(dirname(STATE_PATH), { recursive: true });
  const payload = {
    lastCheck: new Date().toISOString(),
    rewards: rewards.map((r) => ({
      name: r.name,
      price: r.price,
      url: r.url,
      image: r.image || null,
      available: r.available !== false,
      foundAt: r.foundAt || new Date().toISOString(),
    })),
  };
  await writeFile(STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function findNewlyAvailable(current, previous) {
  const prevByUrl = new Map(previous.map((r) => [r.url, r]));
  const newlyAvailable = [];

  for (const reward of current) {
    if (!reward.available) continue;
    const prev = prevByUrl.get(reward.url);
    if (!prev) {
      newlyAvailable.push({ ...reward, reason: 'new' });
    } else if (prev.available === false) {
      newlyAvailable.push({ ...reward, reason: 'restock' });
    }
  }

  return newlyAvailable;
}

function buildEmbed(reward) {
  const isRestock = reward.reason === 'restock';
  return {
    title: reward.name,
    url: reward.url,
    color: NINTENDO_RED,
    description: isRestock
      ? '🕺 **De nouveau disponible** sur le Nintendo Store FR'
      : '🕺 **Nouvelle récompense disponible** sur le Nintendo Store FR',
    fields: [
      {
        name: 'Prix',
        value: `💰 ${reward.price || 'Voir le store'}`,
        inline: true,
      },
    ],
    thumbnail: reward.image ? { url: reward.image } : undefined,
    footer: {
      text: 'Nintendo Rewards Monitor FR',
    },
    timestamp: new Date().toISOString(),
  };
}

async function notifyDiscord(rewards) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) {
    throw new Error('DISCORD_WEBHOOK_URL manquant (secret GitHub ou .env local)');
  }

  // Discord: max 10 embeds par message
  for (let i = 0; i < rewards.length; i += 10) {
    const chunk = rewards.slice(i, i + 10);
    const body = {
      username: 'Nintendo Rewards FR',
      content:
        chunk.length === 1
          ? '🎮 Une récompense vient d’être disponible !'
          : `🎮 **${chunk.length}** récompenses viennent d’être disponibles !`,
      embeds: chunk.map(buildEmbed),
    };

    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord webhook failed (${res.status}): ${text}`);
    }

    // Rate limit soft: pause entre lots
    if (i + 10 < rewards.length) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const forceNotify = process.argv.includes('--notify-all-available');

  console.log('🕵️ Scraping My Nintendo Rewards FR...');
  const current = await scrapeRewards();
  console.log(`✓ ${current.length} récompense(s) trouvée(s)`);

  const prev = await loadState();
  const isFirstRun = prev.rewards.length === 0;

  let toNotify = findNewlyAvailable(current, prev.rewards);

  if (forceNotify) {
    toNotify = current
      .filter((r) => r.available)
      .map((r) => ({ ...r, reason: 'new' }));
    console.log(`📣 --notify-all-available : ${toNotify.length} à notifier`);
  } else if (isFirstRun) {
    // Premier run : on initialise l'état sans spammer Discord
    console.log('🆕 Premier run — initialisation sans notification');
    toNotify = [];
  }

  if (toNotify.length > 0) {
    console.log(`🔔 ${toNotify.length} nouvelle(s) dispo(s) à notifier`);
    for (const r of toNotify) {
      console.log(`   - [${r.reason}] ${r.name} (${r.price})`);
    }
    if (!dryRun) {
      await notifyDiscord(toNotify);
      console.log('✅ Discord notifié');
    } else {
      console.log('💤 dry-run : pas d’envoi Discord');
    }
  } else {
    console.log('😴 Aucune nouvelle récompense disponible');
  }

  if (!dryRun) {
    await saveState(current);
    console.log(`💾 État sauvegardé → ${STATE_PATH}`);
  }
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
