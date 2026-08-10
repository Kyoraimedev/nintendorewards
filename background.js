const STORE_URL = 'https://store.nintendo.com/fr-fr/my-nintendo/my-nintendo-rewards?page=1&sort=best-matches';

const DEFAULT_CHECK_INTERVAL = 5; // minutes
const MIN_CHECK_INTERVAL = 1; // minutes (minimum imposé par l'API chrome.alarms)
const PAGE_LOAD_TIMEOUT_MS = 20000;
const EXTRA_SETTLE_DELAY_MS = 2000; // laisse le temps au JS client (Next.js) de peupler la grille

// (Re)crée l'alarme périodique avec l'intervalle stocké (ou celui par défaut)
async function setupAlarm() {
  const { checkInterval } = await chrome.storage.local.get(['checkInterval']);
  const interval = Math.max(MIN_CHECK_INTERVAL, Number(checkInterval) || DEFAULT_CHECK_INTERVAL);
  await chrome.alarms.clear('checkRewards');
  chrome.alarms.create('checkRewards', { periodInMinutes: interval });
  console.log(`⏱️ Alarme configurée: vérification toutes les ${interval} minute(s)`);
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(['checkInterval', 'onlyAvailable']);
  await chrome.storage.local.set({
    rewards: [],
    lastCheck: new Date().toISOString(),
    notificationCount: 0,
    checkInterval: existing.checkInterval || DEFAULT_CHECK_INTERVAL,
    onlyAvailable: existing.onlyAvailable || false
  });
  await setupAlarm();
  checkForNewRewards();
});

// Si l'utilisateur bascule "Uniquement disponibles" dans le popup, on
// remet à jour le badge tout de suite (sans attendre la prochaine vérif)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes.onlyAvailable) {
    const { rewards } = await chrome.storage.local.get(['rewards']);
    updateBadge(rewards || []);
  }
});

// Recrée l'alarme automatiquement dès que l'utilisateur change l'intervalle depuis le popup
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.checkInterval) {
    setupAlarm();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkRewards' || alarm.name === 'checkRewardsNow') {
    checkForNewRewards();
    if (alarm.name === 'checkRewardsNow') {
      chrome.alarms.clear('checkRewardsNow');
    }
  }
});

// Au (re)démarrage du service worker, s'assure que l'alarme reflète bien le storage
setupAlarm();

// ============================================================
// Fonction injectée DANS la page (contexte DOM réel, après exécution du
// JS Next.js — indispensable ici, un simple fetch() ne renvoie que la
// coquille HTML sans les cartes, qui sont peuplées côté client).
//
// Structure confirmée sur le HTML réel de la page :
//   <a aria-label="Nom du produit" href="/fr-fr/slug-000000000010019088">
//     ...
//     <h3 class="font-semibold">Nom du produit</h3>
//     ...
//     <img title="Points platine" ...><p class="">500</p>
//     ...
//   </a>
// Les blocs publicitaires (ex: "Jeux Nintendo Switch 2") ont un href sans
// le long suffixe numérique produit, donc ils sont exclus naturellement.
//
// Retourne aussi maxPage : le plus grand numéro de page trouvé dans les
// liens de pagination du bas (ex: ?page=2, ?page=3...), pour permettre à
// fetchRewardsViaHiddenTab() de parcourir TOUTES les pages, pas juste la 1ère.
// ============================================================
function extractRewardsFromDom() {
  const PRODUCT_ID_RE = /-\d{10,}(?:[/?#]|$)/;

  const anchors = Array.from(document.querySelectorAll('a[href]'));
  const seen = new Set();
  const results = [];

  // Détection du nombre total de pages via les liens de pagination
  // (ex: <a href="...?page=2...">2</a>, bouton "page suivante", etc.)
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
  } catch (e) { /* ignore */ }

  for (const a of anchors) {
    const rawHref = a.getAttribute('href') || '';
    if (!PRODUCT_ID_RE.test(rawHref)) continue;

    let href;
    try {
      href = new URL(rawHref, location.href).href;
    } catch (e) {
      continue;
    }
    if (seen.has(href)) continue;

    // Nom : d'abord le <h3>, sinon repli sur aria-label
    const h3 = a.querySelector('h3');
    let name = h3 ? h3.textContent.trim() : '';
    if (!name) {
      const aria = a.getAttribute('aria-label') || '';
      if (aria && aria !== '[object Object]') name = aria.trim();
    }
    if (!name || name.length < 2 || name.length > 200) continue;

    // Prix : l'image "Points platine" (ou équivalent "Points or") suivie
    // d'un <p> contenant le nombre, dans le même conteneur.
    let price = null;
    const pointsImg = a.querySelector('img[title*="oints" i], img[alt*="oints" i]');
    if (pointsImg) {
      const wrapper = pointsImg.closest('div');
      const p = wrapper ? wrapper.querySelector('p') : null;
      const numText = p ? p.textContent.trim() : '';
      if (/^\d[\d\s.,\u00A0]*$/.test(numText)) {
        const label = pointsImg.getAttribute('title') || pointsImg.getAttribute('alt') || 'Points';
        price = `${numText} ${label}`;
      }
    }
    if (!price) continue; // pas de prix trouvé = probablement pas une vraie carte récompense

    // Image du produit : le premier <img> de la carte qui n'est PAS l'icône
    // de points (celle-ci est petite et sert uniquement pour le prix).
    let image = null;
    const imgs = Array.from(a.querySelectorAll('img'));
    for (const img of imgs) {
      if (img === pointsImg) continue;
      const rawSrc = img.currentSrc || img.getAttribute('src') || '';
      if (!rawSrc || rawSrc.startsWith('data:')) continue;
      try {
        image = new URL(rawSrc, location.href).href;
      } catch (e) {
        continue;
      }
      break;
    }

    // Disponibilité : les cartes indisponibles portent la classe "opacity-40"
    // sur le <a>, et/ou un badge texte type "En rupture de stock".
    let available = true;
    const classAttr = a.getAttribute('class') || '';
    if (/\bopacity-40\b/.test(classAttr)) available = false;
    if (available) {
      const cardText = a.textContent || '';
      if (/rupture de stock|indisponible|épuisé|out of stock/i.test(cardText)) available = false;
    }

    seen.add(href);
    results.push({ name, price, url: href, image, available });
  }

  return { rewards: results, maxPage };
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Timeout en attendant le chargement de la page'));
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

const MAX_PAGES = 20; // garde-fou pour éviter une boucle infinie si la pagination est mal détectée

function urlForPage(pageNum) {
  const u = new URL(STORE_URL);
  u.searchParams.set('page', String(pageNum));
  return u.toString();
}

async function fetchRewardsViaHiddenTab() {
  let tab;
  try {
    tab = await chrome.tabs.create({ url: urlForPage(1), active: false });
    console.log(`🕵️ Onglet caché ouvert (id ${tab.id}), attente du chargement...`);

    const byUrl = new Map();
    let maxPage = 1;
    let pageNum = 1;

    while (pageNum <= maxPage && pageNum <= MAX_PAGES) {
      if (pageNum > 1) {
        await chrome.tabs.update(tab.id, { url: urlForPage(pageNum) });
      }

      await waitForTabComplete(tab.id, PAGE_LOAD_TIMEOUT_MS);
      await new Promise(resolve => setTimeout(resolve, EXTRA_SETTLE_DELAY_MS));

      const injectionResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractRewardsFromDom
      });

      const result = (injectionResults && injectionResults[0] && injectionResults[0].result) || { rewards: [], maxPage: 1 };
      console.log(`📄 Page ${pageNum}/${result.maxPage || 1} : ${result.rewards.length} récompenses`);

      for (const r of result.rewards) {
        if (!byUrl.has(r.url)) byUrl.set(r.url, r);
      }

      if (result.maxPage && result.maxPage > maxPage) maxPage = result.maxPage;
      pageNum++;
    }

    const rewards = Array.from(byUrl.values());
    console.log(`📦 ${rewards.length} récompenses extraites au total sur ${Math.min(maxPage, MAX_PAGES)} page(s)`);

    return rewards.map(r => ({
      name: r.name,
      price: r.price,
      url: r.url,
      image: r.image || null,
      available: r.available !== false,
      foundAt: new Date().toISOString()
    }));
  } finally {
    if (tab && tab.id) {
      chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
}

// Met à jour le badge de l'extension à partir d'une liste de récompenses,
// en respectant le réglage "Uniquement disponibles" s'il est activé.
async function updateBadge(rewards) {
  const { onlyAvailable } = await chrome.storage.local.get(['onlyAvailable']);
  const visible = onlyAvailable ? rewards.filter(r => r.available !== false) : rewards;

  if (visible.length > 0) {
    chrome.action.setBadgeText({ text: String(visible.length) });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
  return visible;
}

// ============================================================
// Boucle principale
// ============================================================
async function checkForNewRewards() {
  try {
    const currentRewards = await fetchRewardsViaHiddenTab();

    console.log(`✓ Trouvé ${currentRewards.length} récompenses`);

    const { onlyAvailable } = await chrome.storage.local.get(['onlyAvailable']);
    const storage = await chrome.storage.local.get(['rewards']);
    const previousRewards = storage.rewards || [];
    const previousRewardsNames = previousRewards.map(r => r.name);

    // On garde tout en mémoire (dispo + indispo) pour l'historique complet ;
    // seul l'affichage/les notifications tiennent compte du réglage.
    const newRewards = currentRewards.filter(r => !previousRewardsNames.includes(r.name));
    const newRewardsToNotify = onlyAvailable ? newRewards.filter(r => r.available !== false) : newRewards;

    if (newRewards.length > 0) {
      console.log(`🆕 ${newRewards.length} nouvelles récompenses trouvées (${newRewardsToNotify.length} à notifier)`);

      const allRewards = [...previousRewards, ...newRewards];
      await chrome.storage.local.set({
        rewards: allRewards,
        lastCheck: new Date().toISOString(),
        newRewards: newRewards,
        notificationCount: newRewardsToNotify.length
      });

      newRewardsToNotify.forEach((reward, index) => {
        setTimeout(() => {
          chrome.notifications.create(`reward-${Date.now()}-${index}`, {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Nouvelle récompense Nintendo! 🎮',
            message: `${reward.name}`,
            contextMessage: reward.price || 'Voir les détails',
            priority: 2
          });
        }, index * 500);
      });

      await updateBadge(currentRewards);
      chrome.action.setBadgeBackgroundColor({ color: newRewardsToNotify.length > 0 ? '#E60012' : '#666666' });
    } else {
      await chrome.storage.local.set({
        rewards: currentRewards,
        lastCheck: new Date().toISOString()
      });

      await updateBadge(currentRewards);
      chrome.action.setBadgeBackgroundColor({ color: '#666666' });
    }

  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff6600' });
  }
}

checkForNewRewards();
