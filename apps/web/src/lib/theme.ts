// Tema: sama dengan mockup (data-theme di <html>, disimpan di localStorage 'cmTheme').
export function isDarkTheme(): boolean {
  const theme = document.documentElement.dataset['theme'];
  return theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme:dark)').matches);
}

export function restoreTheme(): void {
  try {
    const saved = localStorage.getItem('cmTheme');
    if (saved === 'dark' || saved === 'light') document.documentElement.dataset['theme'] = saved;
  } catch {
    /* localStorage tidak tersedia: pakai tema sistem */
  }
}

export function toggleTheme(): void {
  const root = document.documentElement;
  root.dataset['theme'] = isDarkTheme() ? 'light' : 'dark';
  try {
    localStorage.setItem('cmTheme', root.dataset['theme']);
  } catch {
    /* abaikan */
  }
}
