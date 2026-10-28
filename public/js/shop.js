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
  let originalImages = [];
  let previewObjectUrls = [];
  let amountsHidden = true;
  let toastTimer;
  let shopProfile = { businessName: 'APEX-R POS System', whatsapp: '' };

  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', () => {
    POS.signOut().catch((error) => notify(error.message));
  }));
  document.getElementById('privacy-toggle').addEventListener('click', () => {
    amountsHidden = !amountsHidden;
    updatePrivacyDisplay();
  });
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

  function availability(product) {
    if (!product.available) return '<span class="stock-badge stock-none">Hidden</span>';
    if (product.stock < 1) return '<span class="stock-badge stock-none">Out of stock</span>';
    if (product.stock <= 7) return '<span class="stock-badge stock-low">Low stock</span>';
    return '<span class="stock-badge stock-ok">Available</span>';
  }

  function renderProducts() {
    productsTable.innerHTML = products.map((product) => {
      const name = POS.escapeHtml(product.name);
      const costPrice = hasCostPrice(product) ? Number(product.costPrice) : null;
      const unitProfit = costPrice === null ? null : Number(product.price) - costPrice;
      return `<tr>
        <td class="table-title">${name}</td>
        <td>${costPrice === null ? '<span class="missing-cost">Add CP</span>' : privateAmountMarkup(costPrice)}</td>
        <td>${privateAmountMarkup(product.price)}</td>
        <td>${unitProfit === null ? '—' : privateAmountMarkup(unitProfit)}</td>
        <td>${product.stock}</td><td>${availability(product)}</td>
        <td><div class="actions">
          <button class="button button-quiet button-small" data-product-edit="${product._id}">Edit</button>
          <button class="button button-quiet button-small" data-product-toggle="${product._id}">${product.available ? 'Hide' : 'Show'}</button>
          <button class="button button-danger button-small" data-product-delete="${product._id}" aria-label="Delete ${name}"><i class="fa-solid fa-trash"></i></button>
        </div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7">No products yet. Add a product above.</td></tr>';

    overviewProducts.innerHTML = products.slice(0, 8).map((product) =>
      `<tr><td class="table-title">${POS.escapeHtml(product.name)}</td><td>${privateAmountMarkup(product.price)}</td><td>${product.stock}</td><td>${availability(product)}</td></tr>`
    ).join('') || '<tr><td colspan="4">Add products to see them here.</td></tr>';

    const low = products.filter((product) => product.stock <= 7);
    lowStockProducts.innerHTML = low.map((product) =>
      `<tr><td class="table-title">${POS.escapeHtml(product.name)}</td><td class="stock-low-value">${product.stock}</td><td>${privateAmountMarkup(product.price)}</td></tr>`
    ).join('') || '<tr><td colspan="3">No low-stock products.</td></tr>';

    document.getElementById('stat-products').textContent = products.length;
    document.getElementById('stat-low-stock').textContent = low.length;
    const stockValue = products.reduce((total, product) =>
      total + (Number(product.price) || 0) * (Number(product.stock) || 0), 0);
    const knownCostProducts = products.filter(hasCostPrice);
    const stockCostValue = knownCostProducts.reduce((total, product) =>
      total + Number(product.costPrice) * (Number(product.stock) || 0), 0);
    const stockProfit = knownCostProducts.reduce((total, product) =>
      total + (Number(product.price) - Number(product.costPrice)) * (Number(product.stock) || 0), 0);
    setPrivateAmount(document.getElementById('stat-stock-value'), stockValue);
    setPrivateAmount(document.getElementById('stat-stock-cost-value'), stockCostValue);
    setPrivateAmount(document.getElementById('stat-stock-profit'), stockProfit);
    updatePrivacyDisplay();
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
      const imageUrl = product.images?.[0]?.imageUrl || product.imageUrl;
      const image = imageUrl
        ? `<img src="${POS.escapeHtml(imageUrl)}" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="pos-placeholder" hidden><i class="fa-solid fa-box"></i></span>`
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
        <td class="table-title">${privateAmountMarkup(invoice.total)}</td>
        <td class="table-title">${invoice.grossProfit === null || invoice.grossProfit === undefined
    ? '<span class="missing-cost">CP not recorded</span>' : privateAmountMarkup(invoice.grossProfit)}</td>
        <td><div class="actions">
          <button class="button button-quiet button-small" data-invoice-view="${invoice._id}" title="View receipt"><i class="fa-regular fa-eye"></i></button>
          <button class="button button-quiet button-small" data-invoice-print="${invoice._id}" title="Print receipt"><i class="fa-solid fa-print"></i></button>
          <button class="button button-danger button-small" data-invoice-delete="${invoice._id}" title="Delete invoice and report"><i class="fa-solid fa-trash"></i></button>
        </div></td></tr>`;
    }).join('') || '<tr><td colspan="6">No invoices found for this period.</td></tr>';
    renderReports();
    updatePrivacyDisplay();
  }

  function renderReports() {
    const now = new Date();
    const todayKey = localDateKey(now);
    const monthKey = todayKey.slice(0, 7);
    const todayInvoices = invoices.filter((invoice) => localDateKey(new Date(invoice.soldAt)) === todayKey);
    const monthInvoices = invoices.filter((invoice) => localDateKey(new Date(invoice.soldAt)).startsWith(monthKey));
    const sum = (list) => list.reduce((total, invoice) => total + invoice.total, 0);
    const profitSum = (list) => list.reduce((total, invoice) =>
      total + (Number.isFinite(invoice.grossProfit) ? invoice.grossProfit : 0), 0);
    document.getElementById('stat-bills-today').textContent = todayInvoices.length;
    document.getElementById('stat-bills-month').textContent = monthInvoices.length;
    setPrivateAmount(document.getElementById('stat-income-today'), sum(todayInvoices));
    setPrivateAmount(document.getElementById('stat-income-month'), sum(monthInvoices));
    setPrivateAmount(document.getElementById('report-today'), sum(todayInvoices));
    setPrivateAmount(document.getElementById('report-month'), sum(monthInvoices));
    setPrivateAmount(document.getElementById('report-total'), sum(invoices));
    setPrivateAmount(document.getElementById('report-profit-today'), profitSum(todayInvoices));
    setPrivateAmount(document.getElementById('report-profit-month'), profitSum(monthInvoices));
    setPrivateAmount(document.getElementById('report-profit-total'), profitSum(invoices));

    const sales = new Map();
    invoices.forEach((invoice) => invoice.items.forEach((item) => {
      const previous = sales.get(item.name) || { quantity: 0, revenue: 0 };
      previous.quantity += item.quantity;
      previous.revenue += item.amount;
      sales.set(item.name, previous);
    }));
    const rows = [...sales.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([name, values]) =>
      `<tr><td class="table-title">${POS.escapeHtml(name)}</td><td>${values.quantity}</td><td class="table-title">${privateAmountMarkup(values.revenue)}</td></tr>`
    ).join('');
    document.getElementById('product-sales-table').innerHTML = rows || '<tr><td colspan="3">No product sales recorded yet.</td></tr>';
    updatePrivacyDisplay();
  }

  function hasCostPrice(product) {
    return product.costPrice !== undefined && product.costPrice !== null
      && Number.isFinite(Number(product.costPrice));
  }

  function privateAmountMarkup(amount) {
    const visibleAmount = POS.formatCurrency(amount);
    return `<span data-private-amount data-visible-amount="${POS.escapeHtml(visibleAmount)}">${amountsHidden ? '••••••' : visibleAmount}</span>`;
  }

  function setPrivateAmount(element, amount) {
    element.dataset.visibleAmount = POS.formatCurrency(amount);
    element.dataset.privateAmount = '';
    element.textContent = amountsHidden ? '••••••' : element.dataset.visibleAmount;
  }

  function updatePrivacyDisplay() {
    document.querySelectorAll('[data-private-amount]').forEach((element) => {
      element.textContent = amountsHidden ? '••••••' : element.dataset.visibleAmount;
    });
    const toggle = document.getElementById('privacy-toggle');
    toggle.setAttribute('aria-pressed', String(!amountsHidden));
    toggle.setAttribute('aria-label', `${amountsHidden ? 'Show' : 'Hide'} sensitive amounts`);
    toggle.innerHTML = `<i class="fa-solid ${amountsHidden ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i> ${amountsHidden ? 'Show' : 'Hide'} amounts`;
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
      ['Invoice number', 'Date', 'Items', 'Total', 'Gross profit'],
      ...rows.map((invoice) => [
        invoice.invoiceNumber,
        new Date(invoice.soldAt).toISOString(),
        invoice.items.map((item) => `${item.name} x ${item.quantity}`).join('; '),
        invoice.total,
        invoice.grossProfit ?? ''
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
    const imageFiles = [...values.getAll('imageFiles')].filter((file) => file.size > 0);
    const imageUrls = values.get('imageUrls').split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const wasEditing = Boolean(editingProductId);
    try {
      if (imageUrls.length + imageFiles.length > 4) {
        throw new Error('A product can have up to 4 images.');
      }
      for (const imageUrl of imageUrls) {
        let url;
        try {
          url = new URL(imageUrl);
        } catch {
          throw new Error('Each image URL must be a valid HTTP or HTTPS URL.');
        }
        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error('Each image URL must be a valid HTTP or HTTPS URL.');
        }
      }
      imageFiles.forEach(validateProductImage);
      const uploadedImages = await Promise.all(imageFiles.map(uploadProductImage));
      const images = [
        ...imageUrls.map((imageUrl) => ({
          imageUrl,
          imagePublicId: originalImages.find((image) => image.imageUrl === imageUrl)?.imagePublicId || ''
        })),
        ...uploadedImages
      ];
      const payload = {
        name: values.get('name'), description: values.get('description'),
        costPrice: values.get('costPrice'), price: values.get('price'), stock: values.get('stock'),
        images
      };
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

  document.querySelector('[name="imageFiles"]').addEventListener('change', (event) => {
    try {
      const files = [...event.currentTarget.files];
      files.forEach(validateProductImage);
      updateImagePreviews();
    } catch (error) {
      event.currentTarget.value = '';
      hideImagePreview();
      POS.showNotice(document.getElementById('product-message'), error.message, 'error');
    }
  });

  document.querySelector('[name="imageUrls"]').addEventListener('input', () => {
    updateImagePreviews();
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
        for (const field of ['name', 'description', 'costPrice', 'price', 'stock']) {
          form.elements.namedItem(field).value = product[field] ?? '';
        }
        originalImages = Array.isArray(product.images) && product.images.length
          ? product.images
          : (product.imageUrl ? [{ imageUrl: product.imageUrl, imagePublicId: product.imagePublicId || '' }] : []);
        form.elements.namedItem('imageUrls').value = originalImages
          .map((image) => image.imageUrl)
          .filter((imageUrl) => imageUrl && !imageUrl.startsWith('data:image/'))
          .join('\n');
        updateImagePreviews();
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
    originalImages = [];
    document.getElementById('product-form-title').textContent = 'Add a product';
    document.getElementById('product-save-button').textContent = 'Add product';
    document.getElementById('product-cancel-edit').classList.add('hidden');
  }

  document.getElementById('product-cancel-edit').addEventListener('click', () => {
    document.getElementById('product-form').reset();
    hideImagePreview();
    resetProductEdit();
  });

  async function uploadProductImage(file) {
    const signature = await POS.api('/shop/product-images/signature', {
      method: 'POST',
      body: JSON.stringify({ mimeType: file.type })
    });
    const body = new FormData();
    body.append('file', file);
    body.append('api_key', signature.apiKey);
    body.append('timestamp', signature.timestamp);
    body.append('folder', signature.folder);
    body.append('public_id', signature.public_id);
    body.append('signature', signature.signature);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, {
      method: 'POST',
      body
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error?.message || 'Unable to upload the selected image.');
    }
    return { imageUrl: result.secure_url, imagePublicId: result.public_id };
  }

  function validateProductImage(file) {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Choose a PNG, JPG, or WebP image.');
    }
  }

  function showImagePreview(src, fileName) {
    const preview = document.createElement('div');
    preview.className = 'image-preview';
    const image = document.createElement('img');
    image.src = src;
    image.alt = fileName;
    const label = document.createElement('span');
    label.textContent = fileName;
    preview.append(image, label);
    document.getElementById('product-image-preview-wrap').append(preview);
  }

  function updateImagePreviews() {
    hideImagePreview();
    const urlText = document.querySelector('[name="imageUrls"]').value;
    const imageUrls = urlText.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    imageUrls.forEach((imageUrl, index) => showImagePreview(imageUrl, `Image URL ${index + 1}`));
    for (const file of document.querySelector('[name="imageFiles"]').files) {
      const objectUrl = URL.createObjectURL(file);
      previewObjectUrls.push(objectUrl);
      showImagePreview(objectUrl, file.name);
    }
    if (document.getElementById('product-image-preview-wrap').childElementCount) {
      document.getElementById('product-image-preview-wrap').classList.remove('hidden');
    }
  }

  function hideImagePreview() {
    previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    previewObjectUrls = [];
    const preview = document.getElementById('product-image-preview-wrap');
    preview.classList.add('hidden');
    preview.replaceChildren();
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
      document.getElementById('marketplace-link').href =
        `/marketplace.html?shop=${encodeURIComponent(result.user.id)}`;
      await refreshData();
    } catch {
      window.location.assign('/login.html');
    }
  }

  start();
})();
