const admin = require('firebase-admin');

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY 
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') 
    : undefined;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey
    })
  });
}

const db = admin.firestore();

// මෙයින් අනෙකුත් සියලුම ෆයිල් වල errors මඟ හැරේ (const db මෙන්ම const { db } යන දෙකම වැඩ කරයි)
db.db = db;
db.admin = admin;

module.exports = db;