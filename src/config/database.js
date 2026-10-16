const mongoose = require('mongoose');
let connectionPromise;

module.exports = async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI)
      .then(() => console.log('Connected to MongoDB.'))
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }
  await connectionPromise;
};
