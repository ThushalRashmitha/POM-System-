const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const { requireRole, requireUser } = require('../middleware/auth');

const router = express.Router();
router.use(requireUser, requireRole('platform-admin'));

router.get('/shops', async (req, res, next) => {
  try {
    const shops = await User.listShops();
    const counts = await Promise.all(shops.map(async (shop) => {
      const [productCount, invoiceCount] = await Promise.all([
        Product.countByShop(shop.id),
        Invoice.countByShop(shop.id)
      ]);
      return { ...shop, passwordHash: undefined, productCount, invoiceCount };
    }));
    res.json({ shops: counts });
  } catch (error) {
    next(error);
  }
});

router.patch('/shops/:id', async (req, res, next) => {
  try {
    if (!isValidDocumentId(req.params.id)) return res.status(400).json({ error: 'Invalid shop ID.' });
    const updates = {};
    if (Object.hasOwn(req.body, 'subscriptionStatus')) {
      if (!['active', 'suspended'].includes(req.body.subscriptionStatus)) {
        return res.status(400).json({ error: 'Payment status must be active or suspended.' });
      }
      updates.subscriptionStatus = req.body.subscriptionStatus;
    }
    if (Object.hasOwn(req.body, 'marketplaceEnabled')) {
      if (typeof req.body.marketplaceEnabled !== 'boolean') {
        return res.status(400).json({ error: 'Marketplace availability must be true or false.' });
      }
      updates.marketplaceEnabled = req.body.marketplaceEnabled;
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No valid account updates were provided.' });

    const shop = await User.updateUser(req.params.id, updates, 'shop');
    if (!shop) return res.status(404).json({ error: 'Shop account not found.' });
    delete shop.passwordHash;
    res.json({ shop });
  } catch (error) {
    next(error);
  }
});

router.delete('/shops/:id', async (req, res, next) => {
  try {
    if (!isValidDocumentId(req.params.id)) return res.status(400).json({ error: 'Invalid shop ID.' });
    const shop = await User.findById(req.params.id);
    if (!shop || shop.role !== 'shop') return res.status(404).json({ error: 'Shop account not found.' });
    await Promise.all([
      Product.deleteByShop(shop.id),
      Invoice.deleteByShop(shop.id)
    ]);
    await User.deleteUser(shop.id, 'shop');
    res.json({ message: 'Shop account, products, and invoices deleted.' });
  } catch (error) {
    next(error);
  }
});

function isValidDocumentId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{20}$/.test(id);
}

module.exports = router;
