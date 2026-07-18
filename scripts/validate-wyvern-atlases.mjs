import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { DEMO_WYVERNS } from '../src/data/wyverns.js';
import {
  placeholderWyvernReport,
  validateWyvernAtlas,
} from '../src/systems/wyvernAtlas.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let errorCount = 0;
let warningCount = 0;

function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Not a valid PNG file.');
  }
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

for (const profile of DEMO_WYVERNS) {
  if (!profile.atlas) {
    const report = placeholderWyvernReport(profile);
    console.log(`${report.valid ? 'PLACEHOLDER' : 'INVALID'}  ${profile.name}`);
    report.errors.forEach((message) => console.error(`  ERROR   ${message}`));
    errorCount += report.errors.length;
    continue;
  }

  try {
    const jsonPath = path.join(root, profile.atlas.data);
    const imagePath = path.join(root, profile.atlas.image);
    const [jsonSource, imageBuffer] = await Promise.all([
      readFile(jsonPath, 'utf8'),
      readFile(imagePath),
    ]);
    const atlasData = JSON.parse(jsonSource);
    const imageSize = pngSize(imageBuffer);
    const report = validateWyvernAtlas(profile, atlasData, { imageSize });
    const decodedMiB = imageSize.w * imageSize.h * 4 / 1024 / 1024;

    console.log(
      `${report.valid ? 'VALID' : 'INVALID'}      ${profile.name} · ${imageSize.w}x${imageSize.h} · ~${decodedMiB.toFixed(1)} MiB RGBA`,
    );
    report.errors.forEach((message) => console.error(`  ERROR   ${message}`));
    report.warnings.forEach((message) => console.warn(`  WARNING ${message}`));
    errorCount += report.errors.length;
    warningCount += report.warnings.length;
  } catch (error) {
    errorCount += 1;
    console.error(`INVALID      ${profile.name}\n  ERROR   ${error.message}`);
  }
}

console.log(`Atlas validation complete: ${errorCount} error(s), ${warningCount} warning(s).`);
if (errorCount) process.exitCode = 1;
