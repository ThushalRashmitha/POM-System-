const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0, validate: Number.isInteger },
  imageUrl: { type: String, trim: true, default: '' },
  available: { type: Boolean, default: true }
}, { timestamps: true });

productSchema.index({ shop: 1, name: 1 });

module.exports = mongoose.model('Product', productSchema);
