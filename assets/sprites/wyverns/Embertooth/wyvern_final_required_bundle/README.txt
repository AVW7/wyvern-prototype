Wyvern Final Bundle - Fixed Anatomy (2 hind legs + 2 wings only)

REQUIRED STATES (Phaser-compatible hash atlas):
- idle (Loop): 4 frames - neutral breathing, 2 legs standing wings raised
- fly (Loop): 4 frames - wing cycle, runtime altitude
- guard (Loop): 4 frames - braced shielding, wings forward
- attack (One shot -> Idle): 4 frames - anticipation, strike, follow-through
- special (One shot -> Idle): 5 frames - signature dark fire breath, rears on 2 legs
- hurt (One shot -> Idle): 3 frames - impact and recovery
- death (One shot -> Vault): 5 frames - collapse

JSON format:
{
  "frames": { "idle_0": { "frame": {...}, "trimmed": true, ... } },
  "meta": { "image": "wyvern_required_atlas.png", "format": "RGBA8888", "size": {...}, "animations": { "idle": [...], ... } }
}

All frames true wyvern: ONLY 2 hind legs + 2 wing-arms, no extra front legs.
Style: black scales, dark red throat, tattered wings with holes, red eyes, spiky back fin tail.
True to original refs.

Use frameRates in src/config.js, do not duplicate frames.
