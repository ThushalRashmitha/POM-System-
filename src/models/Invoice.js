const getDatabase = require('../config/database');
const { deleteQueryInBatches } = require('./firestoreUtils');

const INVOICES = 'invoices';

function invoiceFromSnapshot(snapshot) {
  return snapshot.exists ? { _id: snapshot.id, id: snapshot.id, ...snapshot.data() } : null;
}

async function listByShop(shopId, limit = 500) {
  const snapshot = await getDatabase().collection(INVOICES)
    .where('shop', '==', String(shopId)).get();
  return snapshot.docs.map(invoiceFromSnapshot)
    .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
    .slice(0, limit);
}

async function createInvoice(invoice) {
  const ref = getDatabase().collection(INVOICES).doc();
  const now = new Date().toISOString();
  const record = { ...invoice, createdAt: now, updatedAt: now, soldAt: now };
  await ref.create(record);
  return { _id: ref.id, id: ref.id, ...record };
}

async function deleteOwned(id, shopId) {
  const ref = getDatabase().collection(INVOICES).doc(String(id));
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get('shop') !== String(shopId)) return null;
  const invoice = invoiceFromSnapshot(snapshot);
  await ref.delete();
  return invoice;
}

async function deleteByShop(shopId) {
  return deleteQueryInBatches(getDatabase().collection(INVOICES).where('shop', '==', String(shopId)));
}

async function countByShop(shopId) {
  const snapshot = await getDatabase().collection(INVOICES).where('shop', '==', String(shopId)).count().get();
  return snapshot.data().count;
}

async function checkout(shopId, requestedItems, invoiceNumber) {
  const db = getDatabase();
  const quantities = new Map();
  for (const item of requestedItems) {
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  const productRefs = [...quantities.keys()].map((id) => db.collection('products').doc(id));
  const invoiceRef = db.collection(INVOICES).doc();

  return db.runTransaction(async (transaction) => {
    const productSnapshots = [];
    for (const productRef of productRefs) {
      productSnapshots.push(await transaction.get(productRef));
    }

    const invoiceItems = [];
    let total = 0;
    for (let index = 0; index < productSnapshots.length; index += 1) {
      const snapshot = productSnapshots[index];
      const product = snapshot.exists ? snapshot.data() : null;
      const quantity = quantities.get(productRefs[index].id);
      if (!product || product.shop !== String(shopId) || product.available !== true || product.stock < quantity) {
        throw Object.assign(new Error('A product is unavailable or does not have enough stock. Refresh and try again.'), { status: 409 });
      }
      const amount = product.price * quantity;
      total += amount;
      invoiceItems.push({
        product: snapshot.id,
        name: product.name,
        quantity,
        unitPrice: product.price,
        amount
      });
      transaction.update(productRefs[index], {
        stock: product.stock - quantity,
        updatedAt: new Date().toISOString()
      });
    }

    const now = new Date().toISOString();
    const invoice = {
      shop: String(shopId),
      invoiceNumber,
      items: invoiceItems,
      total,
      soldAt: now,
      createdAt: now,
      updatedAt: now
    };
    transaction.create(invoiceRef, invoice);
    return { _id: invoiceRef.id, id: invoiceRef.id, ...invoice };
  });
}

module.exports = { checkout, countByShop, createInvoice, deleteByShop, deleteOwned, listByShop };
