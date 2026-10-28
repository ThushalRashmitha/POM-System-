(function () {
  const grid = document.getElementById('market-grid');
  const message = document.getElementById('market-message');
  const dialog = document.getElementById('product-dialog');
  const detail = document.getElementById('product-detail');
  const search = document.getElementById('market-search');
  const shopId = new URLSearchParams(window.location.search).get('shop');
  let searchTimer;

  function renderProducts(products) {
    document.getElementById('product-count').textContent = `${products.length} ${products.length === 1 ? 'product' : 'products'} found`;
    if (!products.length) {
      grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><strong>No products found</strong>Try another search, or check back later.</div>';
      return;
    }
    grid.innerHTML = products.map((product) => {
      const imageUrl = product.images?.[0]?.imageUrl || product.imageUrl;
      const image = imageUrl
        ? `<img class="market-image" src="${POS.escapeHtml(imageUrl)}" alt="${POS.escapeHtml(product.name)}" loading="lazy">`
        : '<div class="market-image-placeholder"><i class="fa-solid fa-box-open"></i></div>';
      const stock = product.inStock
        ? `<span class="availability in-stock"><i class="fa-solid fa-circle-check"></i> In stock · ${product.stock}</span>`
        : '<span class="availability out-stock"><i class="fa-solid fa-circle-xmark"></i> Out of stock</span>';
      return `<article class="market-card" tabindex="0" role="button" data-product="${product._id}" aria-label="View ${POS.escapeHtml(product.name)}">
        ${image}<div class="market-card-body"><span class="market-shop">${POS.escapeHtml(product.shop.businessName)}</span>
        <h3>${POS.escapeHtml(product.name)}</h3><div class="market-card-foot"><strong class="market-price">${POS.formatCurrency(product.price)}</strong>${stock}</div></div></article>`;
    }).join('');
  }

  async function loadProducts() {
    try {
      const params = new URLSearchParams();
      const query = search.value.trim();
      if (query) params.set('search', query);
      if (shopId) params.set('shop', shopId);
      const suffix = params.size ? `?${params}` : '';
      const { products, shop } = await POS.api(`/marketplace/products${suffix}`);
      if (shopId) {
        const businessName = shop?.businessName || products[0]?.shop?.businessName;
        if (businessName) {
          document.getElementById('market-brand-name').textContent = businessName;
          document.title = businessName;
        }
      }
      message.classList.add('hidden');
      renderProducts(products);
    } catch (error) {
      POS.showNotice(message, error.message, 'error');
      grid.innerHTML = '';
    }
  }

  async function openProduct(id) {
    try {
      const shopQuery = shopId ? `?shop=${encodeURIComponent(shopId)}` : '';
      const { product } = await POS.api(`/marketplace/products/${encodeURIComponent(id)}${shopQuery}`);
      const images = Array.isArray(product.images) && product.images.length
        ? product.images
        : (product.imageUrl ? [{ imageUrl: product.imageUrl }] : []);
      const imageGallery = images.length
        ? `<img class="detail-image" data-gallery-main src="${POS.escapeHtml(images[0].imageUrl)}" alt="${POS.escapeHtml(product.name)}">
          ${images.length > 1 ? `<div class="detail-thumbnails" aria-label="More product photos">${images.map((image, index) =>
            `<button class="detail-thumbnail ${index === 0 ? 'active' : ''}" type="button" data-gallery-image="${POS.escapeHtml(image.imageUrl)}" aria-label="View product photo ${index + 1}" aria-pressed="${index === 0}">
              <img src="${POS.escapeHtml(image.imageUrl)}" alt="" loading="lazy">
            </button>`
          ).join('')}</div>` : ''}`
        : '<div class="market-image-placeholder detail-image"><i class="fa-solid fa-box-open"></i></div>';
      const inStock = product.stock > 0;
      const whatsapp = String(product.shop.whatsapp || '').replace(/[^\d]/g, '');
      detail.innerHTML = `${imageGallery}<p class="detail-shop">SOLD BY ${POS.escapeHtml(product.shop.businessName)}</p>
        <h2>${POS.escapeHtml(product.name)}</h2><p class="detail-price">${POS.formatCurrency(product.price)}</p>
        <p class="detail-description">${POS.escapeHtml(product.description || 'Ask the shop for more information about this product.')}</p>
        <p class="detail-stock ${inStock ? 'availability in-stock' : 'availability out-stock'}">${inStock ? `Available now · ${product.stock} in stock` : 'Currently out of stock'}</p>
        ${inStock ? `<form class="customer-form" id="order-form">
          <label>Your name<input name="customerName" autocomplete="name" maxlength="100" required placeholder="Name"></label>
          <label>Your phone number<input name="customerPhone" type="tel" autocomplete="tel" maxlength="20" required placeholder="Include country code"></label>
          <label>Quantity<input name="quantity" type="number" min="1" max="${product.stock}" value="1" required></label>
          <button class="button button-primary button-full" type="submit"><i class="fa-brands fa-whatsapp"></i> Order via WhatsApp</button>
          <small class="form-note">WhatsApp opens with your order details ready. Review and tap Send to contact the shop.</small>
        </form>` : '<p class="notice notice-info">This item cannot be ordered until it is back in stock.</p>'}`;
      dialog.showModal();
      const orderForm = document.getElementById('order-form');
      if (orderForm) {
        orderForm.addEventListener('submit', (event) => {
          event.preventDefault();
          if (!whatsapp) {
            POS.showNotice(message, 'This shop has not set a valid WhatsApp contact number yet.', 'error');
            return;
          }
          const values = new FormData(orderForm);
          const quantity = Number(values.get('quantity'));
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > product.stock) {
            POS.showNotice(message, 'The requested quantity is not available in stock.', 'error');
            dialog.close();
            return;
          }
          const orderMessage = [
            `Hello ${product.shop.businessName}, I would like to order:`,
            `Product: ${product.name}`,
            `Quantity: ${quantity}`,
            `Unit price: ${POS.formatCurrency(product.price)}`,
            `Customer: ${values.get('customerName')}`,
            `Phone: ${values.get('customerPhone')}`
          ].join('\n');
          window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(orderMessage)}`, '_blank', 'noopener,noreferrer');
        });
      }
    } catch (error) {
      POS.showNotice(message, error.message, 'error');
      await loadProducts();
    }
  }

  grid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-product]');
    if (card) openProduct(card.dataset.product);
  });
  grid.addEventListener('keydown', (event) => {
    const card = event.target.closest('[data-product]');
    if (card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      openProduct(card.dataset.product);
    }
  });
  document.getElementById('close-dialog').addEventListener('click', () => dialog.close());
  detail.addEventListener('click', (event) => {
    const thumbnail = event.target.closest('[data-gallery-image]');
    if (!thumbnail) return;
    detail.querySelector('[data-gallery-main]').src = thumbnail.dataset.galleryImage;
    detail.querySelectorAll('[data-gallery-image]').forEach((button) => {
      const selected = button === thumbnail;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.getElementById('search-button').addEventListener('click', loadProducts);
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadProducts, 250);
  });

  async function start() {
    await loadProducts();
  }

  start();
})();
