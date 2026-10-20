const { randomUUID } = require('node:crypto');
const { v2: cloudinary } = require('cloudinary');

const imagePattern = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function getCloudName() {
  return process.env.CLOUDINARY_CLOUD_NAME || 'layrstsz';
}

function normalizeImageSource(source, mimeType) {
  if (typeof source === 'string') {
    if (source.startsWith('data:image/')) return source;
    throw new Error('Product image data is invalid.');
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

  const resolvedMimeType = mimeType || detectMimeType(buffer) || 'image/jpeg';
  if (!/^image\/(png|jpeg|webp)$/.test(resolvedMimeType)) {
    throw new Error('Unsupported product image format. Use PNG, JPG, or WebP.');
  }

  return `data:${resolvedMimeType};base64,${buffer.toString('base64')}`;
}

function detectMimeType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 2 && buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xd8]))) {
    return 'image/jpeg';
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) && buffer.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))) {
    return 'image/webp';
  }
  return null;
}

async function saveProductImage(shopId, imageSource, mimeType) {
  const dataUrl = normalizeImageSource(imageSource, mimeType);
  const match = imagePattern.exec(dataUrl);
  if (!match) throw new Error('Product image data is invalid.');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Product image must be no larger than 2 MB.');
  }

  const cloudName = getCloudName();
  
  // URLSearchParams වෙනුවට native FormData පාවිච්චි කිරීමෙන් base64 string එක corrupt වීම වළකයි
  const formData = new FormData();
  formData.append('file', dataUrl);
  formData.append('upload_preset', 'easl4rum');
  formData.append('folder', `product-images/${shopId}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });

  const result = await response.json();

  if (!response.ok || !result?.secure_url || !result.public_id) {
    throw new Error(result.error?.message || 'Cloudinary did not return the uploaded product image URL and ID.');
  }

  return { imageUrl: result.secure_url, imagePublicId: result.public_id };
}

async function removeProductImage(publicId) {
  if (!publicId) return;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true
    });
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  }
}

module.exports = { removeProductImage, saveProductImage };