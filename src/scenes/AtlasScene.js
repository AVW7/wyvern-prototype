// AtlasScene: the world atlas — the overworld map of the Shattered Cradle and
// the game's mission select. The fourth playable layer, and like the other
// three it shares no scene code with them: it keeps its own tile placement and
// its own camera, and reaches only for the low-level systems everything shares
// (iso / textureBake / atlasWorld).
//
// Flow: Base -> Atlas -> Mission -> Base. Clicking a POI launches a mission
// seeded from that POI, which is what makes each destination its own island.
import { GAME, ISO, ATLAS } from '../config.js';
import { gridToScreen, screenToGrid, sortByDepth } from '../systems/iso.js';
import { buildAtlasWorld, worldToCell, ATLAS_BASE_HEIGHT } from '../systems/atlasWorld.js';
import { ensureTileTexture, ensureDecorTexture } from '../systems/textureBake.js';
import { DECOR_BOX } from '../systems/decorArt.js';
import { REGIONS, POIS, getRegion } from '../data/atlas.js';
import { buildAtlasOverlay, setAtlasTooltip } from '../ui/atlasPanel.js';
import { KeyboardAction, addActionKeys, isActionDown } from '../input/keyboardActions.js';

// How far a pointer may travel between press and release and still count as a
// click rather than a drag. Stops a pan that ends over a POI from selecting it.
const CLICK_SLOP = 6;

export default class AtlasScene extends Phaser.Scene {
  constructor() {
    super('Atlas');
  }

  create() {
    // Fresh state each visit — the scene restarts when a mission returns here.
    this.selectedRegionId = null;
    this.selectedPoiId = null;
    this.panelCollapsed = false;
    this.tileSprites = [];
    this.poiSprites = [];
    this.pan = { active: false, lastX: 0, lastY: 0, vx: 0, vy: 0, movedBy: 0 };

    // The sea beyond the grid. Matched to the ocean tiles' own tone so the
    // grid's edge doesn't read as a hard diamond horizon — the camera frames
    // the island, so what's left over should just look like more water.
    this.cameras.main.setBackgroundColor('#102c4c');

    this.layer = this.add.layer();
    this.world = buildAtlasWorld();

    this.placeTiles();
    this.placePois();
    sortByDepth(this.layer); // Once: nothing on the atlas moves.

    // The world never changes once built, so measure it once. `land` frames
    // the camera; `all` (island + open sea) bounds the panning.
    this.bounds = { land: this.tileBounds(true), all: this.tileBounds(false) };
    this.fitCamera();
    this.setupInput();
    this.buildOverlay();
  }

  // ---- Building the map --------------------------------------------------

  // Same placement contract as the other layers: every tile texture puts its
  // top face's top vertex at local y=0, so a tile of any height anchors with
  // origin (0.5, 0), and sorting is by ground-plane footprint rather than by
  // the lifted art.
  placeTiles() {
    const { tiles, rows, cols } = this.world;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = tiles[row][col];
        const { x, y } = gridToScreen(col, row);
        const lift = (cell.height - ATLAS_BASE_HEIGHT) * ISO.elevation;

        const key = ensureTileTexture(this.textures, cell.biome, cell.variant, cell.height);
        const tile = this.add.image(x, y - lift, key);
        tile.setOrigin(0.5, 0);
        tile.setData('depth', y + ISO.tileHeight / 2);
        tile.setData('seaFade', this.seaFadeAlpha(cell));
        tile.setAlpha(tile.getData('seaFade'));
        this.layer.add(tile);
        this.tileSprites.push({ sprite: tile, regionId: cell.regionId });

        if (cell.decor) this.placeDecor(cell, x, y - lift);
      }
    }
  }

  // Opacity for one tile, fading the open sea out toward the grid's edge so
  // the water dissolves into the matching camera background instead of ending
  // on a hard diamond horizon. Land never fades. Measured on the larger of
  // |wx|/|wy| because that traces the grid's own square boundary, so the fade
  // runs parallel to the edge it's hiding.
  seaFadeAlpha(cell) {
    if (cell.biome !== 'ocean') return 1;
    const edge = Math.max(Math.abs(cell.wx), Math.abs(cell.wy));
    const start = ATLAS.cols / 2 - ATLAS.seaFade;
    return Phaser.Math.Clamp(1 - (edge - start) / ATLAS.seaFade, 0, 1);
  }

  placeDecor(cell, tileX, tileTopY) {
    const { decor } = cell;
    const baseX = tileX + decor.offsetX;
    const baseY = tileTopY + ISO.tileHeight / 2 + decor.offsetY;
    const key = ensureDecorTexture(this.textures, cell.biome, decor.type, decor.variant);
    const sprite = this.add.image(baseX, baseY, key);
    sprite.setOrigin(DECOR_BOX.baseX / DECOR_BOX.width, DECOR_BOX.baseY / DECOR_BOX.height);
    sprite.setData('depth', baseY + (cell.height - ATLAS_BASE_HEIGHT) * ISO.elevation + 1);
    this.layer.add(sprite);
    this.tileSprites.push({ sprite, regionId: cell.regionId });
  }

  // POI markers are hand-placed from data/atlas.js rather than rolled from a
  // biome's decor list — the same way the vault's props are placed by hand.
  placePois() {
    POIS.forEach((poi) => {
      const { col, row } = worldToCell(poi.x, poi.y);
      const cell = this.world.tiles[row]?.[col];
      if (!cell) return;

      const { x, y } = gridToScreen(col, row);
      // Stand the marker on the tile's top face, so POIs on peaks sit on the
      // peak instead of floating at the ground plane.
      const baseY = y - (cell.height - ATLAS_BASE_HEIGHT) * ISO.elevation + ISO.tileHeight / 2;
      const key = ensureDecorTexture(this.textures, cell.biome, poi.kind, 0);

      const sprite = this.add.image(x, baseY, key);
      sprite.setOrigin(DECOR_BOX.baseX / DECOR_BOX.width, DECOR_BOX.baseY / DECOR_BOX.height);
      sprite.setData('depth', baseY + 2); // Above its own tile and any prop.
      // Undiscovered sites are drawn as faint rumours on the map.
      sprite.setAlpha(poi.discovered ? 1 : 0.45);
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', (pointer) => {
        if (pointer.leftButtonDown()) this.pendingPoiId = poi.id;
      });
      this.layer.add(sprite);
      this.poiSprites.push({ poi, sprite });
    });
  }

  // ---- Camera ------------------------------------------------------------

  // The atlas opens on the whole island: it's a world map, so the default
  // view is the one that shows the shape of the world. Same fit math the
  // sanctuary uses (see buildSanctuaryView) — zoom out until the map fits
  // beside the panel, then look at its middle.
  // Frames the ISLAND, not the grid. A world map should fill the frame with
  // world, not with empty sea — and letting the ocean run off every edge is
  // what makes it read as open water rather than as a tile grid with visible
  // corners. Re-run when the panel collapses, since that changes how much of
  // the canvas the map has to itself.
  fitCamera() {
    const cam = this.cameras.main;
    const { land, all: b } = this.bounds;
    const { cameraMargin, panMargin } = ATLAS;
    // A collapsed panel gives the map the whole canvas.
    const panelBias = this.panelCollapsed ? 0 : ATLAS.panelBias;
    const mapW = b.maxX - b.minX;
    const mapH = b.maxY - b.minY;

    const fit = Math.min(
      ATLAS.zoom.max,
      (GAME.width - cameraMargin * 2 - panelBias) / (land.maxX - land.minX),
      (GAME.height - cameraMargin * 2) / (land.maxY - land.minY),
    );
    // Nothing past the whole island is worth pulling back to, so the fit is
    // also the zoom-out floor.
    this.minZoom = fit;

    // Bounds clamp panning, so there's no manual edge math in update(). They
    // must also be wide enough to hold the fitted view PLUS the bias: Phaser
    // force-centers the camera on its bounds whenever the view is wider than
    // they are, which silently discards centerOn() and parks the island's
    // west lobes behind the panel. Vertically it still centers, which is
    // exactly what we want.
    const biasWorld = panelBias / fit;
    const padX = panMargin + biasWorld;
    cam.setBounds(b.minX - padX, b.minY - panMargin, mapW + padX * 2, mapH + panMargin * 2);

    cam.setZoom(fit);
    cam.centerOn((land.minX + land.maxX) / 2 - biasWorld / 2, (land.minY + land.maxY) / 2);
  }

  /**
   * Projected bounding box of placed tiles, including lifted top faces and
   * the sidewalls hanging below the ground plane. Measured from the real
   * heights rather than assumed, since it drives the camera fit.
   *
   * @param {boolean} landOnly  skip ocean — the island's box, not the grid's.
   */
  tileBounds(landOnly) {
    const { tiles, rows, cols } = this.world;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = tiles[row][col];
        if (landOnly && cell.biome === 'ocean') continue;
        const { x, y } = gridToScreen(col, row);
        const lift = (cell.height - ATLAS_BASE_HEIGHT) * ISO.elevation;
        minX = Math.min(minX, x - ISO.tileWidth / 2);
        maxX = Math.max(maxX, x + ISO.tileWidth / 2);
        minY = Math.min(minY, y - lift);
        maxY = Math.max(maxY, (y - lift) + ISO.tileHeight + cell.height * ISO.elevation);
      }
    }
    return { minX, maxX, minY, maxY };
  }

  // ---- Input -------------------------------------------------------------

  setupInput() {
    this.input.mouse.disableContextMenu(); // Right-drag is a pan, not a menu.
    this.panModifierKeys = addActionKeys(this.input.keyboard, KeyboardAction.AtlasCameraPanModifier);

    this.input.on('pointerdown', (pointer, currentlyOver) => {
      // Left-press on a POI selects it; anything else starts a pan. Right and
      // middle always pan, even over a marker.
      const overPoi = currentlyOver.length > 0;
      const forcePan = pointer.rightButtonDown() || pointer.middleButtonDown()
        || isActionDown(this.panModifierKeys);
      if (forcePan || !overPoi) this.beginPan(pointer);
    });

    this.input.on('pointermove', (pointer) => {
      if (this.pan.active) this.dragPan(pointer);
      else this.updateHover(pointer);
    });

    this.input.on('pointerup', () => {
      this.pan.active = false;
      // A press that barely moved is a click: honour a POI selection. A press
      // that panned is not, even if it started on a marker.
      if (this.pendingPoiId && this.pan.movedBy <= CLICK_SLOP) {
        this.selectPoi(this.pendingPoiId);
      }
      this.pendingPoiId = null;
    });

    this.input.on('wheel', (pointer, objects, deltaX, deltaY) => {
      this.zoomAt(pointer, deltaY < 0 ? ATLAS.zoom.step : 1 / ATLAS.zoom.step);
    });
  }

  beginPan(pointer) {
    this.pan.active = true;
    this.pan.lastX = pointer.x;
    this.pan.lastY = pointer.y;
    this.pan.vx = 0;
    this.pan.vy = 0;
    this.pan.movedBy = 0;
    setAtlasTooltip(null);
  }

  dragPan(pointer) {
    const cam = this.cameras.main;
    const dx = pointer.x - this.pan.lastX;
    const dy = pointer.y - this.pan.lastY;
    // Divide by zoom so a drag moves the map under the cursor 1:1 on screen
    // however far in or out we are.
    cam.scrollX -= dx / cam.zoom;
    cam.scrollY -= dy / cam.zoom;
    this.pan.vx = dx;
    this.pan.vy = dy;
    this.pan.movedBy += Math.abs(dx) + Math.abs(dy);
    this.pan.lastX = pointer.x;
    this.pan.lastY = pointer.y;
  }

  // Zoom toward the cursor: keep whatever world point is under the pointer
  // pinned there, so the map grows around what you're looking at rather than
  // around the screen center.
  zoomAt(pointer, factor) {
    const cam = this.cameras.main;
    const before = cam.getWorldPoint(pointer.x, pointer.y);
    cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, this.minZoom, ATLAS.zoom.max));
    const after = cam.getWorldPoint(pointer.x, pointer.y);
    cam.scrollX += before.x - after.x;
    cam.scrollY += before.y - after.y;
  }

  // Reads the cell under the pointer for the hover tooltip. Hit-tests against
  // the flat ground plane rather than the lifted art — close enough for a
  // readout, and it avoids a per-cell search on every mouse move.
  updateHover(pointer) {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const { col, row } = screenToGrid(world.x, world.y);
    const cell = this.world.tiles[row]?.[col];
    if (!cell) {
      setAtlasTooltip(null);
      return;
    }
    const region = getRegion(cell.regionId);
    const place = cell.biome === 'ocean' ? 'Open Water' : region?.name ?? cell.biome;
    setAtlasTooltip({
      text: `${cell.wx.toFixed(0)},${cell.wy.toFixed(0)} • ${place} • elev ${cell.height}`,
      x: pointer.event.clientX + 14,
      y: pointer.event.clientY + 14,
    });
  }

  update() {
    // Pan momentum: keep gliding after the pointer lifts, easing to a stop.
    const { pan } = this;
    if (pan.active || (pan.vx === 0 && pan.vy === 0)) return;
    const cam = this.cameras.main;
    cam.scrollX -= pan.vx / cam.zoom;
    cam.scrollY -= pan.vy / cam.zoom;
    pan.vx *= ATLAS.panDamping;
    pan.vy *= ATLAS.panDamping;
    if (Math.abs(pan.vx) < ATLAS.panEpsilon) pan.vx = 0;
    if (Math.abs(pan.vy) < ATLAS.panEpsilon) pan.vy = 0;
  }

  // ---- Selection + overlay ----------------------------------------------

  selectPoi(poiId) {
    const poi = POIS.find((p) => p.id === poiId);
    if (!poi) return;
    this.selectedPoiId = poiId;
    this.selectedRegionId = poi.regionId;
    this.applyRegionFilter();
    this.buildOverlay();
  }

  selectRegion(regionId) {
    // Clicking the selected region again clears the filter.
    this.selectedRegionId = this.selectedRegionId === regionId ? null : regionId;
    this.selectedPoiId = null;
    this.applyRegionFilter();
    this.buildOverlay();
  }

  // Dims everything outside the selected region so it reads as the focus.
  applyRegionFilter() {
    const id = this.selectedRegionId;
    this.tileSprites.forEach(({ sprite, regionId }) => {
      // Dim relative to the tile's own base opacity, so filtering a region
      // doesn't punch the faded outer sea back to full strength.
      const base = sprite.getData('seaFade') ?? 1;
      sprite.setAlpha(id === null || regionId === id ? base : base * 0.35);
    });
    this.poiSprites.forEach(({ poi, sprite }) => {
      const base = poi.discovered ? 1 : 0.45;
      sprite.setAlpha(id === null || poi.regionId === id ? base : base * 0.35);
    });
  }

  buildOverlay() {
    buildAtlasOverlay({
      regions: REGIONS,
      pois: POIS,
      collapsed: this.panelCollapsed,
      selectedRegionId: this.selectedRegionId,
      selectedPoi: POIS.find((p) => p.id === this.selectedPoiId) ?? null,
      onSelectRegion: (id) => this.selectRegion(id),
      onSelectPoi: (id) => this.selectPoi(id),
      onClearPoi: () => { this.selectedPoiId = null; this.buildOverlay(); },
      onCollapse: () => this.setPanelCollapsed(true),
      onExpand: () => this.setPanelCollapsed(false),
      onBack: () => this.returnToBase(),
      onLaunch: (id) => this.launchMission(id),
    });
  }

  // Hiding the panel hands the map the rest of the canvas, so re-frame the
  // island to use it. This deliberately re-fits rather than preserving a
  // zoomed-in view: collapsing the panel is a "show me the whole world" action.
  setPanelCollapsed(collapsed) {
    this.panelCollapsed = collapsed;
    this.pan.vx = 0;
    this.pan.vy = 0;
    this.fitCamera();
    this.buildOverlay();
  }

  returnToBase() {
    setAtlasTooltip(null);
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Base');
  }

  // The POI's own seed is what makes its mission a distinct island — without
  // it every destination would rebuild the same TERRAIN.seed map.
  launchMission(poiId) {
    const poi = POIS.find((p) => p.id === poiId);
    if (!poi) return;
    setAtlasTooltip(null);
    document.getElementById('ui-overlay').innerHTML = '';
    this.scene.start('Mission', { missionId: poi.id, seed: poi.seed });
  }
}
