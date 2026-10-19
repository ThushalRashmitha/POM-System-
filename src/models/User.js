const getDatabase = require('../config/database');
const { FieldValue } = require('firebase-admin/firestore');
const { timingSafeEqual } = require('node:crypto');

const USERS = 'users';
const EMAILS = 'userEmails';
const INVITE_CODES = 'invite_codes';

function userFromSnapshot(snapshot) {
  return snapshot.exists ? { _id: snapshot.id, id: snapshot.id, ...snapshot.data() } : null;
}

function emailDocumentId(email) {
  return Buffer.from(email.trim().toLowerCase()).toString('base64url');
}

async function findById(id) {
  const snapshot = await getDatabase().collection(USERS).doc(String(id)).get();
  return userFromSnapshot(snapshot);
}

async function findByEmail(email) {
  const db = getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const emailSnapshot = await db.collection(EMAILS).doc(emailDocumentId(normalizedEmail)).get();
  if (!emailSnapshot.exists) return null;
  return findById(emailSnapshot.get('userId'));
}

async function findPlatformAdmin() {
  const snapshot = await getDatabase().collection(USERS)
    .where('role', '==', 'platform-admin').limit(1).get();
  return snapshot.empty ? null : userFromSnapshot(snapshot.docs[0]);
}

async function createUser(user) {
  const db = getDatabase();
  const normalizedEmail = user.email.trim().toLowerCase();
  const userRef = db.collection(USERS).doc();
  const emailRef = db.collection(EMAILS).doc(emailDocumentId(normalizedEmail));
  const now = new Date().toISOString();
  const record = {
    ...user,
    email: normalizedEmail,
    marketplaceEnabled: user.marketplaceEnabled ?? user.role === 'shop',
    createdAt: now,
    updatedAt: now
  };

  await db.runTransaction(async (transaction) => {
    const existingEmail = await transaction.get(emailRef);
    if (existingEmail.exists) {
      throw Object.assign(new Error('An account with this email already exists.'), { code: 'EMAIL_EXISTS' });
    }
    transaction.create(userRef, record);
    transaction.create(emailRef, { userId: userRef.id });
  });

  return { _id: userRef.id, id: userRef.id, ...record };
}

async function createShopWithAccessCode(user, accessCode, masterAccessCode) {
  const db = getDatabase();
  const normalizedEmail = user.email.trim().toLowerCase();
  const userRef = db.collection(USERS).doc();
  const emailRef = db.collection(EMAILS).doc(emailDocumentId(normalizedEmail));
  const inviteQuery = db.collection(INVITE_CODES)
    .where('code', '==', accessCode)
    .where('isUsed', '==', false);
  const now = new Date().toISOString();
  const record = {
    ...user,
    email: normalizedEmail,
    marketplaceEnabled: user.marketplaceEnabled ?? user.role === 'shop',
    createdAt: now,
    updatedAt: now
  };
  await db.runTransaction(async (transaction) => {
    const inviteSnapshot = await transaction.get(inviteQuery);
    const existingEmail = await transaction.get(emailRef);
    if (existingEmail.exists) {
      throw Object.assign(new Error('An account with this email already exists.'), { code: 'EMAIL_EXISTS' });
    }

    const invite = inviteSnapshot.docs[0];
    if (invite) {
      transaction.update(invite.ref, {
        isUsed: true,
        usedBy: userRef.id,
        usedEmail: normalizedEmail,
        usedAt: FieldValue.serverTimestamp()
      });
    } else {
      const matchingCodes = await transaction.get(
        db.collection(INVITE_CODES).where('code', '==', accessCode)
      );
      const submittedBytes = Buffer.from(accessCode);
      const masterBytes = Buffer.from(masterAccessCode || '');
      const matchesMaster = Boolean(masterAccessCode)
        && submittedBytes.length === masterBytes.length
        && timingSafeEqual(submittedBytes, masterBytes);
      if (!matchingCodes.empty || !matchesMaster) {
        throw Object.assign(new Error('Invalid or already used Admin Access Code.'), { code: 'INVALID_ACCESS_CODE' });
      }
    }

    transaction.create(userRef, record);
    transaction.create(emailRef, { userId: userRef.id });
  });

  return { _id: userRef.id, id: userRef.id, ...record };
}

async function updateUser(id, updates, requiredRole) {
  const db = getDatabase();
  const userRef = db.collection(USERS).doc(String(id));
  const snapshot = await userRef.get();
  if (!snapshot.exists || (requiredRole && snapshot.get('role') !== requiredRole)) return null;
  await userRef.update({ ...updates, updatedAt: new Date().toISOString() });
  return userFromSnapshot(await userRef.get());
}

async function listShops() {
  const snapshot = await getDatabase().collection(USERS).where('role', '==', 'shop').get();
  return snapshot.docs.map(userFromSnapshot).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function deleteUser(id, requiredRole) {
  const db = getDatabase();
  const userRef = db.collection(USERS).doc(String(id));
  const snapshot = await userRef.get();
  if (!snapshot.exists || (requiredRole && snapshot.get('role') !== requiredRole)) return null;
  const user = userFromSnapshot(snapshot);
  const emailRef = db.collection(EMAILS).doc(emailDocumentId(user.email));
  await db.runTransaction(async (transaction) => {
    transaction.delete(userRef);
    transaction.delete(emailRef);
  });
  return user;
}

module.exports = {
  createShopWithAccessCode,
  createUser,
  deleteUser,
  findByEmail,
  findById,
  findPlatformAdmin,
  listShops,
  updateUser
};
