const getDatabase = require('../config/database');
const { deleteQueryInBatches } = require('./firestoreUtils');
const { removeProductImage, saveProductImage } = require('../services/productImage');

const PRODUCTS = 'products';

function productFromSnapshot(snapshot) {
  return snapshot.exists ? { _id: snapshot.id, id: snapshot.id, ...snapshot.data() } : null;
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

async function createProduct(product) {
  const ref = getDatabase().collection(PRODUCTS).doc();
  const now = new Date().toISOString();
  const image = product.imageUrl?.startsWith('data:image/')
    ? await saveProductImage(product.shop, product.imageUrl)
    : { imageUrl: product.imageUrl || '', imagePublicId: '' };
  const record = {
    ...product,
    ...image,
    available: true,
    createdAt: now,
    updatedAt: now
  };
  try {
    await ref.create(record);
    return { _id: ref.id, id: ref.id, ...record };
  } catch (error) {
    if (image.imagePublicId) await removeProductImage(image.imagePublicId);
    throw error;
  }
}

async function updateOwned(id, shopId, updates) {
  const ref = getDatabase().collection(PRODUCTS).doc(String(id));
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get('shop') !== String(shopId)) return null;
  const previousImagePublicId = snapshot.get('imagePublicId');
  const hasImageUpdate = Object.hasOwn(updates, 'imageUrl');
  let imageUpdate = {};
  if (hasImageUpdate) {
    imageUpdate = updates.imageUrl?.startsWith('data:image/')
      ? await saveProductImage(shopId, updates.imageUrl)
      : { imageUrl: updates.imageUrl || '', imagePublicId: '' };
    delete updates.imageUrl;
  }
  await ref.update({ ...updates, ...imageUpdate, updatedAt: new Date().toISOString() });
  if (hasImageUpdate && previousImagePublicId && previousImagePublicId !== imageUpdate.imagePublicId) {
    await removeProductImage(previousImagePublicId);
  }
  return productFromSnapshot(await ref.get());
}

async function deleteOwned(id, shopId) {
  const ref = getDatabase().collection(PRODUCTS).doc(String(id));
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get('shop') !== String(shopId)) return null;
  const product = productFromSnapshot(snapshot);
  await ref.delete();
  if (product.imagePublicId) await removeProductImage(product.imagePublicId);
  return product;
}

async function deleteByShop(shopId) {
  const collection = getDatabase().collection(PRODUCTS);
  const snapshot = await collection.where('shop', '==', String(shopId)).get();
  const publicIds = snapshot.docs.map((doc) => doc.get('imagePublicId')).filter(Boolean);
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
