import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const configPath = path.join(rootDir, '.blender-toolkit', 'blender-config.json');

function getBlenderExecutable() {
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.blenderExecutable && fs.existsSync(config.blenderExecutable)) {
        return config.blenderExecutable;
      }
    } catch (e) {
      console.warn('⚠️ Warning: Failed to parse .blender-toolkit/blender-config.json');
    }
  }

  // Fallback search
  const macPath = '/Applications/Blender.app/Contents/MacOS/Blender';
  if (fs.existsSync(macPath)) {
    return macPath;
  }

  throw new Error('❌ Blender executable not found. Please install Blender 4.0+ or configure .blender-toolkit/blender-config.json');
}

function runCheck() {
  const blenderExec = getBlenderExecutable();
  console.log(`🔍 Blender Executable Found: ${blenderExec}`);
  const output = execSync(`"${blenderExec}" --version`, { encoding: 'utf8' });
  const firstLine = output.split('\n')[0];
  console.log(`✅ ${firstLine}`);
  console.log(`✅ blender-toolkit CLI runner integration is operational!`);
}

function generateProps() {
  const blenderExec = getBlenderExecutable();
  const scriptPath = path.join(rootDir, 'tools', 'generate-sanctuary-props.py');
  const outDir = path.join(rootDir, 'assets', 'models', 'props');
  
  console.log(`🚀 Launching Blender in background mode to generate sanctuary 3D props...`);
  const cmd = `"${blenderExec}" --background --python "${scriptPath}" -- "${outDir}"`;
  execSync(cmd, { stdio: 'inherit' });
  console.log(`🎉 Sanctuary 3D prop assets created in assets/models/props/`);
}

function processFlightClips(sourceFbx, outGlb) {
  const blenderExec = getBlenderExecutable();
  const scriptPath = path.join(rootDir, 'tools', 'blender-flight-clips.py');

  if (!sourceFbx || !outGlb) {
    console.error('Usage: node tools/blender-runner.mjs --flight-clips <source.fbx> <out.glb>');
    process.exit(1);
  }

  console.log(`🚀 Processing dragon flight clips with Blender...`);
  const cmd = `"${blenderExec}" --background --python "${scriptPath}" -- "${sourceFbx}" "${outGlb}"`;
  execSync(cmd, { stdio: 'inherit' });
}

function main() {
  const args = process.argv.slice(2);
  const flag = args[0];

  if (flag === '--check') {
    runCheck();
  } else if (flag === '--generate-props') {
    generateProps();
  } else if (flag === '--flight-clips') {
    processFlightClips(args[1], args[2]);
  } else {
    console.log(`blender-toolkit runner for wyvern-prototype

Options:
  --check               Verify Blender installation and version
  --generate-props      Generate procedural low-poly 3D sanctuary props
  --flight-clips <src> <dst> Derive dragon flight clips from source FBX
`);
  }
}

main();
