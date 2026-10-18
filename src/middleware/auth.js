const jwt = require('jsonwebtoken');
const User = require('../models/User');

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/'
};

function setSessionCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.cookie('pos_session', token, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function clearSessionCookie(res) {
  res.clearCookie('pos_session', cookieOptions);
}

async function requireUser(req, res, next) {
  const token = req.cookies.pos_session;
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Your account is no longer available.' });
    if (user.role === 'shop' && user.subscriptionStatus !== 'active') {
      clearSessionCookie(res);
      return res.status(403).json({ error: 'This shop account is suspended. Contact the platform administrator.' });
    }
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      clearSessionCookie(res);
      return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
    }
    return next(error);
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

module.exports = { clearSessionCookie, requireRole, requireUser, setSessionCookie };
