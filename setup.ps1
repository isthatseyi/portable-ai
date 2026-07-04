# ============================================================
# Portable AI — one-time setup after cloning (Windows).
#
# Downloads the embedded Ollama runtime (official upstream
# release, sha256-verified) into the Electron app's resources/
# folder. The repo is source-only; this reconstructs the rest.
#
# Usage (PowerShell):
#   .\setup.ps1              # Windows runtime (~2 GB download)
#   .\setup.ps1 -Mac         # also fetch the Mac runtime (~130 MB),
#                            # needed to build the cross-platform stick
# ============================================================
param([switch]$Mac)

$ErrorActionPreference = "Stop"

$OllamaVersion = "v0.31.1"
$WinAsset  = "ollama-windows-amd64.zip"
$WinSha    = "9ecf5a631561c7dff3a143925f11e2008327be738a7279fcf0c5462b9c422700"
$MacAsset  = "ollama-darwin.tgz"
$MacSha    = "0c4f92389fcc1f651c17282e2eaffd68c8d3d06e1f7b307604102ad0e09a10c9"
$BaseUrl   = "https://github.com/ollama/ollama/releases/download/$OllamaVersion"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Res  = Join-Path $Root "Code PAI and App\PAI\PortableAi_Electron_Skeleton\resources"
$Tmp  = Join-Path $Res "_setup_tmp"
New-Item -ItemType Directory -Force -Path $Res, $Tmp | Out-Null

function Get-Verified([string]$Url, [string]$Dest, [string]$Sha) {
    if ((Test-Path $Dest) -and ((Get-FileHash $Dest -Algorithm SHA256).Hash -ieq $Sha)) {
        Write-Host "Already downloaded and verified: $(Split-Path -Leaf $Dest)"
        return
    }
    Write-Host "Downloading $(Split-Path -Leaf $Dest) ..."
    # BITS is resumable and shows progress; fall back to Invoke-WebRequest.
    try { Start-BitsTransfer -Source $Url -Destination $Dest }
    catch { Invoke-WebRequest -Uri $Url -OutFile $Dest }
    if ((Get-FileHash $Dest -Algorithm SHA256).Hash -ine $Sha) {
        throw "sha256 mismatch for $Dest - delete it and re-run."
    }
}

# --- Windows runtime (always) ---
$WinZip = Join-Path $Tmp $WinAsset
Get-Verified "$BaseUrl/$WinAsset" $WinZip $WinSha
Write-Host "Extracting Windows runtime (~2.5 GB unpacked) ..."
$WinDir = Join-Path $Res "ollama-windows-amd64"
if (Test-Path $WinDir) { Remove-Item -Recurse -Force $WinDir }
Expand-Archive -Path $WinZip -DestinationPath $WinDir -Force
Write-Host "Windows runtime installed -> resources\ollama-windows-amd64\"

# Ollama v0.31+ zips no longer bundle vc_redist.x64.exe. The app offers it to
# users whose systems lack the VC++ runtime (main.js checks the registry), so
# fetch it best-effort from Microsoft's permalink; the app copes if absent.
$VcRedist = Join-Path $WinDir "vc_redist.x64.exe"
if (-not (Test-Path $VcRedist)) {
    try { Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vc_redist.x64.exe" -OutFile $VcRedist }
    catch { Write-Host "WARN: vc_redist.x64.exe download failed (optional - skipping)" }
}

# --- Mac runtime (optional, for building the cross-platform stick) ---
if ($Mac) {
    $MacTgz = Join-Path $Tmp $MacAsset
    Get-Verified "$BaseUrl/$MacAsset" $MacTgz $MacSha
    Write-Host "Extracting Mac runtime ..."
    $MacDir = Join-Path $Res "ollama-darwin"
    if (Test-Path $MacDir) { Remove-Item -Recurse -Force $MacDir }
    New-Item -ItemType Directory -Force -Path $MacDir | Out-Null
    # Windows 10+ ships bsdtar as tar.exe; it dereferences the tgz's
    # internal symlinks poorly on NTFS, so extract then flatten copies.
    tar -xzf $MacTgz -C $MacDir
    Write-Host "Mac runtime installed -> resources\ollama-darwin\"
    Write-Host "NOTE: if tar reported symlink errors, run setup.sh on a Mac instead."
}

Remove-Item -Recurse -Force $Tmp

Write-Host ""
Write-Host "Done. Next steps:"
Write-Host "  cd `"$Root\Code PAI and App\PAI\PortableAi_Electron_Skeleton`""
Write-Host "  npm install"
Write-Host "  npm start          # run in dev"
Write-Host "  npm run dist       # build the packaged app"
