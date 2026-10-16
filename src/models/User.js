const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  businessName: { type: String, trim: true, maxlength: 120 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  whatsapp: { type: String, trim: true },
  role: { type: String, enum: ['shop', 'platform-admin'], default: 'shop', required: true },
  subscriptionStatus: { type: String, enum: ['active', 'suspended'], default: 'active' },
  marketplaceEnabled: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
