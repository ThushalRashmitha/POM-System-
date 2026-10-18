async function deleteQueryInBatches(query) {
  let deleted = 0;
  while (true) {
    const snapshot = await query.limit(450).get();
    if (snapshot.empty) return deleted;

    const batch = snapshot.docs[0].ref.firestore.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    deleted += snapshot.size;
    if (snapshot.size < 450) return deleted;
  }
}

module.exports = { deleteQueryInBatches };
