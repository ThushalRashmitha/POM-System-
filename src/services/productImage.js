const cloudinary = require('cloudinary').v2;
const { randomUUID } = require('node:crypto');

function getCloudinaryConfig() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    const error = new Error('Product image uploads are not configured.');
    error.status = 503;
    throw error;
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
  });
  return { cloudName: CLOUDINARY_CLOUD_NAME, apiKey: CLOUDINARY_API_KEY, apiSecret: CLOUDINARY_API_SECRET };
}

function createProductImageUploadSignature(shopId) {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = `products/${shopId}`;
  const publicId = randomUUID();
  const parameters = { folder, public_id: publicId, timestamp };

  return {
    cloudName,
    apiKey,
    ...parameters,
    signature: cloudinary.utils.api_sign_request(parameters, apiSecret)
  };
}

async function removeProductImage(publicId) {
  if (!publicId) return;
  getCloudinaryConfig();
  const result = await cloudinary.uploader.destroy(publicId);
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(`Unable to remove product image "${publicId}".`);
  }
}

module.exports = { createProductImageUploadSignature, removeProductImage };
