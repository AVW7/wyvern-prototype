# Isometric tilemaps

Author iso maps in **Tiled** (Map > New, Orientation = Isometric, tile size 64x32
to match src/config.js ISO). Export as JSON (`mission01.json`) plus tileset PNGs here.

Load with `this.load.tilemapTiledJSON('mission01', 'assets/tilemaps/mission01.json')`
in PreloadScene, then build layers in MissionScene, replacing the DEMO_MAP loop.
Until then the prototype draws a placeholder grid from DEMO_MAP in config.js.
