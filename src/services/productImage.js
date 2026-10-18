const { randomUUID } = require('node:crypto');
const { getStorage } = require('firebase-admin/storage');
const getFirebaseApp = require('../config/firebaseApp');

const imagePattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

async function saveProductImage(shopId, dataUrl) {
  const match = imagePattern.exec(dataUrl);
  if (!match) throw new Error('Product image data is invalid.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Product image must be no larger than 2 MB.');
  }

  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error('Set FIREBASE_STORAGE_BUCKET to enable product image uploads, or use an image URL instead.');
  }

  const extension = match[1] === 'jpeg' ? 'jpg' : match[1];
  const contentType = `image/${match[1]}`;
  const objectPath = `product-images/${shopId}/${randomUUID()}.${extension}`;
  const token = randomUUID();
  const bucket = getStorage(getFirebaseApp()).bucket(bucketName);
  await bucket.file(objectPath).save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token }
    }
  });

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  return { imageUrl, imageStoragePath: objectPath };
}

async function removeProductImage(objectPath) {
  if (!objectPath) return;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error('FIREBASE_STORAGE_BUCKET is required to remove a stored product image.');
  await getStorage(getFirebaseApp()).bucket(bucketName).file(objectPath).delete({ ignoreNotFound: true });
}

module.exports = { removeProductImage, saveProductImage };
