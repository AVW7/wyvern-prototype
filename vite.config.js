import { defineConfig } from 'vite';
import { cp } from 'node:fs/promises';
import path from 'node:path';

function copyRuntimeAssets() {
  return {
    name: 'copy-runtime-assets',
    async writeBundle(outputOptions) {
      const outputDirectory = path.resolve(outputOptions.dir || 'dist');
      // Phaser loads these paths at runtime, so Vite cannot discover them by
      // following imports. Preserve the source folder contract in the build.
      await cp(path.resolve('assets'), path.join(outputDirectory, 'assets'), {
        recursive: true,
      });
    },
  };
}

export default defineConfig({
  // Relative asset URLs keep a production build portable to any static host.
  base: './',
  server: {
    open: false,
    // Honour PORT so several dev servers (or a tool that assigns one) can run
    // against this repo at once. Unset, Vite keeps its usual 5173.
    port: Number(process.env.PORT) || undefined,
  },
  plugins: [copyRuntimeAssets()],
  build: {
    sourcemap: true,
    // The pinned Phaser engine is intentionally one large vendor module.
    chunkSizeWarningLimit: 1300,
  },
});
