const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const obfuscator = require('javascript-obfuscator');
const bytenode = require('bytenode');

const ROOT_DIR = path.resolve(__dirname, '..');

// Files to obfuscate (HTML inline scripts + renderer JS)
const OBFUSCATE_FILES = [
    'webui/app.js',
    'app.js'
];
const HTML_FILES = [
    'index.html',
    'webui/index.html'
];
// Files to compile to V8 Bytecode (Main process & Preload)
const BYTECODE_FILES = [
    'main.js',
    'preload.js'
];

async function backupAndProcess() {
    console.log('[SecureBuild] Starting secure build pipeline...');
    const backups = [];

    try {
        // 1. Process obfuscation for renderer files
        for (const file of OBFUSCATE_FILES) {
            const fullPath = path.join(ROOT_DIR, file);
            if (fs.existsSync(fullPath)) {
                const backupPath = fullPath + '.bak';
                fs.copyFileSync(fullPath, backupPath);
                backups.push({ orig: fullPath, bak: backupPath });

                console.log(`[SecureBuild] Obfuscating ${file}...`);
                const code = fs.readFileSync(fullPath, 'utf8');
                const obf = obfuscator.obfuscate(code, {
                    target: 'browser',
                    compact: true,
                    controlFlowFlattening: true,
                    deadCodeInjection: true,
                    stringArray: true,
                    stringArrayEncoding: ['base64'],
                });
                fs.writeFileSync(fullPath, obf.getObfuscatedCode());
            }
        }

        // 2. Process HTML files for inline scripts
        for (const file of HTML_FILES) {
            const fullPath = path.join(ROOT_DIR, file);
            if (fs.existsSync(fullPath)) {
                const backupPath = fullPath + '.bak';
                fs.copyFileSync(fullPath, backupPath);
                backups.push({ orig: fullPath, bak: backupPath });

                console.log(`[SecureBuild] Obfuscating inline scripts in ${file}...`);
                let html = fs.readFileSync(fullPath, 'utf8');
                const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;

                html = html.replace(scriptRegex, (match, scriptContent) => {
                    if (!scriptContent.trim()) return match;
                    // Ignore external scripts (with src)
                    if (match.toLowerCase().includes('src=')) return match;

                    try {
                        const obf = obfuscator.obfuscate(scriptContent, { target: 'browser' });
                        return match.replace(scriptContent, '\n' + obf.getObfuscatedCode() + '\n');
                    } catch (err) {
                        console.error(`[SecureBuild] Warning: Failed to obfuscate a script in ${file}:`, err.message);
                        return match; // fallback
                    }
                });
                fs.writeFileSync(fullPath, html);
            }
        }

        // 3. Compile V8 bytecode for main process files
        for (const file of BYTECODE_FILES) {
            const fullPath = path.join(ROOT_DIR, file);
            if (fs.existsSync(fullPath)) {
                const backupPath = fullPath + '.bak';
                fs.copyFileSync(fullPath, backupPath);
                backups.push({ orig: fullPath, bak: backupPath });

                console.log(`[SecureBuild] Bytecode compiling ${file}...`);
                const parsed = path.parse(fullPath);
                const jscPath = path.join(parsed.dir, parsed.name + '.jsc');

                // Compile using the electron bytenode integration
                // (bytenode needs to use electron's node engine. But here we run Node.js)
                // Since Electron and Node ABI might differ, it's safer to use `npm run dist` then electron-builder does it.
                // Wait, Bytenode compileFile works fine if Node version closely matches Electron.
                // We can just use standard Node Bytenode since it's just compiling JS to bytecode.
                // NOTE: If electron crashes, we might need to use electron to compile it (e.g. `electron -e "require('bytenode').compileFile({..."`)

                // Actually, it's safer to spawn Electron to compile to ensure V8 version matches perfectly!
                const compileScript = `
          const bytenode = require('bytenode');
          bytenode.compileFile({ filename: '${fullPath.replace(/\\/g, '\\\\')}', output: '${jscPath.replace(/\\/g, '\\\\')}' });
        `;
                execSync(`npx electron -e "${compileScript}"`, { cwd: ROOT_DIR });

                // Now rewrite the original .js file to act as a loader
                // Ensure relative path has ./ prefix
                const relativeJsc = './' + parsed.name + '.jsc';
                const loaderCode = `require('bytenode');\nrequire('${relativeJsc}');\n`;
                fs.writeFileSync(fullPath, loaderCode);
            }
        }

        // 4. Run Electron-Builder
        console.log('[SecureBuild] Building packaged app with electron-builder...');
        // using npx electron-builder
        execSync('npx electron-builder', { cwd: ROOT_DIR, stdio: 'inherit' });

    } catch (error) {
        console.error('[SecureBuild] Error during build process:', error);
        process.exitCode = 1;
    } finally {
        console.log('[SecureBuild] Cleaning up and restoring original files...');
        // Restore backed up files
        for (const item of backups) {
            if (fs.existsSync(item.bak)) {
                fs.copyFileSync(item.bak, item.orig);
                fs.unlinkSync(item.bak);
            }
        }
        // Delete .jsc files
        for (const file of BYTECODE_FILES) {
            const fullPath = path.join(ROOT_DIR, file);
            const jscPath = fullPath.replace('.js', '.jsc');
            if (fs.existsSync(jscPath)) {
                fs.unlinkSync(jscPath);
            }
        }
        console.log('[SecureBuild] Secure build pipeline finished.');
    }
}

backupAndProcess();
