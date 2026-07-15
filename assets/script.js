const STEAM_ID = '76561198138885098';
const INVENTORY_API = `/api/inventory.php?steamid=${STEAM_ID}`;
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

const inventoryGrid = document.querySelector('#inventory-grid');
const inventoryMessage = document.querySelector('.inventory-empty');

const normalizeIconPath = (path) => {
  const normalized = String(path || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const buildIconCandidates = (item) => {
  const path = normalizeIconPath(item.icon_url_large || item.icon_url || item.icon_url_small);
  if (!path) return [];

  const candidates = [path];
  if (path.startsWith('/')) {
    candidates.push(`https://steamcommunity-a.akamaihd.net${path}`);
    candidates.push(`https://community.cloudflare.steamstatic.com/economy/image${path}`);
    candidates.push(`https://steamcommunity.com${path}`);
  }

  return [...new Set(candidates)];
};

const proxyImageUrl = (remoteUrl) => `/api/image.php?url=${encodeURIComponent(remoteUrl)}`;

const loadImage = (url) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(true);
  img.onerror = () => resolve(false);
  img.src = url;
});

const setImageWithFallback = async (imgElem, item) => {
  const candidates = buildIconCandidates(item);
  for (const candidate of candidates) {
    const ok = await loadImage(proxyImageUrl(candidate));
    if (ok) {
      imgElem.src = proxyImageUrl(candidate);
      return;
    }
  }
  imgElem.src = TRANSPARENT_PIXEL;
};

const isCovertItem = (item) => Array.isArray(item.tags) && item.tags.some((tag) => {
  const value = String(tag.localized_tag_name || tag.name || tag.internal_name || '').toLowerCase();
  return value.includes('covert');
});

const renderInventory = (items) => {
  if (!inventoryGrid) return;
  inventoryGrid.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    if (inventoryMessage) inventoryMessage.textContent = 'No inventory items found.';
    return;
  }

  const covertItems = items.filter(isCovertItem);
  if (inventoryMessage) inventoryMessage.textContent = `Showing ${covertItems.length} covert items.`;
  if (covertItems.length === 0) return;

  covertItems.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'inventory-item';

    const imgElem = document.createElement('img');
    imgElem.alt = item.market_hash_name || 'CS2 item';
    imgElem.loading = 'lazy';
    imgElem.src = TRANSPARENT_PIXEL;

    const title = document.createElement('h3');
    title.textContent = item.market_hash_name || 'Unknown item';

    const typeP = document.createElement('p');
    typeP.textContent = item.type || '';

    card.append(imgElem, title, typeP);
    inventoryGrid.appendChild(card);
    setImageWithFallback(imgElem, item);
  });
};

async function getCS2Inventory() {
  try {
    if (inventoryMessage) inventoryMessage.textContent = 'Loading your inventory…';

    const response = await fetch(INVENTORY_API);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    const data = await response.json();
    const items = Array.isArray(data?.descriptions) ? data.descriptions : [];
    renderInventory(items);
    return data;
  } catch (error) {
    console.error('Failed to fetch inventory:', error);
    if (inventoryMessage) inventoryMessage.textContent = 'Failed to load inventory. Check console for details.';
  }
}

getCS2Inventory();
