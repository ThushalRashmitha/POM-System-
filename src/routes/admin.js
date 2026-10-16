const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const { requireRole, requireUser } = require('../middleware/auth');

const router = express.Router();
router.use(requireUser, requireRole('platform-admin'));

router.get('/shops', async (req, res, next) => {
  try {
    const shops = await User.find({ role: 'shop' }).select('-passwordHash').sort({ createdAt: -1 }).lean();
    const shopIds = shops.map((shop) => shop._id);
    const [productCounts, invoiceCounts] = await Promise.all([
      Product.aggregate([{ $match: { shop: { $in: shopIds } } }, { $group: { _id: '$shop', count: { $sum: 1 } } }]),
      Invoice.aggregate([{ $match: { shop: { $in: shopIds } } }, { $group: { _id: '$shop', count: { $sum: 1 } } }])
    ]);
    const productsByShop = new Map(productCounts.map((entry) => [String(entry._id), entry.count]));
    const invoicesByShop = new Map(invoiceCounts.map((entry) => [String(entry._id), entry.count]));
    res.json({
      shops: shops.map((shop) => ({
        ...shop,
        productCount: productsByShop.get(String(shop._id)) || 0,
        invoiceCount: invoicesByShop.get(String(shop._id)) || 0
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/shops/:id', async (req, res, next) => {
  try {
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

    const shop = await User.findOneAndUpdate(
      { _id: req.params.id, role: 'shop' }, { $set: updates },
      { new: true, runValidators: true }
    ).select('-passwordHash');
    if (!shop) return res.status(404).json({ error: 'Shop account not found.' });
    res.json({ shop });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Invalid shop ID.' });
    next(error);
  }
});

router.delete('/shops/:id', async (req, res, next) => {
  try {
    const shop = await User.findOneAndDelete({ _id: req.params.id, role: 'shop' });
    if (!shop) return res.status(404).json({ error: 'Shop account not found.' });
    await Promise.all([
      Product.deleteMany({ shop: shop._id }),
      Invoice.deleteMany({ shop: shop._id })
    ]);
    res.json({ message: 'Shop account, products, and invoices deleted.' });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Invalid shop ID.' });
    next(error);
  }
});

module.exports = router;
