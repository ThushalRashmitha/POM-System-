const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function ensurePlatformAdmin() {
  const email = process.env.ADMIN_EMAIL.toLowerCase().trim();
  const existingAdmin = await User.findOne({ role: 'platform-admin' });
  if (existingAdmin) {
    if (existingAdmin.email !== email) {
      throw new Error('ADMIN_EMAIL does not match the provisioned platform administrator.');
    }
    return;
  }

  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
  await User.create({
    email,
    passwordHash,
    role: 'platform-admin',
    subscriptionStatus: 'active'
  });
  console.log(`Provisioned platform administrator: ${email}`);
}

module.exports = { ensurePlatformAdmin };
