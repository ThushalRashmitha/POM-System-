const { randomUUID } = require('node:crypto');
const { v2: cloudinary } = require('cloudinary');

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function configureCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in environment variables.');
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
}

function parseImageSource(source) {
  if (typeof source === 'string') {
    if (!source.startsWith('data:image/')) {
      throw new Error('Product image data is invalid.');
    }
    const parts = source.split(',');
    if (parts.length < 2) throw new Error('Product image data is invalid.');
    return Buffer.from(parts[1], 'base64');
  }

  const buffer = Buffer.isBuffer(source)
    ? source
    : source && typeof source === 'object' && ArrayBuffer.isView(source)
      ? Buffer.from(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength))
      : source && source.buffer instanceof ArrayBuffer
        ? Buffer.from(source.buffer)
        : null;

  if (!buffer || !buffer.length) {
    throw new Error('Product image data is invalid.');
  }

  return buffer;
}

async function saveProductImage(shopId, imageSource, mimeType) {
  const imageBuffer = parseImageSource(imageSource);
  
  if (imageBuffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Product image must be no larger than 2 MB.');
  }

  configureCloudinary();

  // Cloudinary stream upload using Buffer directly to prevent "Resource is invalid" error
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `product-images/${shopId}`,
        public_id: randomUUID(),
        resource_type: 'image'
      },
      (error, result) => {
        if (error || !result?.secure_url || !result?.public_id) {
          return reject(new Error(error?.message || 'Cloudinary image upload failed.'));
        }
        resolve({ imageUrl: result.secure_url, imagePublicId: result.public_id });
      }
    );

    uploadStream.end(imageBuffer);
  });
}

async function removeProductImage(publicId) {
  if (!publicId) return;
  configureCloudinary();
  await cloudinary.uploader.destroy(publicId, { invalidate: true });
}

module.exports = { removeProductImage, saveProductImage };