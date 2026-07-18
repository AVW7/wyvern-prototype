// MissionScene: the isometric action layer. Renders the iso background grid,
// spawns the sprite wyvern, and depth-sorts everything each frame so sprites
// correctly overlap tiles in front of / behind them.
import {
  ISO, TERRAIN, COMBAT, DEMO_ENEMY_SPAWNS, WYVERN_ORDERS, ORDER_EFFECTS,
} from '../config.js';
import { gridToScreen, sortByDepth } from '../systems/iso.js';
import { buildTerrain } from '../systems/terrain.js';
import {
  ensureTileTexture, ensureDecorTexture, ensureBackdropTexture,
} from '../systems/textureBake.js';
import { DECOR_BOX } from '../systems/decorArt.js';
import Wyvern from '../entities/Wyvern.js';
import Enemy from '../entities/Enemy.js';
import { getAnimal } from '../systems/roster.js';

// Cell the wyvern starts on. Kept here (not inline) because the terrain builder
// also needs it, to flatten the spawn tile and keep it clear of props.
const WYVERN_START = { col: 8, row: 8 };

export default class MissionScene extends Phaser.Scene {
  constructor() {
    super('Mission');
  }

  init(data) {
    this.missionId = data.missionId || 'mission01';
    // The atlas passes the chosen POI's seed; that's what makes each
    // destination its own island. Falling back to undefined lets buildTerrain
    // use TERRAIN.seed, so a mission started without the atlas still works.
    this.seed = data.seed;
    this.missionOver = false;
    this.lastAutoAttackAt = 0;
  }

  create() {
    // Atmospheric backdrop sits behind everything (added before the layer, so
    // display-list order keeps it underneath).
    this.add.image(0, 0, ensureBackdropTexture(this.textures)).setOrigin(0, 0);

    // Group holding every depth-sortable object (tiles + props + entities).
    this.isoLayer = this.add.layer();

    this.buildIsoBackground();
    this.spawnWyvern();
    this.spawnEnemies();
    this.buildHud();
    this.buildStatusText();

    // Depth-sort once at start; entities also re-sort as they move (see update).
    sortByDepth(this.isoLayer);
  }

  // Paint the procedural island. Heights are drawn relative to TERRAIN.
  // baseHeight: ground tiles (baseHeight) put their top face exactly on the
  // gameplay plane the entities move on, while their sidewalls hang below it —
  // that's what makes the island read as a floating diorama. Taller cells rise
  // above the plane as cliffs and mountains.
  //
  // Every tile texture puts its top face's top vertex at local y=0, so a tile
  // of any height anchors with origin (0.5, 0).
  buildIsoBackground() {
    const { tiles } = buildTerrain({
      seed: this.seed,
      exclude: [WYVERN_START, ...DEMO_ENEMY_SPAWNS],
    });

    for (let row = 0; row < tiles.length; row++) {
      for (let col = 0; col < tiles[row].length; col++) {
        const cell = tiles[row][col];
        const { x, y } = gridToScreen(col, row);
        // How far this tile's top face rises above the gameplay plane.
        const lift = (cell.height - TERRAIN.baseHeight) * ISO.elevation;

        const key = ensureTileTexture(this.textures, cell.biome, cell.variant, cell.height);
        const tile = this.add.image(x, y - lift, key);
        tile.setOrigin(0.5, 0);
        // Sort by the tile's FOOTPRINT (diamond center on the ground plane),
        // not its lifted art, so a tall block still sorts by where it stands.
        tile.setData('depth', y + ISO.tileHeight / 2);
        this.isoLayer.add(tile);

        if (cell.decor) this.addDecor(cell, x, y - lift);
      }
    }
  }

  // Props are their own depth-sorted sprites rather than being baked into the
  // tile, so the wyvern can pass correctly in front of and behind them. On a
  // raised tile the prop stands on the lifted top face (clifftop pines).
  addDecor(cell, tileX, tileTopY) {
    const { decor } = cell;
    const baseX = tileX + decor.offsetX;
    const baseY = tileTopY + ISO.tileHeight / 2 + decor.offsetY;
    const key = ensureDecorTexture(this.textures, cell.biome, decor.type, decor.variant);
    const sprite = this.add.image(baseX, baseY, key);
    // Anchor the prop by its feet — the point inside the texture where it meets
    // the ground — so tall props grow upward from the tile.
    sprite.setOrigin(DECOR_BOX.baseX / DECOR_BOX.width, DECOR_BOX.baseY / DECOR_BOX.height);
    // Depth uses the owning tile's footprint on the ground plane (plus a nudge
    // so the prop draws over its own tile), keeping occlusion right even when
    // the prop's visual base is lifted onto a peak.
    sprite.setData('depth', baseY + (cell.height - TERRAIN.baseHeight) * ISO.elevation + 1);
    this.isoLayer.add(sprite);
  }

  spawnWyvern() {
    // Drop the wyvern on a walkable start cell, carrying its roster hp over.
    const start = gridToScreen(WYVERN_START.col, WYVERN_START.row);
    const rosterWyvern = getAnimal('wyv-01');
    this.wyvern = new Wyvern(this, start.x, start.y, rosterWyvern);
    this.wyvern.on('attack', () => this.handlePlayerAttack());
    this.isoLayer.add([this.wyvern.shadow, this.wyvern]);
  }

  spawnEnemies() {
    this.enemies = DEMO_ENEMY_SPAWNS.map(({ col, row }) => {
      const { x, y } = gridToScreen(col, row);
      const enemy = new Enemy(this, x, y, COMBAT.enemyHp);
      this.isoLayer.add(enemy);
      return enemy;
    });
  }

  buildHud() {
    const overlay = document.getElementById('ui-overlay');
    const orderButtons = Object.values(WYVERN_ORDERS)
      .map((order) => {
        const label = order.charAt(0).toUpperCase() + order.slice(1);
        return `<button class="order-btn" data-order="${order}">${label}</button>`;
      })
      .join('');

    overlay.innerHTML = `
      <div class="hud">
        <span>Mission: ${this.missionId}</span>
        <button id="btn-return" class="btn-primary" style="padding: 4px 12px; font-size: 12px; min-height: auto;">Return to Base</button>
      </div>
      <div class="order-bar">${orderButtons}</div>
      <div class="controls-hint">Arrows/WASD move &middot; Space attack &middot; orders steer behavior</div>`;
    document.getElementById('btn-return').onclick = () => {
      overlay.innerHTML = '';
      this.scene.start('Base');
    };

    this.orderButtons = Array.from(document.querySelectorAll('.order-btn'));
    this.orderButtons.forEach((btn) => {
      btn.onclick = () => this.setOrder(btn.dataset.order);
    });
    this.setOrder(this.wyvern.order);
  }

  // Sets the wyvern's standing order and highlights the matching button.
  setOrder(order) {
    this.wyvern.setOrder(order);
    this.orderButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.order === order);
    });
  }

  // Small on-canvas readout of wyvern hp / remaining enemies. Not part of the
  // HTML overlay since it needs to update every frame.
  buildStatusText() {
    this.statusText = this.add.text(12, 12, '', {
      font: '14px monospace',
      color: '#ece7f2',
    });
    this.statusText.setDepth(1000);
  }

  // Resolves the wyvern's attack against the nearest enemy in range.
  handlePlayerAttack() {
    const wyvernGroundY = this.wyvern.groundY ?? this.wyvern.y;
    const target = this.enemies
      .filter((e) => e.hp > 0)
      .find((e) => Phaser.Math.Distance.Between(this.wyvern.x, wyvernGroundY, e.x, e.y)
        <= COMBAT.wyvernAttackRange);
    if (!target) return;
    const dead = target.takeHit(COMBAT.wyvernAttackDamage);
    if (dead) this.handleEnemyDeath(target);
  }

  // Enemies deal contact damage on a per-enemy cooldown when close to the wyvern.
  // Protect/Recon reduce the damage that actually lands (damageTakenMultiplier).
  handleContactDamage(time) {
    if (!this.wyvern || this.wyvern.hp <= 0) return;
    const { damageTakenMultiplier } = ORDER_EFFECTS[this.wyvern.order];
    const wyvernGroundY = this.wyvern.groundY ?? this.wyvern.y;
    this.enemies.forEach((enemy) => {
      if (enemy.hp <= 0) return;
      const dist = Phaser.Math.Distance.Between(this.wyvern.x, wyvernGroundY, enemy.x, enemy.y);
      const offCooldown = time - enemy.lastContactAt >= COMBAT.enemyContactCooldownMs;
      if (dist <= COMBAT.enemyContactRange && offCooldown) {
        enemy.lastContactAt = time;
        const dmg = Math.round(COMBAT.enemyContactDamage * damageTakenMultiplier);
        const dead = this.wyvern.takeHit(dmg);
        if (dead) this.handleDefeat();
      }
    });
  }

  // Guard/Attack/Protect auto-fire at the nearest enemy in range on a cooldown,
  // no space-bar press needed. See ORDER_EFFECTS.autoAttack in config.js.
  handleAutoAttack(time) {
    if (!ORDER_EFFECTS[this.wyvern.order].autoAttack) return;
    if (time - this.lastAutoAttackAt < COMBAT.autoAttackCooldownMs) return;
    const wyvernGroundY = this.wyvern.groundY ?? this.wyvern.y;
    const target = this.enemies
      .filter((e) => e.hp > 0)
      .find((e) => Phaser.Math.Distance.Between(this.wyvern.x, wyvernGroundY, e.x, e.y)
        <= COMBAT.wyvernAttackRange);
    if (!target) return;
    this.lastAutoAttackAt = time;
    const dead = target.takeHit(COMBAT.wyvernAttackDamage);
    if (dead) this.handleEnemyDeath(target);
  }

  // Removes a dead enemy after its death animation, then checks for victory.
  handleEnemyDeath(enemy) {
    this.time.delayedCall(500, () => {
      this.isoLayer.remove(enemy);
      enemy.destroy();
      this.enemies = this.enemies.filter((e) => e !== enemy);
      if (this.enemies.length === 0) this.handleVictory();
    });
  }

  handleVictory() {
    if (this.missionOver) return;
    this.missionOver = true;
    this.showEndOverlay('Mission Complete', 'All enemies defeated.');
  }

  handleDefeat() {
    if (this.missionOver) return;
    this.missionOver = true;
    this.showEndOverlay('Mission Failed', 'Your wyvern went down.');
  }

  showEndOverlay(title, message) {
    const overlay = document.getElementById('ui-overlay');
    overlay.innerHTML = `
      <div class="hud"><span>Mission: ${this.missionId}</span></div>
      <div class="panel end-panel">
        <h1>${title}</h1>
        <p>${message}</p>
        <button id="btn-return">Return to Base</button>
      </div>`;
    document.getElementById('btn-return').onclick = () => {
      overlay.innerHTML = '';
      this.scene.start('Base');
    };
  }

  update(time, delta) {
    if (this.missionOver) return;

    this.wyvern.update(delta);
    this.enemies.forEach((e) => e.update());
    this.handleContactDamage(time);
    this.handleAutoAttack(time);
    this.statusText.setText(
      `HP: ${this.wyvern.hp}  Enemies: ${this.enemies.filter((e) => e.hp > 0).length}  `
      + `Order: ${this.wyvern.order}`,
    );

    // Keep overlap correct as everything moves through the grid.
    sortByDepth(this.isoLayer);
  }
}
