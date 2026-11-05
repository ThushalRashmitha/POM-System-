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

function createProductImageUploadSignature(shopId, mimeType) {
  if (typeof mimeType !== 'string' || !mimeType.startsWith('image/') || mimeType === 'image/svg+xml') {
    const error = new Error('Choose a supported raster image.');
    error.status = 400;
    throw error;
  }

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

function isOwnedProductImage(publicId, shopId) {
  const prefix = `products/${shopId}/`;
  return typeof publicId === 'string'
    && publicId.startsWith(prefix)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId.slice(prefix.length));
}

async function removeProductImage(publicId) {
  if (!publicId) return;
  getCloudinaryConfig();
  const result = await cloudinary.uploader.destroy(publicId);
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw new Error(`Unable to remove product image "${publicId}".`);
  }
}

module.exports = { createProductImageUploadSignature, isOwnedProductImage, removeProductImage };
