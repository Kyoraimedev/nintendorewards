const STORE_URL = 'https://store.nintendo.com/fr-fr/my-nintendo/my-nintendo-rewards?page=1&sort=best-matches';

const DEFAULT_CHECK_INTERVAL = 5;

// Charger les données au chargement
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  loadSettings();
});

document.getElementById('check-now').addEventListener('click', checkNow);
document.getElementById('go-to-store').addEventListener('click', goToStore);
document.getElementById('settings-toggle').addEventListener('click', toggleSettings);
document.getElementById('save-interval').addEventListener('click', saveSettings);

function toggleSettings() {
  document.getElementById('settings-panel').classList.toggle('open');
}

async function loadSettings() {
  const { checkInterval, onlyAvailable } = await chrome.storage.local.get(['checkInterval', 'onlyAvailable']);
  document.getElementById('interval-input').value = checkInterval || DEFAULT_CHECK_INTERVAL;
  document.getElementById('only-available-input').checked = !!onlyAvailable;
}

async function saveSettings() {
  const intervalInput = document.getElementById('interval-input');
  let value = parseInt(intervalInput.value, 10);
  if (isNaN(value) || value < 1) {
    value = DEFAULT_CHECK_INTERVAL;
  }
  intervalInput.value = value;

  const onlyAvailable = document.getElementById('only-available-input').checked;

  await chrome.storage.local.set({ checkInterval: value, onlyAvailable });

  const saved = document.getElementById('settings-saved');
  saved.classList.add('show');
  setTimeout(() => saved.classList.remove('show'), 1500);

  // Réaffiche immédiatement la liste filtrée sans attendre la prochaine vérif
  loadData();
}

async function loadData() {
  const storage = await chrome.storage.local.get(['rewards', 'lastCheck', 'newRewards', 'onlyAvailable']);
  
  const allRewards = storage.rewards || [];
  const onlyAvailable = !!storage.onlyAvailable;
  const rewards = onlyAvailable ? allRewards.filter(r => r.available !== false) : allRewards;
  const newRewards = onlyAvailable
    ? (storage.newRewards || []).filter(r => r.available !== false)
    : (storage.newRewards || []);
  const lastCheck = storage.lastCheck;

  // Afficher les stats
  document.getElementById('total-count').textContent = rewards.length;
  document.getElementById('new-count').textContent = newRewards.length;

  // Afficher la date de la dernière vérification
  if (lastCheck) {
    const date = new Date(lastCheck);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    let timeText;
    if (diff < 60) timeText = 'À l\'instant';
    else if (diff < 3600) timeText = `Il y a ${Math.floor(diff / 60)}m`;
    else if (diff < 86400) timeText = `Il y a ${Math.floor(diff / 3600)}h`;
    else timeText = `Il y a ${Math.floor(diff / 86400)}j`;
    
    document.getElementById('last-update-time').textContent = `✅ ${timeText}`;
  }

  // Afficher les récompenses
  displayRewards(rewards, newRewards);
}

function displayRewards(rewards, newRewards) {
  const list = document.getElementById('rewards-list');
  
  if (rewards.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <p>Aucune récompense trouvée</p>
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  
  // Afficher les nouvelles d'abord
  const newRewardNames = newRewards.map(r => r.name);
  
  // Trier pour afficher les nouvelles en premier
  const sorted = rewards.sort((a, b) => {
    const aIsNew = newRewardNames.includes(a.name);
    const bIsNew = newRewardNames.includes(b.name);
    if (aIsNew && !bIsNew) return -1;
    if (!aIsNew && bIsNew) return 1;
    return new Date(b.foundAt) - new Date(a.foundAt);
  });

  sorted.forEach(reward => {
    const isNew = newRewardNames.includes(reward.name);
    const time = new Date(reward.foundAt);
    const timeStr = time.toLocaleDateString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    });

    const item = document.createElement('div');
    item.className = `reward-item ${isNew ? 'new' : ''} ${reward.available === false ? 'unavailable' : ''}`;

    const imgSrc = reward.image || '';
    item.innerHTML = `
      ${imgSrc
        ? `<img class="reward-thumb" src="${escapeHtml(imgSrc)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
        : `<div class="reward-thumb"></div>`}
      <div class="reward-info">
        <div class="reward-name">${escapeHtml(reward.name)}</div>
        <div class="reward-price">${escapeHtml(reward.price)}</div>
        <div class="reward-time">📅 ${timeStr}</div>
        ${reward.available === false ? '<div class="reward-badge-unavailable">Indisponible</div>' : ''}
      </div>
    `;

    item.addEventListener('click', () => {
      chrome.tabs.create({ url: reward.url || STORE_URL });
    });
    
    list.appendChild(item);
  });

  // Réinitialiser les nouvelles récompenses
  chrome.storage.local.set({ newRewards: [] });
  document.getElementById('new-count').textContent = '0';
}

async function checkNow() {
  const btn = document.getElementById('check-now');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '⏳ Vérification...';

  try {
    // Déclencher une alarme avec le délai minimum de 30 secondes (0.5 minutes)
    await chrome.alarms.create('checkRewardsNow', { delayInMinutes: 0.5 });
    
    // Attendre que la vérification se termine
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // Recharger les données
    await loadData();
    
    btn.textContent = '✅ Vérifié!';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    console.error('Erreur lors de checkNow:', error);
    btn.textContent = '❌ Erreur';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
}

function goToStore() {
  chrome.tabs.create({ url: STORE_URL });
  window.close();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
