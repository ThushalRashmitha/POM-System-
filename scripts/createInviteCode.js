require('dotenv').config();

const getDatabase = require('../src/config/database');
const { createInviteCode } = require('../src/models/InviteCode');

async function main() {
  const missing = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY'
  ].filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required Firebase environment variables: ${missing.join(', ')}`);
  }

  getDatabase();
  const assignedTo = process.argv.slice(2).join(' ').trim();
  const code = await createInviteCode(assignedTo || undefined);
  console.log(`Created invite code: ${code}`);
}

main().catch((error) => {
  console.error('Unable to create invite code:', error);
  process.exitCode = 1;
});
