// Apply a remembered Light or Dark theme before first paint (see src/theme.ts). A file rather
// than an inline script, so the desktop app's content security policy can forbid inline scripts.
try {
  const theme = localStorage.getItem('modelwright.theme');
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  }
} catch {
  // Storage unavailable: the system theme applies.
}
