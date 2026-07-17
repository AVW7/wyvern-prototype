// The world atlas overlay: region list, selected-POI card, hover tooltip, and
// the way back to the sanctuary. Pure HTML-overlay code — it renders into
// #ui-overlay and wires the caller's handlers; it knows nothing about Phaser.
// Same shape as ui/roostPanel.js.
import { getRegion } from '../data/atlas.js';

// Marker glyphs for the POI list, mirroring the baked art in decorArt.js.
const KIND_GLYPHS = {
  whiteSpire: '⌖',
  arena: '◎',
  citadel: '⬢',
  pyramid: '▲',
  cherry: '❀',
  sanctum: '◉',
  jungleRuin: '⛩',
  outpost: '⌂',
  frosthold: '⛰',
};

/**
 * Renders the atlas overlay.
 *
 * @param {object} opts
 * @param {object[]} opts.regions           REGIONS from data/atlas.js
 * @param {object[]} opts.pois              POIS from data/atlas.js
 * @param {boolean}  opts.collapsed         panel collapsed to a pill?
 * @param {?number}  opts.selectedRegionId  filtered region, or null for all
 * @param {?object}  opts.selectedPoi       POI shown in the detail card
 * @param {Function} opts.onSelectRegion    (regionId) region row clicked
 * @param {Function} opts.onSelectPoi       (poiId) POI row clicked
 * @param {Function} opts.onClearPoi        detail card ✕ clicked
 * @param {Function} opts.onCollapse        hide-panel ✕ clicked
 * @param {Function} opts.onExpand          collapsed pill clicked
 * @param {Function} opts.onBack            back-to-sanctuary clicked
 * @param {Function} opts.onLaunch          (poiId) Launch Mission clicked
 */
export function buildAtlasOverlay({
  regions, pois, collapsed, selectedRegionId, selectedPoi,
  onSelectRegion, onSelectPoi, onClearPoi, onCollapse, onExpand, onBack, onLaunch,
}) {
  const overlay = document.getElementById('ui-overlay');
  const listed = selectedRegionId === null
    ? pois
    : pois.filter((p) => p.regionId === selectedRegionId);
  const found = pois.filter((p) => p.discovered).length;
  const backButton = '<button id="btn-atlas-back" class="btn-view">🏝️ Back to Sanctuary</button>';

  // Collapsed, the panel is a pill and the map gets the whole canvas — the
  // uninterrupted view of the world.
  if (collapsed) {
    overlay.innerHTML = `
      <button id="btn-expand" class="panel-pill">🗺️ Atlas</button>
      ${selectedPoi ? renderPoiCard(selectedPoi) : ''}
      ${backButton}`;
    document.getElementById('btn-expand').onclick = onExpand;
    document.getElementById('btn-atlas-back').onclick = onBack;
    if (selectedPoi) {
      document.getElementById('btn-poi-close').onclick = onClearPoi;
      document.getElementById('btn-poi-launch').onclick = () => onLaunch(selectedPoi.id);
    }
    return;
  }

  overlay.innerHTML = `
    <div class="panel atlas-panel">
      <div class="panel-header">
        <button id="btn-collapse" class="panel-hide" title="Hide panel">✕</button>
        <h1>World Atlas</h1>
        <p class="subtitle">The Shattered Cradle &middot; ${found}/${pois.length} sites found</p>
      </div>
      <h2>Regions</h2>
      <ul class="atlas-regions">${regions.map((r) => renderRegion(r, selectedRegionId)).join('')}</ul>
      <h2>Destinations <span class="roster-count">${listed.length}</span></h2>
      <ul class="atlas-pois">${listed.map((p) => renderPoiRow(p, selectedPoi)).join('')}</ul>
    </div>
    ${selectedPoi ? renderPoiCard(selectedPoi) : ''}
    ${backButton}`;

  document.getElementById('btn-atlas-back').onclick = onBack;
  document.getElementById('btn-collapse').onclick = onCollapse;

  overlay.querySelectorAll('.atlas-region').forEach((el) => {
    el.onclick = () => onSelectRegion(Number(el.dataset.region));
  });
  overlay.querySelectorAll('.atlas-poi').forEach((el) => {
    el.onclick = () => onSelectPoi(el.dataset.poi);
  });

  if (selectedPoi) {
    document.getElementById('btn-poi-close').onclick = onClearPoi;
    document.getElementById('btn-poi-launch').onclick = () => onLaunch(selectedPoi.id);
  }
}

function renderRegion(region, selectedRegionId) {
  const active = region.id === selectedRegionId ? ' is-active' : '';
  return `
    <li>
      <button class="atlas-region${active}" data-region="${region.id}">
        <span class="region-swatch" style="background:${region.color}"></span>
        <span class="region-info">
          <span class="region-name">${region.name}</span>
          <span class="region-type">${region.type}</span>
        </span>
        <span class="region-explored">
          ${region.explored}%
          <span class="explored-bar">
            <span class="explored-fill" style="width:${region.explored}%;background:${region.color}"></span>
          </span>
        </span>
      </button>
    </li>`;
}

function renderPoiRow(poi, selectedPoi) {
  const active = poi.id === selectedPoi?.id ? ' is-active' : '';
  const unknown = poi.discovered ? '' : ' is-unknown';
  return `
    <li>
      <button class="atlas-poi${active}${unknown}" data-poi="${poi.id}">
        <span class="poi-glyph">${KIND_GLYPHS[poi.kind] ?? '⬢'}</span>
        <span class="poi-info">
          <span class="poi-name">${poi.name}${poi.discovered ? '' : ' <em>?</em>'}</span>
          <span class="poi-meta">${getRegion(poi.regionId)?.name ?? ''} &middot; danger ${poi.danger}/5</span>
        </span>
      </button>
    </li>`;
}

function renderPoiCard(poi) {
  const region = getRegion(poi.regionId);
  const status = poi.discovered
    ? '<span class="tag tag-found">Discovered</span>'
    : '<span class="tag tag-unknown">Unvisited</span>';
  return `
    <div class="panel poi-card">
      <button id="btn-poi-close" class="panel-hide" title="Close">✕</button>
      <div class="poi-card-head">
        <span class="poi-glyph big">${KIND_GLYPHS[poi.kind] ?? '⬢'}</span>
        <div>
          <h1>${poi.name}</h1>
          <div class="poi-tags">
            ${status}
            <span class="tag">Danger ${poi.danger}/5</span>
            <span class="tag">
              <span class="region-swatch small" style="background:${region?.color ?? '#888'}"></span>
              ${region?.name ?? ''}
            </span>
          </div>
        </div>
      </div>
      <p class="poi-lore">${poi.lore}</p>
      <button id="btn-poi-launch" class="btn-primary"><span class="btn-icon">⚔️</span>Launch Mission</button>
    </div>`;
}

// The hover readout. Lives outside the panel HTML so moving the pointer never
// re-renders the panel — it just nudges one absolutely-positioned node.
// Pass null to hide it.
export function setAtlasTooltip(info) {
  let el = document.getElementById('atlas-tooltip');
  if (!info) {
    if (el) el.style.display = 'none';
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = 'atlas-tooltip';
    document.body.appendChild(el);
  }
  el.textContent = info.text;
  el.style.display = 'block';
  // Flip to the other side of the cursor rather than run off the edge — the
  // readout sits at the pointer, and the pointer reaches the window's corners.
  const box = el.getBoundingClientRect();
  const x = info.x + box.width > window.innerWidth ? info.x - box.width - 28 : info.x;
  const y = info.y + box.height > window.innerHeight ? info.y - box.height - 28 : info.y;
  el.style.left = `${Math.max(0, x)}px`;
  el.style.top = `${Math.max(0, y)}px`;
}
