const mongoose = require('mongoose');

let connectionPromise;

mongoose.connection.on('disconnected', () => {
  connectionPromise = null;
});

module.exports = async function connectDatabase() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required to connect to MongoDB.');
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    })
      .then(() => {
        console.log('Connected to MongoDB.');
        return mongoose.connection;
      })
      .catch((error) => {
        connectionPromise = null;
        throw error;
      });
  }

  return connectionPromise;
};
