const { cert, getApps, initializeApp } = require('firebase-admin/app');



function getFirebaseApp() {

const existingApp = getApps()[0];

if (existingApp) return existingApp;



const projectId = process.env.FIREBASE_PROJECT_ID;

const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const missing = [

['FIREBASE_PROJECT_ID', projectId],

['FIREBASE_CLIENT_EMAIL', clientEmail],

['FIREBASE_PRIVATE_KEY', privateKey]

].filter(([, value]) => !value).map(([name]) => name);



if (missing.length) {

throw new Error(`Missing required Firebase environment variables: ${missing.join(', ')}`);

}



return initializeApp({

credential: cert({ projectId, clientEmail, privateKey }),

...(process.env.FIREBASE_STORAGE_BUCKET

? { storageBucket: process.env.FIREBASE_STORAGE_BUCKET }

: {})

});

}



module.exports = getFirebaseApp;