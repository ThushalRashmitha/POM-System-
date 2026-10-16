require('dotenv').config();

const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const connectDatabase = require('./src/config/database');
const { ensurePlatformAdmin } = require('./src/services/platformAdmin');
const authRoutes = require('./src/routes/auth');
const shopRoutes = require('./src/routes/shop');
const adminRoutes = require('./src/routes/admin');
const marketplaceRoutes = require('./src/routes/marketplace');

const requiredEnvironment = ['MONGODB_URI', 'JWT_SECRET', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
const missingEnvironment = requiredEnvironment.filter((key) => !process.env[key]);

if (missingEnvironment.length) {
  console.error(`Missing required environment variables: ${missingEnvironment.join(', ')}`);
  process.exit(1);
}

const app = express();
const publicDirectory = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
app.use(express.static(publicDirectory));

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

async function start() {
  await connectDatabase();
  await ensurePlatformAdmin();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Shop management app listening on port ${port}`));
}

start().catch((error) => {
  console.error('Unable to start the server:', error);
  process.exit(1);
});
