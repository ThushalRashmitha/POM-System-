const express = require('express');
const Product = require('../models/Product');
const User = require('../models/User');
const { optionalUser, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(optionalUser, (req, res, next) => {
  if (!req.user) return next();
  return requireRole('shop')(req, res, next);
});

router.get('/products', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100).toLowerCase();
    const shops = req.user
      ? [req.user]
      : (await User.listShops()).filter((shop) =>
        shop.subscriptionStatus === 'active' && shop.marketplaceEnabled
      );
    const shopById = new Map(shops.map((shop) => [shop.id, {
      businessName: shop.businessName,
      whatsapp: shop.whatsapp
    }]));
    const availableProducts = req.user
      ? await Product.listAvailableByShop(req.user.id)
      : await Product.listAvailable();
    const products = availableProducts
      .filter((product) => shopById.has(product.shop) && (!search || product.name.toLowerCase().includes(search)))
      .slice(0, 200)
      .map((product) => ({
        ...product,
        shop: shopById.get(product.shop),
        inStock: product.stock > 0
      }));
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    if (!isValidDocumentId(req.params.id)) return res.status(400).json({ error: 'Invalid product ID.' });
    const product = await Product.findById(req.params.id);
    if (!product || !product.available) {
      return res.status(404).json({ error: 'This product is not currently available.' });
    }
    if (req.user && product.shop !== req.user.id) {
      return res.status(404).json({ error: 'This product is not currently available.' });
    }
    const shop = await User.findById(product.shop);
    if (!shop || shop.role !== 'shop' || shop.subscriptionStatus !== 'active'
      || (!req.user && !shop.marketplaceEnabled)) {
      return res.status(404).json({ error: 'This product is not currently available.' });
    }
    res.json({
      product: {
        ...product,
        shop: { businessName: shop.businessName, whatsapp: shop.whatsapp },
        inStock: product.stock > 0
      }
    });
  } catch (error) {
    next(error);
  }
});

function isValidDocumentId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{20}$/.test(id);
}

module.exports = router;
