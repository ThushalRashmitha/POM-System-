require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const getDatabase = require('./src/config/database');
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
  if (!pagePath.endsWith('.html') && pagePath !== '/') return next();
  if (publicPages.has(pagePath)) return next();
  const role = protectedPageRoles.get(pagePath);
  if (!role) return res.redirect('/login.html');
  return requirePageRole(role)(req, res, next);
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
