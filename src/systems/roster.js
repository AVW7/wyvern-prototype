// Roster / base data model. Kept as a plain module so both the Base sim and
// missions read the same state. Swap the array for saved/loaded data later,
// or move to a proper store when the sim grows.

const roster = [
  { id: 'wyv-01', name: 'Embertooth', level: 1, hp: 100, xp: 0 },
];

export function getRoster() {
  return roster;
}

export function getWyvern(id) {
  return roster.find((w) => w.id === id);
}

// Add a wyvern to the roost (breeding/recruiting later).
export function addWyvern(data) {
  roster.push(data);
  return data;
}
