// Shared, scene-agnostic wyvern presentation helpers. Every renderer resolves
// atlas availability, frame metrics, origin, and scale through this module so
// the Vault, sanctuary, and mission cannot disagree about the same profile.
import { WYVERN_ART } from '../config.js';

export function wyvernAccentColor(profileOrAccent, fallback = 0xd97706) {
  const accent = typeof profileOrAccent === 'string'
    ? profileOrAccent
    : profileOrAccent?.accent;
  const normalized = String(accent || '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(normalized)
    ? Number.parseInt(normalized, 16)
    : fallback;
}

export function resolveWyvernVisual(textures, profile, preferredFrame = null) {
  const texture = profile?.assetKey ? textures?.get(profile.assetKey) : null;
  const candidates = [preferredFrame, profile?.atlas?.initialFrame].filter(Boolean);
  const frameName = candidates.find((candidate) => texture?.has(candidate));
  const usesAtlas = Boolean(profile?.atlas && frameName);
  const frame = usesAtlas ? texture.get(frameName) : texture?.get();
  const referenceHeight = frame?.realHeight || frame?.height || 1;

  return {
    texture,
    textureKey: profile?.assetKey,
    frame,
    frameName: usesAtlas ? frameName : undefined,
    origin: profile?.atlas?.origin || WYVERN_ART.origin,
    referenceHeight,
    usesAtlas,
  };
}

export function scaleWyvernVisual(
  visual,
  targetHeight,
  placeholderScale = 1,
  placeholderReferenceHeight = targetHeight,
) {
  if (visual?.usesAtlas) return targetHeight / Math.max(visual.referenceHeight, 1);
  return placeholderScale * (targetHeight / Math.max(placeholderReferenceHeight, 1));
}
