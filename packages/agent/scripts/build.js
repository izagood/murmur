import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function getVersion() {
  try {
    const cwd = process.cwd();
    const describe = execSync('git describe --tags --always', { cwd, encoding: 'utf8' }).trim();
    return describe;
  } catch {
    try {
      const cwd = process.cwd();
      const rev = execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim();
      return rev.slice(0, 7);
    } catch {
      return 'unknown';
    }
  }
}

const version = getVersion();
console.log(`Building with version: ${version}`);

const outdir = 'dist';
if (!fs.existsSync(outdir)) {
  fs.mkdirSync(outdir, { recursive: true });
}

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  outdir,
  format: 'esm',
  external: ['node-pty'],
  define: {
    'process.env.AGENT_VERSION': JSON.stringify(version),
  },
  sourcemap: true,
});

console.log('Build complete');