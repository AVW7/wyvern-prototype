// Demo wyvern catalog: the immutable character/showcase data shared by the
// roster, preloader, VaultScene, and mission entity. Each wyvern owns a unique
// asset key so its placeholder can be replaced by a real atlas independently.
export const DEMO_WYVERNS = [
  {
    id: 'wyv-01',
    name: 'Embertooth',
    sex: 'Male',
    role: 'Guardian',
    level: 1,
    hp: 120,
    trait: 'Stonehide',
    specialPower: {
      name: 'Fire Breath',
      description: 'Embertooth channels his signature power through the required special animation.',
    },
    description: 'A patient shield-bearer who holds narrow ground and brings allies home.',
    assetKey: 'wyvern-embertooth',
    accent: '#d97706',
    stats: { guard: 5, attack: 3, speed: 2 },
    missionTags: ['Defense', 'Escort', 'Rescue'],
    atlas: {
      image: 'assets/sprites/wyverns/Embertooth/wyvern_final_required_bundle/wyvern_required_atlas.png',
      data: 'assets/sprites/wyverns/Embertooth/wyvern_final_required_bundle/wyvern_required_atlas.json',
      initialFrame: 'idle_0',
      // Load after portable atlases: this page is taller than 4096 px and may
      // fail on constrained renderers, but must not starve valid profiles.
      loadPriority: 20,
      // Optional per-atlas pivot override. Exported sourceSize and
      // spriteSourceSize still need to remain stable between frames.
      origin: { x: 0.5, y: 0.88 },
    },
  },
  {
    id: 'wyv-02',
    name: 'Cinderlash',
    sex: 'Female',
    role: 'Striker',
    level: 1,
    hp: 100,
    trait: 'Ember Surge',
    specialPower: {
      name: 'Cinder Burst',
      description: 'Cinderlash channels her signature power through the required special animation.',
    },
    description: 'An aggressive breach fighter built to overwhelm hardened targets quickly.',
    assetKey: 'wyvern-cinderlash',
    accent: '#dc3f50',
    stats: { guard: 2, attack: 5, speed: 3 },
    missionTags: ['Assault', 'Breach', 'Boss Hunt'],
    atlas: {
      image: 'assets/sprites/wyverns/Cinderlash/wyvern_atlas_4096.png',
      data: 'assets/sprites/wyverns/Cinderlash/wyvern_atlas_4096.json',
      initialFrame: 'idle_0.png',
      loadPriority: 10,
      origin: { x: 0.5, y: 0.88 },
    },
  },
  {
    id: 'wyv-03',
    name: 'Galeclaw',
    sex: 'Female',
    role: 'Scout',
    level: 1,
    hp: 90,
    trait: 'Far Sight',
    specialPower: {
      name: 'Gale Rush',
      description: 'Galeclaw channels her signature power through the required special animation.',
    },
    description: 'A swift pathfinder suited to reconnaissance, couriers, and timed objectives.',
    assetKey: 'wyvern-galeclaw',
    accent: '#38a9c9',
    stats: { guard: 2, attack: 2, speed: 5 },
    missionTags: ['Recon', 'Timed', 'Delivery'],
    atlas: null,
  },
];

export function getDemoWyvern(id) {
  return DEMO_WYVERNS.find((wyvern) => wyvern.id === id);
}

// Animation keys stay profile-specific even while their generated placeholder
// textures are one frame. Real atlases can therefore land one wyvern at a time.
export function wyvernAnimationKey(wyvernOrAssetKey, state, direction = null) {
  const assetKey = typeof wyvernOrAssetKey === 'string'
    ? wyvernOrAssetKey
    : wyvernOrAssetKey.assetKey;
  return direction
    ? `${assetKey}-${state}-${direction}`
    : `${assetKey}-${state}`;
}

export function wyvernAtlasDataKey(wyvernOrAssetKey) {
  const assetKey = typeof wyvernOrAssetKey === 'string'
    ? wyvernOrAssetKey
    : wyvernOrAssetKey.assetKey;
  return `${assetKey}-atlas-data`;
}
