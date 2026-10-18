(function () {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const switchLink = document.getElementById('auth-switch');
  const message = document.getElementById('auth-message');
  const registering = new URLSearchParams(window.location.search).get('mode') === 'register';

  function setMode(isRegister) {
    loginForm.classList.toggle('hidden', isRegister);
    registerForm.classList.toggle('hidden', !isRegister);
    title.textContent = isRegister ? 'Register your shop' : 'Welcome back';
    subtitle.textContent = isRegister ? 'Create your separate shop portal' : 'Sign in to your shop portal';
    switchLink.innerHTML = isRegister
      ? 'Already registered? <a href="/login.html">Sign in</a>'
      : 'New here? <a href="/login.html?mode=register">Register your shop</a>';
  }

  setMode(registering);

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.classList.add('hidden');
    const form = new FormData(loginForm);
    try {
      const result = await POS.api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
      });
      window.location.assign(result.user.role === 'platform-admin' ? '/admin.html' : '/shop.html');
    } catch (error) {
      POS.showNotice(message, error.message, 'error');
    }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.classList.add('hidden');
    const form = new FormData(registerForm);
    try {
      const result = await POS.api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          accessCode: form.get('accessCode'), // Access Code එක මෙතනින් එකතු කරන ලදී
          businessName: form.get('businessName'),
          whatsapp: form.get('whatsapp'),
          email: form.get('email'),
          password: form.get('password')
        })
      });
      window.location.assign(result.user.role === 'platform-admin' ? '/admin.html' : '/shop.html');
    } catch (error) {
      POS.showNotice(message, error.message, 'error');
    }
  });
})();