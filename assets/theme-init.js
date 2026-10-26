try {
  const storedTheme = localStorage.getItem('w-rookie-theme');
  const initialTheme = storedTheme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.style.colorScheme = initialTheme;
} catch (_) {
  document.documentElement.dataset.theme = 'dark';
}
