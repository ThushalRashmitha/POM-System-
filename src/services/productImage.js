const { randomUUID } = require('node:crypto');
const { v2: cloudinary } = require('cloudinary');

const imagePattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to enable product image uploads.');
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
}

async function saveProductImage(shopId, dataUrl) {
  const match = imagePattern.exec(dataUrl);
  if (!match) throw new Error('Product image data is invalid.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Product image must be no larger than 2 MB.');
  }

  configureCloudinary();
  const result = await cloudinary.uploader.upload(dataUrl, {
    folder: `product-images/${shopId}`,
    public_id: randomUUID(),
    resource_type: 'image'
  });
  if (!result?.secure_url || !result.public_id) {
    throw new Error('Cloudinary did not return the uploaded product image URL and ID.');
  }
  return { imageUrl: result.secure_url, imagePublicId: result.public_id };
}

async function removeProductImage(publicId) {
  if (!publicId) return;
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, { invalidate: true });
}

module.exports = { removeProductImage, saveProductImage };
