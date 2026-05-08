import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from '@/app.tsx';
import { initColorTheme } from '@/lib/i18n';

// Initialize theme from localStorage or default to dark
const savedTheme = localStorage.getItem('theme');
const root = document.documentElement;
// Clear any existing theme classes first
root.classList.remove('dark', 'light');
if (savedTheme === 'light') {
  root.classList.add('light');
} else {
  root.classList.add('dark');
  if (!savedTheme) {
    localStorage.setItem('theme', 'dark');
  }
}

// Initialize color theme
initColorTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
