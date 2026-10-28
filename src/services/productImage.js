const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2 MB

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

  const resolvedMimeType = mimeType || 'image/jpeg';
  return `data:${resolvedMimeType};base64,${buffer.toString('base64')}`;
}

async function saveProductImage(shopId, imageSource, mimeType) {
  const dataUrl = normalizeImageSource(imageSource, mimeType);
  
  const base64Data = dataUrl.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Product image must be no larger than 2 MB.');
  }

  return { imageUrl: dataUrl, imagePublicId: null };
}

async function removeProductImage(publicId) {
  return;
}

module.exports = { removeProductImage, saveProductImage };
