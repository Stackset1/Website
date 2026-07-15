import express from 'express';

// Use Node's global fetch (available in Node 18+). If not present, exit with guidance.

const app = express();
const PORT = process.env.PORT || 3000;

if (typeof fetch !== 'function') {
  console.error('Global fetch is not available. Please use Node 18+ or install node-fetch.');
  process.exit(1);
}

const ALLOWED_IMAGE_HOSTS = new Set([
  'steamcommunity-a.akamaihd.net',
  'community.cloudflare.steamstatic.com',
  'steamcdn-a.akamaihd.net',
  'steamcommunity.com',
]);

const imageCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

const getCachedImage = (url) => {
  const entry = imageCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    imageCache.delete(url);
    return null;
  }
  return entry;
};

const setCachedImage = (url, data, contentType) => {
  imageCache.set(url, { data, contentType, createdAt: Date.now() });
};

// Serve static site files from the repository root
app.use(express.static('.'));

// Proxy endpoint to fetch Steam inventory and return JSON to the browser
app.get('/api/inventory/:steamid', async (req, res) => {
  const { steamid } = req.params;
  const url = `https://steamcommunity.com/inventory/${steamid}/730/2?l=english&count=500`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const json = await response.json();
    res.json(json);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch inventory', details: err.message });
  }
});

// Proxy endpoint to fetch images cross-origin and return them same-origin
app.get('/api/image', async (req, res) => {
  let imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing url query parameter' });
  }

  imageUrl = imageUrl.toString().trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    return res.status(400).json({ error: 'Invalid image URL' });
  }

  try {
    const urlObj = new URL(imageUrl);
    if (!ALLOWED_IMAGE_HOSTS.has(urlObj.hostname)) {
      return res.status(403).json({ error: 'Image host not allowed' });
    }

    const cached = getCachedImage(imageUrl);
    if (cached) {
      res.set('Content-Type', cached.contentType);
      return res.send(cached.data);
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      return res.status(response.status).send(`Failed to fetch image: ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());
    setCachedImage(imageUrl, buffer, contentType);

    res.set('Content-Type', contentType);
    res.send(buffer);
  } catch (err) {
    console.error('Image proxy error:', err);
    res.status(502).json({ error: 'Failed to fetch image', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server + proxy running at http://localhost:${PORT}`);
});
