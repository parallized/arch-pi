import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(__dirname, '..');
const repoRoot = resolve(desktopDir, '../..');
const stageDir = join(desktopDir, '.stage');
const releaseDir = join(desktopDir, 'release');

function resolvePnpmStoreRoot() {
  const modulesYamlPath = join(repoRoot, 'node_modules/.modules.yaml');
  if (!existsSync(modulesYamlPath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(modulesYamlPath, 'utf8'));
    const storeDir = typeof parsed?.storeDir === 'string' ? parsed.storeDir.trim() : '';
    if (!storeDir) return undefined;
    // `.modules.yaml` stores the versioned directory (e.g. `.../store/v10`), while `--store-dir` takes the base dir.
    return /^v\d+$/i.test(basename(storeDir)) ? dirname(storeDir) : storeDir;
  } catch {
    return undefined;
  }
}

function runPnpm(args, cwd) {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe';
    execFileSync(comspec, ['/d', '/c', 'pnpm', ...args], { cwd, stdio: 'inherit' });
    return;
  }
  execFileSync('pnpm', args, { cwd, stdio: 'inherit' });
}

function main() {
  const outMain = join(desktopDir, 'out/main/index.js');
  if (!existsSync(outMain)) {
    throw new Error('Missing built Electron output (run pnpm build first).');
  }

  const desktopPkg = JSON.parse(readFileSync(join(desktopDir, 'package.json'), 'utf8'));
  const electronPkg = JSON.parse(
    readFileSync(join(desktopDir, 'node_modules/electron/package.json'), 'utf8')
  );
  const electronVersion = electronPkg.version;
  const electronDist = join(desktopDir, 'node_modules/electron/dist');

  rmSync(stageDir, { recursive: true, force: true });
  rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  const deployArgs = [];
  const storeRoot = resolvePnpmStoreRoot();
  if (storeRoot) {
    deployArgs.push('--store-dir', storeRoot);
  }
  deployArgs.push('--filter', '@archpi/desktop', '--prod', '--legacy', 'deploy', stageDir);

  console.log('[pack-win] Deploying production workspace dependencies...');
  runPnpm(deployArgs, repoRoot);

  // Guard against workspace packages omitting compiled dist outputs
  for (const wsPkg of ['@archpi/shared', '@archpi/agent-runtime']) {
    const distEntry = join(stageDir, 'node_modules', wsPkg, 'dist/index.js');
    if (!existsSync(distEntry)) {
      throw new Error(`Deployed workspace package missing ${distEntry}`);
    }
  }

  cpSync(join(desktopDir, 'out'), join(stageDir, 'out'), { recursive: true });
  cpSync(join(desktopDir, 'resources'), join(stageDir, 'resources'), { recursive: true });
  cpSync(join(desktopDir, 'electron-builder.yml'), join(stageDir, 'electron-builder.yml'));

  // Sync metadata into deployed manifest cleanly
  const stagePkgPath = join(stageDir, 'package.json');
  const stagePkg = JSON.parse(readFileSync(stagePkgPath, 'utf8'));
  stagePkg.version = desktopPkg.version;
  stagePkg.description = desktopPkg.description;
  stagePkg.author = desktopPkg.author;
  writeFileSync(stagePkgPath, JSON.stringify(stagePkg, null, 2), 'utf8');

  const ebCliJs = join(desktopDir, 'node_modules/electron-builder/cli.js');
  console.log(`[pack-win] Running electron-builder (Electron ${electronVersion}, v${desktopPkg.version})...`);
  execFileSync(
    process.execPath,
    [
      ebCliJs,
      '--projectDir',
      stageDir,
      '--win',
      '--x64',
      '-c',
      join(stageDir, 'electron-builder.yml'),
      `-c.electronVersion=${electronVersion}`,
      `-c.electronDist=${electronDist}`
    ],
    { cwd: desktopDir, stdio: 'inherit' }
  );

  rmSync(stageDir, { recursive: true, force: true });
  console.log(`[pack-win] Artifacts ready in ${releaseDir}`);
}

main();
