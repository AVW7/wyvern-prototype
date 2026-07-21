// Roster / base data model. Kept as a plain module so both the Base sim and
// missions read the same state. Swap the array for saved/loaded data later,
// or move to a proper store when the sim grows.
import { SPECIES } from '../data/species.js';
import { DEMO_WYVERNS } from '../data/wyverns.js';

// Clone the catalog rows so progression remains mutable while the character
// definitions stay immutable and reusable by the preloader.
const roster = DEMO_WYVERNS.map((profile) => ({
  ...profile,
  species: 'wyvern',
  xp: 0,
  bond: 0,
  stats: { ...profile.stats },
  missionTags: [...profile.missionTags],
}));

export function getRoster() {
  return roster;
}

export function getAnimal(id) {
  return roster.find((a) => a.id === id);
}

// The Rider Vault intentionally showcases the three authored demo profiles,
// not every generic animal recruited through the management prototype.
export function getShowcaseWyverns() {
  const ids = new Set(DEMO_WYVERNS.map((profile) => profile.id));
  return roster.filter((animal) => ids.has(animal.id));
}

// Add an animal to the roost (breeding/recruiting later).
export function addAnimal(data) {
  roster.push(data);
  return data;
}

const XP_PER_LEVEL = 100;

// Grants xp to an animal, leveling it up (and bumping hp by its species'
// hpPerLevel) at each threshold. Backs the per-card "Train" action.
export function gainXp(id, amount) {
  const a = getAnimal(id);
  if (!a) return null;
  const { hpPerLevel } = SPECIES[a.species];
  a.xp += amount;
  while (a.xp >= XP_PER_LEVEL) {
    a.xp -= XP_PER_LEVEL;
    a.level += 1;
    a.hp += hpPerLevel;
  }
  return a;
}

// Raises an animal's bond (0-100), the "raise/interact" stat separate from
// combat level. Backs the per-card "Feed" action.
export function raiseBond(id, amount = 15) {
  const a = getAnimal(id);
  if (!a) return null;
  a.bond = Math.min(100, a.bond + amount);
  return a;
}

let nextRecruitNumber = roster.length + 1;

// Recruits a fresh level-1 animal of the given species into the roost.
// Backs the Base sim's per-species recruit buttons.
export function recruitAnimal(speciesId, name) {
  const species = SPECIES[speciesId];
  const id = `${speciesId}-${String(nextRecruitNumber).padStart(2, '0')}`;
  const finalName = name || `${species.name}-${nextRecruitNumber}`;
  nextRecruitNumber += 1;
  return addAnimal({
    id, name: finalName, species: speciesId, level: 1, hp: species.hpBase, xp: 0, bond: 0,
  });
}
