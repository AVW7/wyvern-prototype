// WYVERN_ART.frameRates example - timing in code, not duplicate frames
const WYVERN_ART = {
  frameRates: {
    idle: 10,    // Loop - neutral breathing / weight shift
    fly: 12,     // Loop - wing cycle; runtime supplies altitude and shadow separation
    guard: 8,    // Loop - braced shielding pose
    attack: 16,  // One shot, then Idle - anticipation, strike, follow-through
    special: 12, // One shot, then Idle - unique signature power (dark fire breath)
    hurt: 14,    // One shot, then Idle - clear impact and recovery
    death: 8     // One shot, then Idle in Vault
  }
};
