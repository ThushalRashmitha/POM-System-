(function () {
  const table = document.getElementById('shops-table');
  const message = document.getElementById('admin-message');
  const toast = document.getElementById('app-toast');
  let toastTimer;

  document.querySelectorAll('[data-logout]').forEach((button) => button.addEventListener('click', () => {
    POS.signOut().catch((error) => showToast(error.message));
  }));
  document.getElementById('refresh-shops').addEventListener('click', loadShops);

  function showToast(text) {
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  async function loadShops() {
    try {
      const { shops } = await POS.api('/admin/shops');
      table.innerHTML = shops.map((shop) => {
        const active = shop.subscriptionStatus === 'active';
        return `<tr>
          <td class="table-title">${POS.escapeHtml(shop.businessName)}</td>
          <td>${POS.escapeHtml(shop.email)}<br><span class="user-label">${POS.escapeHtml(shop.whatsapp || '')}</span></td>
          <td>${shop.productCount}</td><td>${shop.invoiceCount}</td>
          <td><span class="status-badge ${active ? 'status-active' : 'status-suspended'}">${active ? 'Access active' : 'Suspended · payment due'}</span></td>
          <td><span class="status-badge ${shop.marketplaceEnabled ? 'status-active' : 'status-suspended'}">${shop.marketplaceEnabled ? 'Visible' : 'Hidden'}</span></td>
          <td><div class="actions">
            <button class="button ${active ? 'button-quiet' : 'button-success'} button-small" data-payment="${shop._id}" data-active="${active}">${active ? 'Suspend access' : 'Restore access'}</button>
            <button class="button button-quiet button-small" data-marketplace="${shop._id}" data-enabled="${shop.marketplaceEnabled}">${shop.marketplaceEnabled ? 'Hide shop' : 'Show shop'}</button>
            <button class="button button-danger button-small" data-shop-delete="${shop._id}" aria-label="Delete shop"><i class="fa-solid fa-trash"></i></button>
          </div></td>
        </tr>`;
      }).join('') || '<tr><td colspan="7">No registered shops.</td></tr>';
    } catch (error) {
      if (error.status === 401 || error.status === 403) window.location.assign('/login.html');
      else POS.showNotice(message, error.message, 'error');
    }
  }

  table.addEventListener('click', async (event) => {
    const paymentButton = event.target.closest('[data-payment]');
    const marketplaceButton = event.target.closest('[data-marketplace]');
    const deleteButton = event.target.closest('[data-shop-delete]');
    try {
      if (paymentButton) {
        const active = paymentButton.dataset.active === 'true';
        const action = active ? 'suspend access to' : 'restore access to';
        if (!window.confirm(`Are you sure you want to ${action} this shop?`)) return;
        await POS.api(`/admin/shops/${paymentButton.dataset.payment}`, {
          method: 'PATCH',
          body: JSON.stringify({ subscriptionStatus: active ? 'suspended' : 'active' })
        });
        showToast(active ? 'Shop suspended. Its next request will be signed out.' : 'Shop access restored.');
      } else if (marketplaceButton) {
        await POS.api(`/admin/shops/${marketplaceButton.dataset.marketplace}`, {
          method: 'PATCH',
          body: JSON.stringify({ marketplaceEnabled: marketplaceButton.dataset.enabled !== 'true' })
        });
        showToast('Marketplace visibility updated.');
      } else if (deleteButton) {
        if (!window.confirm('Permanently delete this shop account, all its products and all invoices? This cannot be undone.')) return;
        await POS.api(`/admin/shops/${deleteButton.dataset.shopDelete}`, { method: 'DELETE' });
        showToast('Shop and its data deleted.');
      } else {
        return;
      }
      message.classList.add('hidden');
      await loadShops();
    } catch (error) {
      POS.showNotice(message, error.message, 'error');
    }
  });

  async function start() {
    try {
      const result = await POS.api('/auth/me');
      if (result.user.role !== 'platform-admin') return window.location.assign('/shop.html');
      document.getElementById('admin-email').textContent = result.user.email;
      await loadShops();
    } catch {
      window.location.assign('/login.html');
    }
  }

  start();
})();
