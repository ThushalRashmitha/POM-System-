(function () {
  const productsTable = document.getElementById('products-table');
  const overviewProducts = document.getElementById('overview-products');
  const lowStockProducts = document.getElementById('low-stock-products');
  const invoicesTable = document.getElementById('invoices-table');
  const posGrid = document.getElementById('pos-product-grid');
  const cartItems = document.getElementById('cart-items');
  const toast = document.getElementById('app-toast');
  const receiptDialog = document.getElementById('receipt-dialog');
  let products = [];
  let invoices = [];
  let cart = new Map();
  let editingProductId = null;
  let originalImageUrl = '';
  let toastTimer;
  let shopProfile = { businessName: 'APEX-R POS System', whatsapp: '' };

  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', () => {
    POS.signOut().catch((error) => notify(error.message));
  }));
  document.getElementById('share-marketplace').addEventListener('click', shareMarketplace);
  document.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => openPanel(button.dataset.panel)));
  document.querySelectorAll('[data-open-panel]').forEach((button) => button.addEventListener('click', () => openPanel(button.dataset.openPanel)));
  document.querySelectorAll('[data-report]').forEach((button) => button.addEventListener('click', () => openReport(button.dataset.report)));

  function openPanel(name) {
    document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${name}`));
    document.querySelectorAll('[data-panel]').forEach((button) => button.classList.toggle('active', button.dataset.panel === name));
    if (name === 'invoices') renderInvoices();
    if (name === 'reports') renderReports();
  }

  function openReport(name) {
    document.querySelectorAll('[data-report]').forEach((button) => button.classList.toggle('active', button.dataset.report === name));
    document.querySelectorAll('.report-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `report-${name}`));
    if (name === 'invoices') renderInvoices();
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3400);
  }

  async function shareMarketplace() {
    const shareUrl = document.getElementById('marketplace-share-link').href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${shopProfile.businessName} marketplace`, url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        notify('Marketplace link copied. Share it with your customers.');
      } else {
        throw new Error('Sharing is not available in this browser.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') notify(error.message || 'Unable to share the marketplace link.');
    }
  }

  function availability(product) {
    if (!product.available) return '<span class="stock-badge stock-none">Hidden</span>';
    if (product.stock < 1) return '<span class="stock-badge stock-none">Out of stock</span>';
    if (product.stock <= 7) return '<span class="stock-badge stock-low">Low stock</span>';
    return '<span class="stock-badge stock-ok">Available</span>';
  }

  function renderProducts() {
    productsTable.innerHTML = products.map((product) => {
      const name = POS.escapeHtml(product.name);
      return `<tr>
        <td class="table-title">${name}</td><td>${POS.formatCurrency(product.price)}</td>
        <td>${product.stock}</td><td>${availability(product)}</td>
        <td><div class="actions">
          <button class="button button-quiet button-small" data-product-edit="${product._id}">Edit</button>
          <button class="button button-quiet button-small" data-product-toggle="${product._id}">${product.available ? 'Hide' : 'Show'}</button>
          <button class="button button-danger button-small" data-product-delete="${product._id}" aria-label="Delete ${name}"><i class="fa-solid fa-trash"></i></button>
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5">No products yet. Add a product above.</td></tr>';

    overviewProducts.innerHTML = products.slice(0, 8).map((product) =>
      `<tr><td class="table-title">${POS.escapeHtml(product.name)}</td><td>${POS.formatCurrency(product.price)}</td><td>${product.stock}</td><td>${availability(product)}</td></tr>`
    ).join('') || '<tr><td colspan="4">Add products to see them here.</td></tr>';

    const low = products.filter((product) => product.stock <= 7);
    lowStockProducts.innerHTML = low.map((product) =>
      `<tr><td class="table-title">${POS.escapeHtml(product.name)}</td><td class="stock-low-value">${product.stock}</td><td>${POS.formatCurrency(product.price)}</td></tr>`
    ).join('') || '<tr><td colspan="3">No low-stock products.</td></tr>';

    document.getElementById('stat-products').textContent = products.length;
    document.getElementById('stat-low-stock').textContent = low.length;
    renderPosProducts();
    renderCart();
  }

  function renderPosProducts(filter = document.getElementById('pos-search').value) {
    const query = filter.trim().toLowerCase();
    const matches = products.filter((product) => product.name.toLowerCase().includes(query));
    posGrid.innerHTML = matches.map((product) => {
      const stock = product.stock > 0
        ? `<span class="pos-stock">${product.stock} in stock</span>`
        : '<span class="pos-stock out-of-stock">Out of stock</span>';
      const image = product.imageUrl
        ? `<img src="${POS.escapeHtml(product.imageUrl)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="pos-placeholder" hidden><i class="fa-solid fa-box"></i></span>`
        : '<span class="pos-placeholder"><i class="fa-solid fa-box"></i></span>';
      const disabled = !product.available || product.stock < 1;
      return `<button class="pos-product ${disabled ? 'unavailable' : ''}" data-pos-add="${product._id}" ${disabled ? 'disabled' : ''}>
        <span class="pos-product-image">${image}</span>
        <span class="pos-product-name">${POS.escapeHtml(product.name)}</span>
        <span class="pos-product-bottom"><strong>${POS.formatCurrency(product.price)}</strong>${stock}</span>
      </button>`;
    }).join('') || '<div class="empty-state">No matching products found.</div>';
  }

  function addToCart(productId) {
    const product = products.find((item) => item._id === productId);
    if (!product || !product.available || product.stock < 1) return;
    const quantity = cart.get(productId) || 0;
    if (quantity >= product.stock) {
      notify('You cannot add more than the available stock.');
      return;
    }
    cart.set(productId, quantity + 1);
    renderCart();
  }

  function renderCart() {
    const entries = [...cart.entries()].filter(([id]) => products.some((product) => product._id === id));
    let total = 0;
    const count = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
    cartItems.innerHTML = entries.map(([id, quantity]) => {
      const product = products.find((item) => item._id === id);
      const amount = product.price * quantity;
      total += amount;
      return `<article class="cart-item">
        <div class="cart-item-info"><strong>${POS.escapeHtml(product.name)}</strong><span>${POS.formatCurrency(product.price)} each</span></div>
        <div class="cart-item-controls">
          <button type="button" data-cart-quantity="${id}" data-delta="-1" aria-label="Decrease quantity">−</button>
          <span>${quantity}</span>
          <button type="button" data-cart-quantity="${id}" data-delta="1" aria-label="Increase quantity" ${quantity >= product.stock ? 'disabled' : ''}>+</button>
        </div>
        <strong class="cart-item-total">${POS.formatCurrency(amount)}</strong>
        <button class="cart-remove" type="button" data-cart-remove="${id}" aria-label="Remove ${POS.escapeHtml(product.name)}"><i class="fa-solid fa-trash"></i></button>
      </article>`;
    }).join('') || '<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><p>Your bill is empty.</p><span>Select a product to get started.</span></div>';
    document.getElementById('cart-item-count').textContent = count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'No items';
    document.getElementById('cart-total').textContent = POS.formatCurrency(total);
    document.getElementById('submit-bill').disabled = count === 0;
  }

  function filteredInvoices() {
    const from = document.getElementById('date-from').value;
    const to = document.getElementById('date-to').value;
    return invoices.filter((invoice) => {
      const date = new Date(invoice.soldAt);
      const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return (!from || localDate >= from) && (!to || localDate <= to);
    });
  }

  function renderInvoices() {
    const visibleInvoices = filteredInvoices();
    invoicesTable.innerHTML = visibleInvoices.map((invoice) => {
      const items = invoice.items.map((item) => `${POS.escapeHtml(item.name)} × ${item.quantity}`).join(', ');
      return `<tr><td class="table-title">${POS.escapeHtml(invoice.invoiceNumber)}</td>
        <td>${POS.escapeHtml(POS.formatDate(invoice.soldAt))}</td><td>${items}</td>
        <td class="table-title">${POS.formatCurrency(invoice.total)}</td>
        <td><div class="actions">
          <button class="button button-quiet button-small" data-invoice-view="${invoice._id}" title="View receipt"><i class="fa-regular fa-eye"></i></button>
          <button class="button button-quiet button-small" data-invoice-print="${invoice._id}" title="Print receipt"><i class="fa-solid fa-print"></i></button>
          <button class="button button-danger button-small" data-invoice-delete="${invoice._id}" title="Delete invoice and report"><i class="fa-solid fa-trash"></i></button>
        </div></td></tr>`;
    }).join('') || '<tr><td colspan="5">No invoices found for this period.</td></tr>';
    renderReports();
  }

  function renderReports() {
    const now = new Date();
    const todayKey = localDateKey(now);
    const monthKey = todayKey.slice(0, 7);
    const todayInvoices = invoices.filter((invoice) => localDateKey(new Date(invoice.soldAt)) === todayKey);
    const monthInvoices = invoices.filter((invoice) => localDateKey(new Date(invoice.soldAt)).startsWith(monthKey));
    const sum = (list) => list.reduce((total, invoice) => total + invoice.total, 0);
    document.getElementById('stat-bills-today').textContent = todayInvoices.length;
    document.getElementById('stat-bills-month').textContent = monthInvoices.length;
    document.getElementById('stat-income-today').textContent = POS.formatCurrency(sum(todayInvoices));
    document.getElementById('stat-income-month').textContent = POS.formatCurrency(sum(monthInvoices));
    document.getElementById('report-today').textContent = POS.formatCurrency(sum(todayInvoices));
    document.getElementById('report-month').textContent = POS.formatCurrency(sum(monthInvoices));
    document.getElementById('report-total').textContent = POS.formatCurrency(sum(invoices));

    const sales = new Map();
    invoices.forEach((invoice) => invoice.items.forEach((item) => {
      const previous = sales.get(item.name) || { quantity: 0, revenue: 0 };
      previous.quantity += item.quantity;
      previous.revenue += item.amount;
      sales.set(item.name, previous);
    }));
    const rows = [...sales.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([name, values]) =>
      `<tr><td class="table-title">${POS.escapeHtml(name)}</td><td>${values.quantity}</td><td class="table-title">${POS.formatCurrency(values.revenue)}</td></tr>`
    ).join('');
    document.getElementById('product-sales-table').innerHTML = rows || '<tr><td colspan="3">No product sales recorded yet.</td></tr>';
  }

  function localDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function buildReceipt(invoice) {
    const rows = invoice.items.map((item) => `<div class="receipt-item">
      <span>${POS.escapeHtml(item.name)} × ${item.quantity}</span>
      <span>${POS.formatCurrency(item.amount)}</span>
    </div>`).join('');
    document.getElementById('printable-receipt').innerHTML = `
      <div class="receipt-brand-mark"><i class="fa-solid fa-shop" aria-hidden="true"></i></div>
      <div class="receipt-shop-name">${POS.escapeHtml(shopProfile.businessName)}</div>
      ${shopProfile.whatsapp ? `<div class="receipt-contact">Contact: ${POS.escapeHtml(shopProfile.whatsapp)}</div>` : ''}
      <div class="receipt-subtitle">Sales receipt</div><div class="receipt-rule"></div>
      <div class="receipt-meta"><span>Invoice</span><strong>${POS.escapeHtml(invoice.invoiceNumber)}</strong></div>
      <div class="receipt-meta"><span>Date</span><strong>${POS.escapeHtml(POS.formatDate(invoice.soldAt))}</strong></div>
      <div class="receipt-rule"></div><div class="receipt-columns"><span>Item</span><span>Amount</span></div>
      ${rows}<div class="receipt-rule"></div><div class="receipt-grand-total"><span>TOTAL</span><strong>${POS.formatCurrency(invoice.total)}</strong></div>
      <div class="receipt-thanks">Thank you for shopping with us!</div>`;
    receiptDialog.showModal();
  }

  function exportInvoicesCsv() {
    const rows = filteredInvoices();
    const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Invoice number', 'Date', 'Items', 'Total'],
      ...rows.map((invoice) => [
        invoice.invoiceNumber,
        new Date(invoice.soldAt).toISOString(),
        invoice.items.map((item) => `${item.name} x ${item.quantity}`).join('; '),
        invoice.total
      ])
    ].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sales-invoices.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function refreshData() {
    try {
      const [productResult, invoiceResult] = await Promise.all([
        POS.api('/shop/products'), POS.api('/shop/invoices')
      ]);
      products = productResult.products;
      invoices = invoiceResult.invoices;
      renderProducts();
      renderInvoices();
    } catch (error) {
      if (error.status === 401 || error.status === 403) window.location.assign('/login.html');
      else notify(error.message);
    }
  }

  document.getElementById('pos-search').addEventListener('input', (event) => renderPosProducts(event.target.value));
  posGrid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-pos-add]');
    if (button) addToCart(button.dataset.posAdd);
  });
  cartItems.addEventListener('click', (event) => {
    const quantityButton = event.target.closest('[data-cart-quantity]');
    const removeButton = event.target.closest('[data-cart-remove]');
    if (quantityButton) {
      const id = quantityButton.dataset.cartQuantity;
      const next = (cart.get(id) || 0) + Number(quantityButton.dataset.delta);
      if (next < 1) cart.delete(id);
      else {
        const product = products.find((item) => item._id === id);
        if (product && next <= product.stock) cart.set(id, next);
      }
      renderCart();
    } else if (removeButton) {
      cart.delete(removeButton.dataset.cartRemove);
      renderCart();
    }
  });
  document.getElementById('clear-cart').addEventListener('click', () => {
    cart.clear();
    renderCart();
  });

  document.getElementById('submit-bill').addEventListener('click', async () => {
    const items = [...cart.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    if (!items.length) return;
    const submitButton = document.getElementById('submit-bill');
    const message = document.getElementById('sale-message');
    submitButton.disabled = true;
    message.classList.add('hidden');
    try {
      const result = await POS.api('/shop/invoices', { method: 'POST', body: JSON.stringify({ items }) });
      cart.clear();
      await refreshData();
      buildReceipt(result.invoice);
      POS.showNotice(message, 'Bill saved. Print the receipt or close this window to continue.', 'success');
    } catch (error) {
      POS.showNotice(message, error.message, 'error');
      submitButton.disabled = cart.size === 0;
    }
  });

  document.getElementById('product-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const imageFile = values.get('imageFile');
    const wasEditing = Boolean(editingProductId);
    try {
      const imageUrl = imageFile.size
        ? await readProductImage(imageFile)
        : (values.get('imageUrl') || (editingProductId && originalImageUrl.startsWith('data:image/')
          ? originalImageUrl : ''));
      const payload = {
        name: values.get('name'), description: values.get('description'),
        price: values.get('price'), stock: values.get('stock')
      };
      if (!wasEditing || imageFile.size || values.get('imageUrl') || !originalImageUrl.startsWith('data:image/')) {
        payload.imageUrl = imageUrl;
      }
      await POS.api(editingProductId ? `/shop/products/${editingProductId}` : '/shop/products', {
        method: editingProductId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      });
      form.reset();
      hideImagePreview();
      resetProductEdit();
      await refreshData();
      notify(wasEditing ? 'Product updated.' : 'Product added to your inventory.');
    } catch (error) {
      POS.showNotice(document.getElementById('product-message'), error.message, 'error');
    }
  });

  document.querySelector('[name="imageFile"]').addEventListener('change', async (event) => {
    const file = event.currentTarget.files[0];
    if (!file) return hideImagePreview();
    try {
      const imageUrl = await readProductImage(file);
      showImagePreview(imageUrl, file.name);
    } catch (error) {
      event.currentTarget.value = '';
      hideImagePreview();
      POS.showNotice(document.getElementById('product-message'), error.message, 'error');
    }
  });

  document.querySelector('[name="imageUrl"]').addEventListener('input', (event) => {
    if (!document.querySelector('[name="imageFile"]').files.length && event.currentTarget.value) {
      showImagePreview(event.currentTarget.value, 'Image URL preview');
    } else if (!document.querySelector('[name="imageFile"]').files.length) {
      hideImagePreview();
    }
  });

  productsTable.addEventListener('click', async (event) => {
    const edit = event.target.closest('[data-product-edit]');
    const toggle = event.target.closest('[data-product-toggle]');
    const remove = event.target.closest('[data-product-delete]');
    try {
      if (edit) {
        const product = products.find((item) => item._id === edit.dataset.productEdit);
        if (!product) return;
        editingProductId = product._id;
        const form = document.getElementById('product-form');
        for (const field of ['name', 'description', 'price', 'stock']) {
          form.elements.namedItem(field).value = product[field] ?? '';
        }
        originalImageUrl = product.imageUrl || '';
        form.elements.namedItem('imageUrl').value = originalImageUrl.startsWith('data:image/') ? '' : originalImageUrl;
        if (product.imageUrl) showImagePreview(product.imageUrl, 'Current product image');
        else hideImagePreview();
        document.getElementById('product-form-title').textContent = `Edit ${product.name}`;
        document.getElementById('product-save-button').textContent = 'Save changes';
        document.getElementById('product-cancel-edit').classList.remove('hidden');
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (toggle) {
        const product = products.find((item) => item._id === toggle.dataset.productToggle);
        await POS.api(`/shop/products/${product._id}`, {
          method: 'PATCH', body: JSON.stringify({ available: !product.available })
        });
        await refreshData();
      } else if (remove && window.confirm('Delete this product from your inventory? Existing invoices will be kept.')) {
        await POS.api(`/shop/products/${remove.dataset.productDelete}`, { method: 'DELETE' });
        await refreshData();
        notify('Product deleted.');
      }
    } catch (error) {
      notify(error.message);
    }
  });

  invoicesTable.addEventListener('click', async (event) => {
    const view = event.target.closest('[data-invoice-view]');
    const print = event.target.closest('[data-invoice-print]');
    const remove = event.target.closest('[data-invoice-delete]');
    if (view || print) {
      const id = view ? view.dataset.invoiceView : print.dataset.invoicePrint;
      const invoice = invoices.find((item) => item._id === id);
      if (!invoice) return notify('Invoice not found. Refresh and try again.');
      buildReceipt(invoice);
      if (print) setTimeout(() => window.print(), 100);
      return;
    }
    if (!remove || !window.confirm('Permanently delete this invoice and its report data?')) return;
    try {
      await POS.api(`/shop/invoices/${remove.dataset.invoiceDelete}`, { method: 'DELETE' });
      await refreshData();
      notify('Invoice and report record deleted.');
    } catch (error) {
      notify(error.message);
    }
  });

  document.getElementById('date-from').addEventListener('change', renderInvoices);
  document.getElementById('date-to').addEventListener('change', renderInvoices);
  document.getElementById('clear-invoice-filters').addEventListener('click', () => {
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    renderInvoices();
  });
  document.getElementById('export-invoices').addEventListener('click', exportInvoicesCsv);
  document.getElementById('close-receipt').addEventListener('click', () => receiptDialog.close());
  document.getElementById('print-receipt').addEventListener('click', () => window.print());
  receiptDialog.addEventListener('click', (event) => {
    if (event.target === receiptDialog) receiptDialog.close();
  });
  window.addEventListener('afterprint', () => {
    if (receiptDialog.open) receiptDialog.close();
  });

  function resetProductEdit() {
    editingProductId = null;
    originalImageUrl = '';
    document.getElementById('product-form-title').textContent = 'Add a product';
    document.getElementById('product-save-button').textContent = 'Add product';
    document.getElementById('product-cancel-edit').classList.add('hidden');
  }

  document.getElementById('product-cancel-edit').addEventListener('click', () => {
    document.getElementById('product-form').reset();
    hideImagePreview();
    resetProductEdit();
  });

  function readProductImage(file) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return Promise.reject(new Error('Choose a PNG, JPG, or WebP image.'));
    }
    if (file.size > 2 * 1024 * 1024) {
      return Promise.reject(new Error('The image must be 2 MB or smaller.'));
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result));
      reader.addEventListener('error', () => reject(new Error('Unable to read the selected image. Please try again.')));
      reader.readAsDataURL(file);
    });
  }

  function showImagePreview(src, fileName) {
    const image = document.getElementById('product-image-preview');
    image.src = src;
    document.getElementById('product-image-file-name').textContent = fileName;
    document.getElementById('product-image-preview-wrap').classList.remove('hidden');
  }

  function hideImagePreview() {
    document.getElementById('product-image-preview-wrap').classList.add('hidden');
    document.getElementById('product-image-preview').removeAttribute('src');
    document.getElementById('product-image-file-name').textContent = '';
  }

  async function start() {
    try {
      const result = await POS.api('/auth/me');
      if (result.user.role !== 'shop') return window.location.assign('/admin.html');
      shopProfile = {
        businessName: result.user.businessName?.trim() || result.user.shopName?.trim() || 'APEX-R POS System',
        whatsapp: result.user.whatsapp || ''
      };
      const businessName = shopProfile.businessName;
      document.getElementById('shop-brand').textContent = businessName;
      document.getElementById('shop-header-name').textContent = businessName;
      document.getElementById('shop-sidebar-name').textContent = businessName;
      document.getElementById('shop-email').textContent = result.user.email;
      document.getElementById('marketplace-share-link').href =
        `/marketplace.html?shop=${encodeURIComponent(result.user.id)}`;
      document.getElementById('share-marketplace').disabled = false;
      await refreshData();
    } catch {
      window.location.assign('/login.html');
    }
  }

  start();
})();
