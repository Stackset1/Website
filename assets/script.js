const STEAM_ID = '76561198138885098';
const INVENTORY_API = `/api/inventory.php?steamid=${STEAM_ID}`;
const PRICE_API = '/api/price.php';
const FLOAT_API = '/api/float.php';
const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const MAX_CONCURRENT_LOOKUPS = 4;

const inventoryGrid = document.querySelector('#inventory-grid');
const inventoryMessage = document.querySelector('.inventory-empty');
const lookupQueue = [];
let activeLookups = 0;
const priceCache = new Map();
const pricePending = new Map();
const floatCache = new Map();
const floatPending = new Map();

const valueObserver = inventoryGrid
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const target = entry.target;
      valueObserver.unobserve(target);
      loadMarketData(target.__item, target.__priceElem, target.__floatElem);
    });
  }, { root: inventoryGrid, rootMargin: '150px 0px' })
  : null;

const pumpLookupQueue = () => {
  while (activeLookups < MAX_CONCURRENT_LOOKUPS && lookupQueue.length > 0) {
    const task = lookupQueue.shift();
    activeLookups += 1;

    Promise.resolve(task())
      .catch(() => null)
      .finally(() => {
        activeLookups -= 1;
        pumpLookupQueue();
      });
  }
};

const enqueueLookup = (task) => new Promise((resolve) => {
  lookupQueue.push(async () => {
    const result = await task();
    resolve(result);
  });
  pumpLookupQueue();
});

const safeFetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
};

const normalizeIconPath = (path) => {
  const normalized = String(path || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
};

const buildIconCandidates = (item) => {
  const path = normalizeIconPath(item.icon_url_large || item.icon_url || item.icon_url_small);
  if (!path) return [];

  if (/^https?:\/\//i.test(path)) {
    return [path];
  }

  const candidates = [];
  if (path.startsWith('/')) {
    candidates.push(`https://steamcommunity-a.akamaihd.net${path}`);
    candidates.push(`https://community.cloudflare.steamstatic.com/economy/image${path}`);
    candidates.push(`https://steamcommunity.com${path}`);
  }

  return [...new Set(candidates)];
};

const proxyImageUrl = (remoteUrl) => `/api/image.php?url=${encodeURIComponent(remoteUrl)}`;

const buildInspectUrl = (item) => {
  const actions = Array.isArray(item.actions) ? item.actions : [];
  const previewAction = actions.find((action) => String(action.link || '').includes('%assetid%'));
  if (!previewAction || !previewAction.link) return null;

  return String(previewAction.link)
    .replace(/%assetid%/g, String(item.assetid || ''))
    .replace(/%owner_steamid%/g, STEAM_ID)
    .replace(/%contextid%/g, String(item.contextid || '2'))
    .replace(/%appid%/g, String(item.appid || '730'));
};

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

const getPriceByMarketHashName = async (marketHashName) => {
  const key = String(marketHashName || '').trim();
  if (!key) return null;
  if (priceCache.has(key)) return priceCache.get(key);
  if (pricePending.has(key)) return pricePending.get(key);

  const pending = enqueueLookup(async () => {
    const query = `${PRICE_API}?market_hash_name=${encodeURIComponent(key)}`;
    const data = await safeFetchJson(query);
    const value = data?.lowest_price || data?.median_price || null;
    priceCache.set(key, value);
    pricePending.delete(key);
    return value;
  });

  pricePending.set(key, pending);
  return pending;
};

const getFloatByInspectUrl = async (inspectUrl) => {
  const key = String(inspectUrl || '').trim();
  if (!key) return null;
  if (floatCache.has(key)) return floatCache.get(key);
  if (floatPending.has(key)) return floatPending.get(key);

  const pending = enqueueLookup(async () => {
    const query = `${FLOAT_API}?inspect_url=${encodeURIComponent(key)}`;
    const data = await safeFetchJson(query);
    const value = Number(data?.iteminfo?.floatvalue);
    const parsedValue = Number.isFinite(value) ? value : null;
    floatCache.set(key, parsedValue);
    floatPending.delete(key);
    return parsedValue;
  });

  floatPending.set(key, pending);
  return pending;
};

const loadMarketData = async (item, priceElem, floatElem) => {
  if (!item || !priceElem || !floatElem) return;

  const inspectUrl = buildInspectUrl(item);
  const [price, floatValue] = await Promise.all([
    getPriceByMarketHashName(item.market_hash_name),
    inspectUrl ? getFloatByInspectUrl(inspectUrl) : Promise.resolve(null),
  ]);

  priceElem.textContent = `Price: ${price || 'N/A'}`;
  floatElem.textContent = Number.isFinite(floatValue)
    ? `Float: ${floatValue.toFixed(5)}`
    : 'Float: N/A';
};

const mapInventoryItems = (data) => {
  const descriptions = Array.isArray(data?.descriptions) ? data.descriptions : [];
  const assets = Array.isArray(data?.assets) ? data.assets : [];

  const descriptionMap = new Map();
  descriptions.forEach((description) => {
    const key = `${description.classid}_${description.instanceid || '0'}`;
    descriptionMap.set(key, description);
  });

  return assets
    .map((asset) => {
      const key = `${asset.classid}_${asset.instanceid || '0'}`;
      const description = descriptionMap.get(key);
      if (!description) return null;
      return { ...description, ...asset };
    })
    .filter(Boolean);
};

const renderInventory = (items) => {
  if (!inventoryGrid) return;
  inventoryGrid.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    if (inventoryMessage) inventoryMessage.textContent = 'No inventory items found.';
    return;
  }

  if (inventoryMessage) inventoryMessage.textContent = `Showing ${items.length} items.`;

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'inventory-item';

    const imgElem = document.createElement('img');
    imgElem.alt = item.market_hash_name || 'CS2 item';
    imgElem.loading = 'lazy';
    imgElem.src = TRANSPARENT_PIXEL;

    const title = document.createElement('h3');
    const amount = Number(item.amount || 1);
    const baseTitle = item.market_hash_name || 'Unknown item';
    title.textContent = amount > 1 ? `${baseTitle} x${amount}` : baseTitle;

    const typeP = document.createElement('p');
    typeP.textContent = item.type || '';

    const priceP = document.createElement('p');
    priceP.className = 'inventory-meta';
    priceP.textContent = 'Price: loading...';

    const floatP = document.createElement('p');
    floatP.className = 'inventory-meta';
    floatP.textContent = 'Float: loading...';

    card.append(imgElem, title, typeP, priceP, floatP);
    inventoryGrid.appendChild(card);
    setImageWithFallback(imgElem, item);

    if (valueObserver) {
      card.__item = item;
      card.__priceElem = priceP;
      card.__floatElem = floatP;
      valueObserver.observe(card);
    } else {
      loadMarketData(item, priceP, floatP);
    }
  });
};

async function getCS2Inventory() {
  try {
    if (inventoryMessage) inventoryMessage.textContent = 'Loading your inventory…';

    const response = await fetch(INVENTORY_API);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    const data = await response.json();
    const items = mapInventoryItems(data);
    renderInventory(items);
    return data;
  } catch (error) {
    console.error('Failed to fetch inventory:', error);
    if (inventoryMessage) inventoryMessage.textContent = 'Failed to load inventory. Check console for details.';
  }
}

getCS2Inventory();
