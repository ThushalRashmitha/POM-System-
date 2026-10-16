const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const { requireRole, requireUser } = require('../middleware/auth');

const router = express.Router();
router.use(requireUser, requireRole('shop'));

router.get('/products', async (req, res, next) => {
  try {
    const products = await Product.find({ shop: req.user.id }).sort({ createdAt: -1 });
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const { name, description = '', imageUrl = '' } = req.body;
    const price = Number(req.body.price);
    const stock = Number(req.body.stock);
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160) {
      return res.status(400).json({ error: 'Product name must be between 2 and 160 characters.' });
    }
    if (!Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Enter a valid non-negative price and whole-number stock quantity.' });
    }
    if (typeof description !== 'string' || description.length > 2000) {
      return res.status(400).json({ error: 'Product description must be 2,000 characters or fewer.' });
    }
    if (imageUrl && !isValidProductImage(imageUrl)) {
      return res.status(400).json({ error: 'Product image must be a valid HTTP or HTTPS URL or a PNG, JPG, or WebP image no larger than 2 MB.' });
    }

    const product = await Product.create({
      shop: req.user.id, name: name.trim(), description: description.trim(),
      imageUrl, price, stock
    });
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

router.patch('/products/:id', async (req, res, next) => {
  try {
    const updates = {};
    for (const field of ['name', 'description', 'imageUrl', 'price', 'stock', 'available']) {
      if (Object.hasOwn(req.body, field)) updates[field] = req.body[field];
    }
    if (Object.hasOwn(updates, 'price')) updates.price = Number(updates.price);
    if (Object.hasOwn(updates, 'stock')) updates.stock = Number(updates.stock);
    if (Object.hasOwn(updates, 'name') && (typeof updates.name !== 'string' || updates.name.trim().length < 2 || updates.name.length > 160)) {
      return res.status(400).json({ error: 'Enter a valid product name.' });
    }
    if (Object.hasOwn(updates, 'name')) updates.name = updates.name.trim();
    if (Object.hasOwn(updates, 'price') && (!Number.isFinite(updates.price) || updates.price < 0)) {
      return res.status(400).json({ error: 'Enter a valid non-negative price.' });
    }
    if (Object.hasOwn(updates, 'stock') && (!Number.isInteger(updates.stock) || updates.stock < 0)) {
      return res.status(400).json({ error: 'Stock must be a non-negative whole number.' });
    }
    if (Object.hasOwn(updates, 'description') && (typeof updates.description !== 'string' || updates.description.length > 2000)) {
      return res.status(400).json({ error: 'Product description must be 2,000 characters or fewer.' });
    }
    if (Object.hasOwn(updates, 'description')) updates.description = updates.description.trim();
    if (Object.hasOwn(updates, 'imageUrl') && updates.imageUrl && !isValidProductImage(updates.imageUrl)) {
      return res.status(400).json({ error: 'Product image must be a valid HTTP or HTTPS URL or a PNG, JPG, or WebP image no larger than 2 MB.' });
    }
    if (Object.hasOwn(updates, 'available') && typeof updates.available !== 'boolean') {
      return res.status(400).json({ error: 'Marketplace availability must be true or false.' });
    }
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, shop: req.user.id }, { $set: updates },
      { new: true, runValidators: true }
    );
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Invalid product ID.' });
    next(error);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const product = await Product.findOneAndDelete({ _id: req.params.id, shop: req.user.id });
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Product deleted.' });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Invalid product ID.' });
    next(error);
  }
});

router.get('/invoices', async (req, res, next) => {
  try {
    const invoices = await Invoice.find({ shop: req.user.id }).sort({ soldAt: -1 }).limit(500);
    res.json({ invoices });
  } catch (error) {
    next(error);
  }
});

router.post('/invoices', async (req, res, next) => {
  const updatedProducts = [];
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length || items.length > 100) {
      return res.status(400).json({ error: 'A bill must contain between 1 and 100 items.' });
    }

    const invoiceItems = [];
    let total = 0;
    for (const item of items) {
      const productId = String(item.productId || '');
      const quantity = Number(item.quantity);
      if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 1) {
        throw Object.assign(new Error('Each bill item needs a valid product and whole-number quantity.'), { status: 400 });
      }
      const product = await Product.findOneAndUpdate(
        { _id: productId, shop: req.user.id, available: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true }
      );
      if (!product) {
        throw Object.assign(new Error('A product is unavailable or does not have enough stock. Refresh and try again.'), { status: 409 });
      }
      updatedProducts.push({ id: product.id, quantity });
      const amount = product.price * quantity;
      total += amount;
      invoiceItems.push({
        product: product._id, name: product.name,
        quantity, unitPrice: product.price, amount
      });
    }

    const invoice = await Invoice.create({
      shop: req.user.id,
      invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      items: invoiceItems, total
    });
    res.status(201).json({ invoice });
  } catch (error) {
    await Promise.all(updatedProducts.map(({ id, quantity }) =>
      Product.updateOne({ _id: id, shop: req.user.id }, { $inc: { stock: quantity } })
    ));
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.delete('/invoices/:id', async (req, res, next) => {
  try {
    const invoice = await Invoice.findOneAndDelete({ _id: req.params.id, shop: req.user.id });
    if (!invoice) return res.status(404).json({ error: 'Report/invoice not found.' });
    res.json({ message: 'Invoice and its report record deleted.' });
  } catch (error) {
    if (error instanceof mongoose.Error.CastError) return res.status(400).json({ error: 'Invalid invoice ID.' });
    next(error);
  }
});

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidProductImage(value) {
  if (typeof value !== 'string') return false;
  if (isValidHttpUrl(value)) return true;
  const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  return Boolean(match && Buffer.from(match[1], 'base64').length <= 2 * 1024 * 1024);
}

module.exports = router;
