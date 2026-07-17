# Wyvern sprites

The Dragon Vault is scaffolded for **one Phaser JSON atlas per wyvern**.
Generated colored emoji textures use the same asset keys, so real art can
replace one profile at a time without changing the vault UI or entity code.

Embertooth is now connected to:

```text
Embertooth/wyvern_ultimate_atlas.png
Embertooth/wyvern_ultimate_atlas.json
```

Its atlas contains all six required animations and several future actions.
Cinderlash and Galeclaw continue to use generated placeholders until their
own atlases are added.

## Required layout

Create one folder per catalog profile:

```text
assets/sprites/wyverns/
├── Embertooth/wyvern_ultimate_atlas.png
├── Embertooth/wyvern_ultimate_atlas.json
├── cinderlash/cinderlash.png
├── cinderlash/cinderlash.json
├── galeclaw/galeclaw.png
└── galeclaw/galeclaw.json
```

The matching atlas keys are defined in `src/data/wyverns.js`:

- `wyvern-embertooth`
- `wyvern-cinderlash`
- `wyvern-galeclaw`

## Animation contract

Export one named frame sequence for each required state:

`idle`, `fly`, `guard`, `attack`, `hurt`, `death`

Idle, fly, and guard loop. Attack, hurt, and death play once. Runtime animation
keys follow `<assetKey>-<state>`, for example `wyvern-embertooth-guard`.

## Replacing a placeholder

1. Export the sprite sheet and Phaser-compatible JSON atlas.
2. Add the atlas paths and frame-name arrays to that profile's `atlas` row in
   `src/data/wyverns.js`.
3. `PreloadScene` loads every configured atlas and registers its frame arrays
   automatically. A profile entry follows this shape:

   ```js
   atlas: {
     image: 'assets/sprites/wyverns/name/name.png',
     data: 'assets/sprites/wyverns/name/name.json',
     animations: {
       idle: ['idle_0', 'idle_1'],
       // fly, guard, attack, hurt, death...
     },
   }
   ```

4. Keep the existing animation keys. The vault preview automatically disables
   its fallback motion when it detects a multi-frame animation.

Frame names must match the JSON exactly. No changes are needed in `VaultScene`,
`Wyvern`, or the profile overlay. High-resolution frames are normalized to the
configured vault and mission display heights in `config.js`.
