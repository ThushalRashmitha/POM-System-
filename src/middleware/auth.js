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

async function authenticate(req, res) {
  const token = req.cookies.pos_session;
  if (!token) return { status: 401, message: 'Please sign in to continue.' };

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') throw error;
    clearSessionCookie(res);
    return { status: 401, message: 'Your session has expired. Please sign in again.' };
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    clearSessionCookie(res);
    return { status: 401, message: 'Your account is no longer available.' };
  }
  if (user.role === 'shop' && user.subscriptionStatus !== 'active') {
    clearSessionCookie(res);
    return { status: 403, message: 'This shop account is suspended. Contact the platform administrator.' };
  }
  return { user };
}

async function requireUser(req, res, next) {
  try {
    const session = await authenticate(req, res);
    if (!session.user) return res.status(session.status).json({ error: session.message });
    req.user = session.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requirePageRole(role) {
  return async (req, res, next) => {
    try {
      const session = await authenticate(req, res);
      if (!session.user) return res.redirect('/login.html');
      if (session.user.role !== role) {
        return res.redirect(session.user.role === 'platform-admin' ? '/admin.html' : '/shop.html');
      }
      req.user = session.user;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

async function optionalUser(req, res, next) {
  if (!req.cookies.pos_session) return next();
  try {
    const session = await authenticate(req, res);
    if (session.user?.role === 'shop') req.user = session.user;
    return next();
  } catch (error) {
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

module.exports = { clearSessionCookie, optionalUser, requirePageRole, requireRole, requireUser, setSessionCookie };
