// Sanctuary species registry — the source of truth for what can live in the
// Roost. To add a new species: add an entry here; the Base screen's recruit
// row and roster cards pick it up automatically. Mirrors the biome registry
// pattern in data/biomes.js.
import { EMOJI } from '../config.js';

export const SPECIES = {
  wyvern: {
    id: 'wyvern', name: 'Wyvern', emoji: EMOJI.wyvern, hpBase: 100, hpPerLevel: 20,
  },
  griffon: {
    id: 'griffon', name: 'Griffon', emoji: '🦅', hpBase: 110, hpPerLevel: 22,
  },
};
