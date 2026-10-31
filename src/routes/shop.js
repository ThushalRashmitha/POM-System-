const express = require('express');
const Product = require('../models/Product');
const Invoice = require('../models/Invoice');
const { requireRole, requireUser } = require('../middleware/auth');

const router = express.Router();
router.use(requireUser, requireRole('shop'));

router.get('/products', async (req, res, next) => {
  try {
    res.json({ products: await Product.listByShop(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const { name, description = '', imageUrl = '' } = req.body;
    const sellingPriceInput = req.body.sellingPrice ?? req.body.price;
    const costPriceInput = req.body.costPrice ?? 0;
    const sellingPrice = Number(sellingPriceInput);
    const costPrice = Number(costPriceInput);
    const stock = Number(req.body.stock);
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 160) {
      return res.status(400).json({ error: 'Product name must be between 2 and 160 characters.' });
    }
    if (!isValidPriceInput(costPriceInput) || !isValidPriceInput(sellingPriceInput)
      || !Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Enter valid non-negative cost and selling prices and a whole-number stock quantity.' });
    }
    if (typeof description !== 'string' || description.length > 2000) {
      return res.status(400).json({ error: 'Product description must be 2,000 characters or fewer.' });
    }
    if (typeof imageUrl !== 'string' || (imageUrl && !isValidProductImage(imageUrl))) {
      return res.status(400).json({ error: 'Product image must be a valid HTTP or HTTPS URL or a PNG, JPG, or WebP image no larger than 2 MB.' });
    }

    const product = await Product.createProduct({
      shop: req.user.id,
      name: name.trim(),
      description: description.trim(),
      imageUrl,
      costPrice,
      sellingPrice,
      price: sellingPrice,
      stock
    });
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

router.patch('/products/:id', async (req, res, next) => {
  try {
    if (!isValidDocumentId(req.params.id)) return res.status(400).json({ error: 'Invalid product ID.' });
    const updates = {};
    for (const field of ['name', 'description', 'imageUrl', 'price', 'sellingPrice', 'costPrice', 'stock', 'available']) {
      if (Object.hasOwn(req.body, field)) updates[field] = req.body[field];
    }
    if (Object.hasOwn(updates, 'price') && Object.hasOwn(updates, 'sellingPrice')
      && Number(updates.price) !== Number(updates.sellingPrice)) {
      return res.status(400).json({ error: 'Selling price was provided with conflicting values.' });
    }
    if (Object.hasOwn(updates, 'sellingPrice') || Object.hasOwn(updates, 'price')) {
      const sellingPriceInput = updates.sellingPrice ?? updates.price;
      const sellingPrice = Number(sellingPriceInput);
      if (!isValidPriceInput(sellingPriceInput)) {
        return res.status(400).json({ error: 'Selling price must be a valid non-negative amount.' });
      }
      updates.sellingPrice = sellingPrice;
      updates.price = sellingPrice;
    }
    if (Object.hasOwn(updates, 'costPrice')) {
      if (!isValidPriceInput(updates.costPrice)) {
        return res.status(400).json({ error: 'Cost price must be a valid non-negative amount.' });
      }
      updates.costPrice = Number(updates.costPrice);
    }
    if (Object.hasOwn(updates, 'stock')) updates.stock = Number(updates.stock);
    if (Object.hasOwn(updates, 'name') && (typeof updates.name !== 'string' || updates.name.trim().length < 2 || updates.name.length > 160)) {
      return res.status(400).json({ error: 'Enter a valid product name.' });
    }
    if (Object.hasOwn(updates, 'name')) updates.name = updates.name.trim();
    if (Object.hasOwn(updates, 'stock') && (!Number.isInteger(updates.stock) || updates.stock < 0)) {
      return res.status(400).json({ error: 'Stock must be a non-negative whole number.' });
    }
    if (Object.hasOwn(updates, 'description') && (typeof updates.description !== 'string' || updates.description.length > 2000)) {
      return res.status(400).json({ error: 'Product description must be 2,000 characters or fewer.' });
    }
    if (Object.hasOwn(updates, 'description')) updates.description = updates.description.trim();
    if (Object.hasOwn(updates, 'imageUrl')
      && (typeof updates.imageUrl !== 'string' || (updates.imageUrl && !isValidProductImage(updates.imageUrl)))) {
      return res.status(400).json({ error: 'Product image must be a valid HTTP or HTTPS URL or a PNG, JPG, or WebP image no larger than 2 MB.' });
    }
    if (Object.hasOwn(updates, 'available') && typeof updates.available !== 'boolean') {
      return res.status(400).json({ error: 'Marketplace availability must be true or false.' });
    }
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'No product updates were provided.' });
    const product = await Product.updateOwned(req.params.id, req.user.id, updates);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product });
  } catch (error) {
    next(error);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    if (!isValidDocumentId(req.params.id)) return res.status(400).json({ error: 'Invalid product ID.' });
    const product = await Product.deleteOwned(req.params.id, req.user.id);
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Product deleted.' });
  } catch (error) {
    next(error);
  }
});

router.get('/invoices', async (req, res, next) => {
  try {
    res.json({ invoices: await Invoice.listByShop(req.user.id) });
  } catch (error) {
    next(error);
  }
});

router.post('/invoices', async (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length || items.length > 100) {
      return res.status(400).json({ error: 'A bill must contain between 1 and 100 items.' });
    }
    const requestedItems = [];
    for (const item of items) {
      const productId = String(item.productId || '');
      const quantity = Number(item.quantity);
      if (!isValidDocumentId(productId) || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ error: 'Each bill item needs a valid product and whole-number quantity.' });
      }
      requestedItems.push({ productId, quantity });
    }
    const invoice = await Invoice.checkout(
      req.user.id,
      requestedItems,
      `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    );
    res.status(201).json({ invoice });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

router.delete('/invoices/:id', async (req, res, next) => {
  try {
    if (!isValidDocumentId(req.params.id)) return res.status(400).json({ error: 'Invalid invoice ID.' });
    const invoice = await Invoice.deleteOwned(req.params.id, req.user.id);
    if (!invoice) return res.status(404).json({ error: 'Report/invoice not found.' });
    res.json({ message: 'Invoice and its report record deleted.' });
  } catch (error) {
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

function isValidDocumentId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{20}$/.test(id);
}

function isValidPrice(price) {
  return Number.isFinite(price) && price >= 0;
}

function isValidPriceInput(value) {
  return (typeof value === 'number' || typeof value === 'string')
    && String(value).trim() !== ''
    && isValidPrice(Number(value));
}

module.exports = router;
