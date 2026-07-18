// Pure helpers for the wyvern sprite contract. This module deliberately has
// no Phaser or DOM dependency so the same validation runs in PreloadScene,
// automated tests, and the command-line atlas checker.

export const REQUIRED_WYVERN_STATES = Object.freeze([
  'idle',
  'fly',
  'guard',
  'attack',
  'special',
  'hurt',
  'death',
]);

export const LOOPING_WYVERN_STATES = Object.freeze(['idle', 'fly', 'guard']);
export const ONE_SHOT_WYVERN_STATES = Object.freeze(['attack', 'special', 'hurt', 'death']);

// Compass directions use screen-space/map-space shorthand. East is the
// required baseline pose, so an atlas remains fully compatible without any
// directional artwork. Optional directions are additive and never synthesized
// by rotating painted sprites.
export const WYVERN_DIRECTIONS = Object.freeze([
  'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw',
]);
export const BASE_WYVERN_DIRECTION = 'e';

export const WYVERN_ATLAS_LIMITS = Object.freeze({
  recommendedPageSize: 4096,
  desktopPageSize: 8192,
});

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function atlasFrames(atlasData) {
  return atlasData?.frames && !Array.isArray(atlasData.frames)
    ? atlasData.frames
    : {};
}

export function framesForWyvernState(atlasData, state) {
  const frames = atlasFrames(atlasData);
  const configured = atlasData?.meta?.animations?.[state];
  if (!Array.isArray(configured)) return [];
  return configured.filter((frameName) => typeof frameName === 'string' && frames[frameName]);
}

export function framesForWyvernDirection(atlasData, state, direction) {
  if (!WYVERN_DIRECTIONS.includes(direction)) return [];
  const frames = atlasFrames(atlasData);
  const configured = atlasData?.meta?.directionalAnimations?.[state]?.[direction];
  if (!Array.isArray(configured)) return [];
  return configured.filter((frameName) => typeof frameName === 'string' && frames[frameName]);
}

export function firstUsableWyvernFrame(profile, atlasData) {
  const frames = atlasFrames(atlasData);
  const requested = profile?.atlas?.initialFrame;
  if (requested && frames[requested]) return requested;

  for (const state of REQUIRED_WYVERN_STATES) {
    const first = framesForWyvernState(atlasData, state)[0];
    if (first) return first;
  }
  return Object.keys(frames)[0];
}

export function validateWyvernAtlas(profile, atlasData, options = {}) {
  const errors = [];
  const warnings = [];
  const stateFrames = {};
  const directionalStateFrames = {};
  const profileName = profile?.name || profile?.id || 'Unknown wyvern';

  if (!profile?.assetKey) errors.push('Profile is missing assetKey.');
  if (!profile?.specialPower?.name) errors.push('Profile is missing specialPower.name.');
  if (!profile?.specialPower?.description) errors.push('Profile is missing specialPower.description.');
  if (!profile?.atlas?.image) errors.push('Profile is missing atlas.image.');
  if (!profile?.atlas?.data) errors.push('Profile is missing atlas.data.');

  if (!atlasData || typeof atlasData !== 'object') {
    errors.push('Atlas JSON could not be read.');
    return buildReport(
      profileName, errors, warnings, stateFrames, directionalStateFrames, null, options,
    );
  }

  const frames = atlasFrames(atlasData);
  if (!Object.keys(frames).length) {
    errors.push('Atlas JSON must contain a non-empty object at frames.');
  }

  const atlasSize = atlasData.meta?.size;
  if (!positiveInteger(atlasSize?.w) || !positiveInteger(atlasSize?.h)) {
    errors.push('meta.size.w and meta.size.h must be positive integers.');
  } else {
    const largestSide = Math.max(atlasSize.w, atlasSize.h);
    if (largestSide > WYVERN_ATLAS_LIMITS.desktopPageSize) {
      warnings.push(
        `Atlas page ${atlasSize.w}x${atlasSize.h} exceeds the ${WYVERN_ATLAS_LIMITS.desktopPageSize}px desktop contract; split it into pages.`,
      );
    } else if (largestSide > WYVERN_ATLAS_LIMITS.recommendedPageSize) {
      warnings.push(
        `Atlas page ${atlasSize.w}x${atlasSize.h} exceeds the portable ${WYVERN_ATLAS_LIMITS.recommendedPageSize}px target. It requires a GPU texture limit above 4096px.`,
      );
    }
  }

  const imageSize = options.imageSize;
  if (imageSize && atlasSize
    && (imageSize.w !== atlasSize.w || imageSize.h !== atlasSize.h)) {
    errors.push(
      `PNG is ${imageSize.w}x${imageSize.h}, but meta.size declares ${atlasSize.w}x${atlasSize.h}.`,
    );
  }

  const maxTextureSize = options.maxTextureSize;
  if (maxTextureSize && atlasSize
    && Math.max(atlasSize.w, atlasSize.h) > maxTextureSize) {
    errors.push(
      `Atlas requires ${Math.max(atlasSize.w, atlasSize.h)}px textures, but this GPU supports ${maxTextureSize}px.`,
    );
  }

  const animations = atlasData.meta?.animations;
  if (!animations || typeof animations !== 'object' || Array.isArray(animations)) {
    errors.push('meta.animations must be an object keyed by animation state.');
  }

  REQUIRED_WYVERN_STATES.forEach((state) => {
    const configured = animations?.[state];
    if (!Array.isArray(configured) || configured.length === 0) {
      errors.push(`Required animation "${state}" has no frames.`);
      stateFrames[state] = [];
      return;
    }

    const seen = new Set();
    const sourceSizes = new Set();
    configured.forEach((frameName) => {
      if (seen.has(frameName)) warnings.push(`Animation "${state}" repeats frame "${frameName}".`);
      seen.add(frameName);

      const entry = frames[frameName];
      if (!entry) {
        errors.push(`Animation "${state}" references missing frame "${frameName}".`);
        return;
      }
      validateFrame(frameName, entry, atlasSize, errors, warnings);
      if (positiveInteger(entry.sourceSize?.w) && positiveInteger(entry.sourceSize?.h)) {
        sourceSizes.add(`${entry.sourceSize.w}x${entry.sourceSize.h}`);
      }
    });
    if (sourceSizes.size > 1) {
      warnings.push(
        `Animation "${state}" changes sourceSize between frames (${[...sourceSizes].join(', ')}); its pivot may jitter.`,
      );
    }
    stateFrames[state] = configured.filter((frameName) => frames[frameName]);
  });

  validateDirectionalAnimations(
    atlasData.meta?.directionalAnimations,
    frames,
    atlasSize,
    errors,
    warnings,
    directionalStateFrames,
  );

  const initialFrame = profile?.atlas?.initialFrame;
  if (initialFrame && !frames[initialFrame]) {
    errors.push(`Initial frame "${initialFrame}" is not present in frames.`);
  }

  return buildReport(
    profileName, errors, warnings, stateFrames, directionalStateFrames, atlasSize, options,
  );
}

function validateDirectionalAnimations(
  directionalAnimations,
  frames,
  atlasSize,
  errors,
  warnings,
  directionalStateFrames,
) {
  if (directionalAnimations === undefined) return;
  if (!directionalAnimations || typeof directionalAnimations !== 'object'
    || Array.isArray(directionalAnimations)) {
    errors.push('meta.directionalAnimations must be an object keyed by animation state.');
    return;
  }

  Object.keys(directionalAnimations).forEach((state) => {
    if (!REQUIRED_WYVERN_STATES.includes(state)) {
      warnings.push(`Directional animations contain unknown state "${state}".`);
      return;
    }

    const directionMap = directionalAnimations[state];
    if (!directionMap || typeof directionMap !== 'object' || Array.isArray(directionMap)) {
      errors.push(`Directional animation "${state}" must be an object keyed by direction.`);
      return;
    }

    Object.keys(directionMap).forEach((direction) => {
      if (!WYVERN_DIRECTIONS.includes(direction)) {
        warnings.push(`Directional animation "${state}" contains unknown direction "${direction}".`);
      }
    });

    const resolvedDirections = {};
    WYVERN_DIRECTIONS.forEach((direction) => {
      const configured = directionMap[direction];
      if (configured === undefined) return;
      if (!Array.isArray(configured) || configured.length === 0) {
        errors.push(`Directional animation "${state}.${direction}" has no frames.`);
        resolvedDirections[direction] = [];
        return;
      }

      const seen = new Set();
      const sourceSizes = new Set();
      configured.forEach((frameName) => {
        if (seen.has(frameName)) {
          warnings.push(`Directional animation "${state}.${direction}" repeats frame "${frameName}".`);
        }
        seen.add(frameName);

        const entry = frames[frameName];
        if (!entry) {
          errors.push(
            `Directional animation "${state}.${direction}" references missing frame "${frameName}".`,
          );
          return;
        }
        validateFrame(frameName, entry, atlasSize, errors, warnings);
        if (positiveInteger(entry.sourceSize?.w) && positiveInteger(entry.sourceSize?.h)) {
          sourceSizes.add(`${entry.sourceSize.w}x${entry.sourceSize.h}`);
        }
      });

      if (sourceSizes.size > 1) {
        warnings.push(
          `Directional animation "${state}.${direction}" changes sourceSize between frames (${[...sourceSizes].join(', ')}); its pivot may jitter.`,
        );
      }
      resolvedDirections[direction] = configured.filter((frameName) => frames[frameName]);
    });

    directionalStateFrames[state] = resolvedDirections;
    const covered = new Set([BASE_WYVERN_DIRECTION, ...Object.keys(resolvedDirections)]);
    if (covered.size < WYVERN_DIRECTIONS.length) {
      const missing = WYVERN_DIRECTIONS.filter((direction) => !covered.has(direction));
      warnings.push(
        `Directional animation "${state}" is partial; missing ${missing.join(', ')} will use the east-facing baseline.`,
      );
    }
  });
}

function validateFrame(frameName, entry, atlasSize, errors, warnings) {
  const frame = entry?.frame;
  if (!frame || !positiveInteger(frame.w) || !positiveInteger(frame.h)
    || !Number.isInteger(frame.x) || !Number.isInteger(frame.y)
    || frame.x < 0 || frame.y < 0) {
    errors.push(`Frame "${frameName}" has an invalid frame rectangle.`);
    return;
  }

  if (atlasSize && (frame.x + frame.w > atlasSize.w || frame.y + frame.h > atlasSize.h)) {
    errors.push(`Frame "${frameName}" extends outside meta.size.`);
  }
  if (entry.rotated) {
    warnings.push(`Frame "${frameName}" is rotated; disable rotation in the atlas exporter.`);
  }

  const source = entry.sourceSize;
  const spriteSource = entry.spriteSourceSize;
  if (!positiveInteger(source?.w) || !positiveInteger(source?.h)) {
    warnings.push(`Frame "${frameName}" has no valid sourceSize; stable pivots cannot be guaranteed.`);
  }
  if (entry.trimmed && (!spriteSource
    || !positiveInteger(spriteSource.w) || !positiveInteger(spriteSource.h))) {
    warnings.push(`Trimmed frame "${frameName}" has no valid spriteSourceSize.`);
  }
}

function buildReport(
  profileName,
  errors,
  warnings,
  stateFrames,
  directionalStateFrames,
  atlasSize,
  options,
) {
  return {
    profileName,
    mode: 'atlas',
    valid: errors.length === 0,
    errors,
    warnings,
    stateFrames,
    directionalStateFrames,
    atlasSize: atlasSize || null,
    imageSize: options.imageSize || null,
    maxTextureSize: options.maxTextureSize || null,
  };
}

export function placeholderWyvernReport(profile) {
  const errors = [];
  if (!profile?.specialPower?.name) errors.push('Profile is missing specialPower.name.');
  if (!profile?.specialPower?.description) errors.push('Profile is missing specialPower.description.');
  return {
    profileName: profile?.name || profile?.id || 'Unknown wyvern',
    mode: 'placeholder',
    valid: errors.length === 0,
    errors,
    warnings: [],
    stateFrames: Object.fromEntries(REQUIRED_WYVERN_STATES.map((state) => [state, []])),
    directionalStateFrames: {},
    atlasSize: null,
    imageSize: null,
    maxTextureSize: null,
  };
}
