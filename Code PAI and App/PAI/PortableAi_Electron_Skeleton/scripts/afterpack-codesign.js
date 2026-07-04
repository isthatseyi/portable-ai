// electron-builder afterPack hook: ad-hoc codesign the Mac app bundle.
// The app ships unsigned (no Apple Developer ID yet); an ad-hoc signature
// keeps modern macOS (especially Apple Silicon) willing to launch it after
// the user strips the quarantine attribute. No-op on Windows/Linux builds.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  // Universal builds pack x64 and arm64 into *-temp dirs first, then merge.
  // Signing the temp slices makes their _CodeSignature files differ, which
  // @electron/universal rejects ("identical SHAs" error) — only sign the
  // final merged app.
  if (context.appOutDir.endsWith('-temp')) {
    console.log(`afterpack-codesign: skipping per-arch temp build ${context.appOutDir}`);
    return;
  }

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);
  if (!fs.existsSync(appPath)) {
    console.warn(`afterpack-codesign: ${appPath} not found, skipping`);
    return;
  }

  console.log(`afterpack-codesign: ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '-s', '-', appPath], {
    stdio: 'inherit',
  });
};
