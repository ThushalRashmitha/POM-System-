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
    const requestedShopId = typeof req.query.shop === 'string' ? req.query.shop : '';
    let shops;
    if (req.user) {
      shops = [req.user];
    } else if (requestedShopId) {
      if (!isValidDocumentId(requestedShopId)) {
        return res.status(400).json({ error: 'Invalid shop ID.' });
      }
      const shop = await User.findById(requestedShopId);
      if (!isMarketplaceShop(shop) || !shop.marketplaceEnabled) {
        return res.status(404).json({ error: 'This shop is not currently available.' });
      }
      shops = [shop];
    } else {
      shops = (await User.listShops()).filter((shop) =>
        shop.subscriptionStatus === 'active' && shop.marketplaceEnabled
      );
    }
    const shopById = new Map(shops.map((shop) => [shop.id, {
      businessName: shop.businessName,
      whatsapp: shop.whatsapp
    }]));
    const scopedShopId = req.user ? req.user.id : requestedShopId;
    const availableProducts = scopedShopId
      ? await Product.listAvailableByShop(scopedShopId)
      : await Product.listAvailable();
    const products = availableProducts
      .filter((product) => shopById.has(product.shop) && (!search || product.name.toLowerCase().includes(search)))
      .slice(0, 200)
      .map((product) => ({
        ...product,
        shop: shopById.get(product.shop),
        inStock: product.stock > 0
      }));
    res.json({
      products,
      ...(requestedShopId && !req.user
        ? { shop: { id: shops[0].id, businessName: shops[0].businessName } }
        : {})
    });
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
    const requestedShopId = typeof req.query.shop === 'string' ? req.query.shop : '';
    if (requestedShopId && product.shop !== requestedShopId) {
      return res.status(404).json({ error: 'This product is not currently available.' });
    }
    const shop = await User.findById(product.shop);
    if (!isMarketplaceShop(shop)
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

function isMarketplaceShop(shop) {
  return Boolean(shop && shop.role === 'shop' && shop.subscriptionStatus === 'active');
}

function isValidDocumentId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{20}$/.test(id);
}

module.exports = router;
