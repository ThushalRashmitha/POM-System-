const { getFirestore } = require('firebase-admin/firestore');
const getFirebaseApp = require('./firebaseApp');

let firestore;

module.exports = function getDatabase() {
  if (!firestore) {
    firestore = getFirestore(getFirebaseApp());
    console.log('Firebase Firestore is ready.');
  }
  return firestore;
};
