import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createNavIsland } from './uiKit.js';

describe('uiKit.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('createNavIsland should create a div with nav-island class', () => {
    const island = createNavIsland([]);
    expect(island.tagName).toBe('DIV');
    expect(island.className).toBe('nav-island');
  });

  it('createNavIsland should create buttons with specified properties', () => {
    let clicked = false;
    const island = createNavIsland([
      { label: 'Test', onClick: () => { clicked = true; }, primary: true, icon: 'X' }
    ]);
    
    const btn = island.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn.classList.contains('btn-primary')).toBe(true);
    const iconSpan = btn.querySelector('.btn-icon');
    expect(iconSpan).not.toBeNull();
    expect(iconSpan.textContent).toBe('X');
    expect(btn.textContent).toContain('Test');
    
    btn.click();
    expect(clicked).toBe(true);
  });
});
