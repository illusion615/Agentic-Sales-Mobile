import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from '@/app.tsx';
import { initColorTheme } from '@/lib/i18n';

// Initialize theme from localStorage or default to light
const savedTheme = localStorage.getItem('theme');
const root = document.documentElement;
// Clear any existing theme classes first
root.classList.remove('dark', 'light');
if (savedTheme === 'dark') {
  root.classList.add('dark');
} else {
  root.classList.add('light');
  if (!savedTheme) {
    localStorage.setItem('theme', 'light');
  }
}

// Initialize color theme
initColorTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
