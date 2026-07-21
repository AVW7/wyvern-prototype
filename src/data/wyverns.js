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
