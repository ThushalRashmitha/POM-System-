(function () {
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  async function api(path, options = {}) {
    const response = await fetch(path.startsWith('/api/') ? path : `/api${path}`, {
      ...options,
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function showNotice(element, message, kind = 'info') {
    element.textContent = message;
    element.className = `notice notice-${kind}`;
  }

  function formatCurrency(value) {
    return `Rs. ${Number(value || 0).toLocaleString('en-LK', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    })}`;
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat('en-LK', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(new Date(value));
  }

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    window.location.assign('/login.html');
  }

  window.POS = { api, escapeHtml, formatCurrency, formatDate, showNotice, signOut };
})();
