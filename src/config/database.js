const mongoose = require('mongoose');

module.exports = async function connectDatabase() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');
};
