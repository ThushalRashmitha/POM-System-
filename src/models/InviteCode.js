const { randomBytes } = require('node:crypto');
const { Timestamp } = require('firebase-admin/firestore');
const getDatabase = require('../config/database');

async function createInviteCode(assignedTo) {
  const code = randomBytes(12).toString('base64url');
  const record = {
    code,
    isUsed: false,
    createdAt: Timestamp.now()
  };
  if (assignedTo) record.assignedTo = assignedTo;

  await getDatabase().collection('invite_codes').add(record);
  return code;
}

module.exports = { createInviteCode };
