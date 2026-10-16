const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  shop: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  invoiceNumber: { type: String, required: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 }
  }],
  total: { type: Number, required: true, min: 0 },
  soldAt: { type: Date, default: Date.now }
}, { timestamps: true });

invoiceSchema.index({ shop: 1, invoiceNumber: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
