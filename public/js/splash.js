(function () {
  const splash = document.getElementById('app-splash');
  if (!splash) return;

  const finish = () => splash.remove();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }

  splash.addEventListener('animationend', (event) => {
    if (event.animationName === 'splash-exit') finish();
  });
  window.setTimeout(finish, 2300);
})();
