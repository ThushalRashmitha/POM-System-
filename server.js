require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const getDatabase = require('./src/config/database');
const Product = require('./src/models/Product');
const User = require('./src/models/User');
const { ensurePlatformAdmin } = require('./src/services/platformAdmin');
const authRoutes = require('./src/routes/auth');
const shopRoutes = require('./src/routes/shop');
const adminRoutes = require('./src/routes/admin');
const marketplaceRoutes = require('./src/routes/marketplace');
const { requirePageRole } = require('./src/middleware/auth');

const requiredEnvironment = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'JWT_SECRET',
  'ADMIN_EMAIL',
  'ADMIN_PASSWORD'
];

const app = express();
const publicDirectory = path.join(__dirname, 'public');
let initializationPromise;

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());

const publicPages = new Set(['/', '/index.html', '/login.html', '/marketplace.html']);
const protectedPageRoles = new Map([
  ['/shop.html', 'shop'],
  ['/admin.html', 'platform-admin']
]);
app.use((req, res, next) => {
  const pagePath = req.path.toLowerCase();
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (pagePath.startsWith('/api/') || pagePath === '/health') return next();
  if (/^\/product\/[a-z0-9_-]{1,160}(?:\/image)?$/.test(pagePath)) return next();
  if (publicPages.has(pagePath)) return next();
  const role = protectedPageRoles.get(pagePath);
  if (role) return requirePageRole(role)(req, res, next);
  if (pagePath.endsWith('.html') || (!path.extname(pagePath) && req.accepts('html'))) {
    return res.redirect('/login.html');
  }
  return next();
});

app.use(express.static(publicDirectory));

app.use(async (req, res, next) => {
  try {
    await initialize();
    next();
  } catch (error) {
    next(error);
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/product/:id/image', async (req, res, next) => {
  try {
    if (!isValidProductId(req.params.id)) return res.status(404).send('Product image not found.');
    const product = await Product.findById(req.params.id);
    if (!product || !product.available) return res.status(404).send('Product image not found.');
    const shop = await User.findById(product.shop);
    if (!shop || shop.role !== 'shop' || shop.subscriptionStatus !== 'active' || !shop.marketplaceEnabled) {
      return res.status(404).send('Product image not found.');
    }

    const match = typeof product.imageUrl === 'string'
      ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(product.imageUrl)
      : null;
    if (!match) return res.status(404).send('Product image not found.');
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 2 * 1024 * 1024) {
      return res.status(404).send('Product image not found.');
    }

    res.set({
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': image.length,
      'X-Content-Type-Options': 'nosniff'
    });
    res.type(`image/${match[1]}`).send(image);
  } catch (error) {
    next(error);
  }
});
app.get('/product/:id', async (req, res, next) => {
  try {
    if (!isValidProductId(req.params.id)) return res.status(404).send('Product not found.');
    const product = await Product.findById(req.params.id);
    if (!product || !product.available) return res.status(404).send('Product not found.');
    const shop = await User.findById(product.shop);
    if (!shop || shop.role !== 'shop' || shop.subscriptionStatus !== 'active' || !shop.marketplaceEnabled) {
      return res.status(404).send('Product not found.');
    }

    const origin = getPublicOrigin(req);
    const pageUrl = new URL(`/product/${encodeURIComponent(product._id)}`, origin).href;
    const imageUrl = getProductImageUrl(product, origin);
    const price = formatSharePrice(product.sellingPrice ?? product.price);
    const description = `${price} — ${product.description || 'Ask the shop for more information about this product.'}`;
    const title = `${product.name} | ${shop.businessName}`;
    const marketplaceUrl = new URL('/marketplace.html', origin);
    marketplaceUrl.searchParams.set('shop', shop.id);
    marketplaceUrl.searchParams.set('product', product._id);
    const escapedTitle = escapeHtml(title);
    const escapedDescription = escapeHtml(description);
    const escapedImageUrl = escapeHtml(imageUrl);
    const escapedPageUrl = escapeHtml(pageUrl);
    const escapedMarketplaceUrl = escapeHtml(marketplaceUrl.href);

    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDescription}">
  <meta property="og:type" content="product">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDescription}">
  <meta property="og:image" content="${escapedImageUrl}">
  <meta property="og:image:alt" content="${escapeHtml(product.name)}">
  <meta property="og:url" content="${escapedPageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDescription}">
  <meta name="twitter:image" content="${escapedImageUrl}">
  <link rel="canonical" href="${escapedPageUrl}">
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body class="market-page">
  <main class="market-content">
    <article class="content-card" style="max-width:640px;margin:40px auto">
      <img src="${escapedImageUrl}" alt="${escapeHtml(product.name)}" style="display:block;width:100%;max-height:420px;object-fit:contain">
      <p class="detail-shop">SOLD BY ${escapeHtml(shop.businessName)}</p>
      <h1>${escapeHtml(product.name)}</h1>
      <p class="detail-price">${escapeHtml(price)}</p>
      <p class="detail-description">${escapeHtml(product.description || 'Ask the shop for more information about this product.')}</p>
      <a class="button button-primary" href="${escapedMarketplaceUrl}">View product and order</a>
    </article>
  </main>
</body>
</html>`);
  } catch (error) {
    next(error);
  }
});
app.use('/api/auth', authRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/marketplace', marketplaceRoutes);

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
app.use((error, req, res, next) => {
  console.error(error.stack || error.message || 'Request failed.');
  if (res.headersSent) return next(error);
  const status = error.status || error.statusCode || 500;
  const clientError = status >= 400 && status < 500;
  res.status(status).json({
    error: clientError ? error.message : 'An unexpected server error occurred.'
  });
});

function initialize() {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);
      if (missingEnvironment.length) {
        throw new Error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
      }
      getDatabase();
      await ensurePlatformAdmin();
    })().catch((error) => {
      initializationPromise = null;
      throw error;
    });
  }
  return initializationPromise;
}

function isValidProductId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(id);
}

function getPublicOrigin(req) {
  const forwardedProtocol = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const fallbackOrigin = `${forwardedProtocol || req.protocol}://${req.get('host')}`;
  const parsedOrigin = new URL(process.env.PUBLIC_BASE_URL || fallbackOrigin);
  if (!['http:', 'https:'].includes(parsedOrigin.protocol)) {
    throw new Error('PUBLIC_BASE_URL must use HTTP or HTTPS.');
  }
  return parsedOrigin.origin;
}

function getProductImageUrl(product, origin) {
  const imageUrl = product.imageUrl;
  if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image/')) {
    return new URL(`/product/${encodeURIComponent(product._id)}/image`, origin).href;
  }
  if (typeof imageUrl === 'string' && imageUrl) {
    try {
      const parsedUrl = new URL(imageUrl, origin);
      if (['http:', 'https:'].includes(parsedUrl.protocol)) return parsedUrl.href;
    } catch {
      return new URL('/images/brand/logo.png', origin).href;
    }
  }
  return new URL('/images/brand/logo.png', origin).href;
}

function formatSharePrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function start() {
  await initialize();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Shop management app listening on port ${port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Unable to start the server:', error);
    process.exit(1);
  });
}

module.exports = app;
