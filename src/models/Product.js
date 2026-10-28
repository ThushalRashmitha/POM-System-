const getDatabase = require('../config/database');
const { FieldPath } = require('firebase-admin/firestore');
const { deleteQueryInBatches } = require('./firestoreUtils');
const { removeProductImage } = require('../services/productImage');

const PRODUCTS = 'products';

function productFromSnapshot(snapshot) {
  if (!snapshot.exists) return null;
  const data = snapshot.data();
  const images = Array.isArray(data.images) && data.images.length
    ? data.images
    : (data.imageUrl ? [{ imageUrl: data.imageUrl, imagePublicId: data.imagePublicId || '' }] : []);
  const primaryImage = images[0] || {};
  return {
    _id: snapshot.id,
    id: snapshot.id,
    ...data,
    images,
    imageUrl: primaryImage.imageUrl || '',
    imagePublicId: primaryImage.imagePublicId || ''
  };
}

async function listByShop(shopId) {
  const snapshot = await getDatabase().collection(PRODUCTS).where('shop', '==', String(shopId)).get();
  return snapshot.docs.map(productFromSnapshot).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function listAvailable() {
  const snapshot = await getDatabase().collection(PRODUCTS).where('available', '==', true).get();
  return snapshot.docs.map(productFromSnapshot).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function listAvailableByShop(shopId) {
  const snapshot = await getDatabase().collection(PRODUCTS)
    .where('shop', '==', String(shopId))
    .where('available', '==', true)
    .get();
  return snapshot.docs.map(productFromSnapshot).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function findById(id) {
  const snapshot = await getDatabase().collection(PRODUCTS).doc(String(id)).get();
  return productFromSnapshot(snapshot);
}

async function findOwnedSnapshot(id, shopId) {
  const snapshot = await getDatabase().collection(PRODUCTS)
    .where(FieldPath.documentId(), '==', String(id))
    .where('shop', '==', String(shopId))
    .limit(1)
    .get();
  return snapshot.empty ? null : snapshot.docs[0];
}

async function createProduct(shopId, product) {
  const ref = getDatabase().collection(PRODUCTS).doc();
  const now = new Date().toISOString();
  const images = Array.isArray(product.images)
    ? product.images
    : (product.imageUrl ? [{ imageUrl: product.imageUrl, imagePublicId: product.imagePublicId || '' }] : []);
  const primaryImage = images[0] || {};
  const record = {
    ...product,
    shop: String(shopId),
    images,
    imageUrl: primaryImage.imageUrl || '',
    imagePublicId: primaryImage.imagePublicId || '',
    available: true,
    createdAt: now,
    updatedAt: now
  };
  try {
    await ref.create(record);
    return { _id: ref.id, id: ref.id, ...record };
  } catch (error) {
    await Promise.all(images.map((image) => image.imagePublicId).filter(Boolean).map(removeProductImage));
    throw error;
  }
}

async function updateOwned(id, shopId, updates) {
  if (['shop', 'shopId', 'userId'].some((field) => Object.hasOwn(updates, field))) {
    throw Object.assign(new Error('Product ownership cannot be changed.'), { status: 400 });
  }
  const snapshot = await findOwnedSnapshot(id, shopId);
  if (!snapshot) return null;
  const ref = snapshot.ref;
  const previous = productFromSnapshot(snapshot);
  const nextUpdates = { ...updates };
  const hasImageUpdate = Object.hasOwn(nextUpdates, 'images') || Object.hasOwn(nextUpdates, 'imageUrl');
  if (hasImageUpdate) {
    const images = Array.isArray(nextUpdates.images)
      ? nextUpdates.images
      : (nextUpdates.imageUrl
        ? [{ imageUrl: nextUpdates.imageUrl, imagePublicId: nextUpdates.imagePublicId || '' }]
        : []);
    const primaryImage = images[0] || {};
    nextUpdates.images = images;
    nextUpdates.imageUrl = primaryImage.imageUrl || '';
    nextUpdates.imagePublicId = primaryImage.imagePublicId || '';
  }
  await ref.update({ ...nextUpdates, updatedAt: new Date().toISOString() });
  if (hasImageUpdate) {
    const retainedPublicIds = new Set((nextUpdates.images || []).map((image) => image.imagePublicId).filter(Boolean));
    const removedPublicIds = previous.images
      .map((image) => image.imagePublicId)
      .filter((publicId) => publicId && !retainedPublicIds.has(publicId));
    await Promise.all(removedPublicIds.map(removeProductImage));
  }
  return productFromSnapshot(await ref.get());
}

async function deleteOwned(id, shopId) {
  const snapshot = await findOwnedSnapshot(id, shopId);
  if (!snapshot) return null;
  const ref = snapshot.ref;
  const product = productFromSnapshot(snapshot);
  await ref.delete();
  await Promise.all(product.images.map((image) => image.imagePublicId).filter(Boolean).map(removeProductImage));
  return product;
}

async function deleteByShop(shopId) {
  const collection = getDatabase().collection(PRODUCTS);
  const snapshot = await collection.where('shop', '==', String(shopId)).get();
  const publicIds = [...new Set(snapshot.docs.flatMap((doc) => {
    const data = doc.data();
    const images = Array.isArray(data.images) ? data.images : [];
    return [...images.map((image) => image.imagePublicId), data.imagePublicId].filter(Boolean);
  }))];
  await deleteQueryInBatches(collection.where('shop', '==', String(shopId)));
  await Promise.all(publicIds.map(removeProductImage));
  return snapshot.size;
}

async function countByShop(shopId) {
  const snapshot = await getDatabase().collection(PRODUCTS).where('shop', '==', String(shopId)).count().get();
  return snapshot.data().count;
}

module.exports = {
  countByShop,
  createProduct,
  deleteByShop,
  deleteOwned,
  findById,
  listAvailable,
  listAvailableByShop,
  listByShop,
  updateOwned
};
