/**
 * uiKit.js
 * 
 * Shared UI components for the floating UI overlay.
 * Must be pure DOM string helpers with NO Phaser/scene references.
 */

/**
 * Creates the Floating Nav Island.
 * @param {Array<{label: string, icon: string, onClick: Function, primary: boolean, className: string}>} buttons 
 * @returns {HTMLElement}
 */
export function createNavIsland(buttons) {
  const island = document.createElement('div');
  island.className = 'nav-island';
  
  buttons.forEach(({ label, icon, onClick, primary, className = '' }) => {
    const btn = document.createElement('button');
    if (primary) {
      btn.classList.add('btn-primary');
    }
    if (className) {
      btn.className += ` ${className}`;
    }
    
    if (icon) {
      const i = document.createElement('span');
      i.className = 'btn-icon';
      i.textContent = icon;
      btn.appendChild(i);
    }
    
    if (label) {
      const span = document.createElement('span');
      span.textContent = label;
      btn.appendChild(span);
    }
    
    if (onClick) {
      btn.addEventListener('click', onClick);
    }
    
    island.appendChild(btn);
  });
  
  return island;
}
