const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const User = require('../models/User');

const router = express.Router();

router.get('/products', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim().slice(0, 100);
    const shopFilter = {
      role: 'shop', subscriptionStatus: 'active', marketplaceEnabled: true
    };
    const shops = await User.find(shopFilter).select('businessName whatsapp').lean();
    const shopById = new Map(shops.map((shop) => [String(shop._id), shop]));
    const query = { shop: { $in: shops.map((shop) => shop._id) }, available: true };
    if (search) query.name = { $regex: escapeRegex(search), $options: 'i' };
    const products = await Product.find(query).sort({ createdAt: -1 }).limit(200).lean();
    res.json({
      products: products.map((product) => ({
        ...product,
        shop: shopById.get(String(product.shop)),
        inStock: product.stock > 0
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }
    const product = await Product.findOne({
      _id: req.params.id, available: true
    }).populate({
      path: 'shop',
      match: { role: 'shop', subscriptionStatus: 'active', marketplaceEnabled: true },
      select: 'businessName whatsapp'
    }).lean();
    if (!product || !product.shop) return res.status(404).json({ error: 'This product is not currently available.' });
    res.json({ product: { ...product, inStock: product.stock > 0 } });
  } catch (error) {
    next(error);
  }
});

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
