const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { clearSessionCookie, requireUser, setSessionCookie } = require('../middleware/auth');

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' }
});

function publicUser(user) {
  return {
    id: user.id,
    businessName: user.businessName,
    email: user.email,
    whatsapp: user.whatsapp,
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    marketplaceEnabled: user.marketplaceEnabled
  };
}

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const businessName = String(req.body.businessName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const whatsapp = String(req.body.whatsapp || '').replace(/[^\d]/g, '');

    if (businessName.length < 2 || businessName.length > 120) {
      return res.status(400).json({ error: 'Business name must be between 2 and 120 characters.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    if (password.length < 10 || password.length > 128) {
      return res.status(400).json({ error: 'Password must be between 10 and 128 characters.' });
    }
    if (whatsapp.length < 8 || whatsapp.length > 15) {
      return res.status(400).json({ error: 'Enter a WhatsApp number including its country code.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.createUser({
      businessName,
      email,
      passwordHash,
      whatsapp,
      role: 'shop',
      subscriptionStatus: 'active'
    });

    setSessionCookie(res, user.id);
    return res.status(201).json({
      message: 'Shop registered. Your portal is ready.',
      user: publicUser(user)
    });
  } catch (error) {
    if (error.code === 'EMAIL_EXISTS') return res.status(409).json({ error: error.message });
    return next(error);
  }
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    if (user.role === 'shop' && user.subscriptionStatus !== 'active') {
      return res.status(403).json({ error: 'Your shop is awaiting payment approval or has been suspended. Contact the administrator.' });
    }

    setSessionCookie(res, user.id);
    return res.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ message: 'Signed out.' });
});

router.get('/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
