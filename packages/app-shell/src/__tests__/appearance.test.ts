import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  applyAppearance,
  configureAppearanceScope,
  getAppearance,
  initAppearance,
  setAppearance,
  updateAppearance,
} from '../appearance';

const STORAGE_KEY = 'agentic-appearance:test-app:v1';

describe('appearance preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    configureAppearanceScope('test-app');
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it('uses a light, medium, family-default appearance on first run', () => {
    expect(getAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('migrates the old Sales Copilot settings without losing the preference', () => {
    configureAppearanceScope('sales-copilot', { migrateLegacy: true });
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('colorTheme', 'forest');
    localStorage.setItem('fontSizeConfig', JSON.stringify({ chat: 'small', ui: 'large' }));

    expect(getAppearance()).toEqual({ mode: 'dark', colorTheme: 'forest', fontSize: 'large' });
  });

  it('ignores invalid saved values', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode: 'neon', colorTheme: 'x', fontSize: 'huge' }));
    expect(getAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it('applies mode, palette and font scale to the document', () => {
    applyAppearance({ mode: 'dark', colorTheme: 'berry', fontSize: 'large' });
    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.classList.contains('light')).toBe(false);
    expect(root.dataset.theme).toBe('berry');
    expect(root.style.fontSize).toBe('18px');
    expect(root.style.getPropertyValue('--scm-font-body')).toBe('1rem');
  });

  it('persists and emits a single family-wide change event', () => {
    const listener = vi.fn();
    window.addEventListener('agentic-appearance-changed', listener);

    setAppearance({ mode: 'dark', colorTheme: 'ocean', fontSize: 'small' });

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      mode: 'dark',
      colorTheme: 'ocean',
      fontSize: 'small',
    });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('agentic-appearance-changed', listener);
  });

  it('updates one property without resetting the others', () => {
    setAppearance({ mode: 'dark', colorTheme: 'ocean', fontSize: 'small' });
    expect(updateAppearance({ colorTheme: 'mono' })).toEqual({
      mode: 'dark',
      colorTheme: 'mono',
      fontSize: 'small',
    });
  });

  it('initialises before first paint and persists a migrated value', () => {
    configureAppearanceScope('sales-copilot', { migrateLegacy: true });
    localStorage.setItem('theme', 'dark');
    const initial = initAppearance();
    expect(initial.mode).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('agentic-appearance:sales-copilot:v1')).not.toBeNull();
  });

  it('isolates two apps that run on the same origin', () => {
    configureAppearanceScope('sales-copilot');
    setAppearance({ mode: 'dark', colorTheme: 'forest', fontSize: 'large' });

    configureAppearanceScope('field-service');
    expect(getAppearance()).toEqual(DEFAULT_APPEARANCE);
    setAppearance({ mode: 'light', colorTheme: 'ocean', fontSize: 'small' });

    configureAppearanceScope('sales-copilot');
    expect(getAppearance()).toEqual({ mode: 'dark', colorTheme: 'forest', fontSize: 'large' });
  });
});
