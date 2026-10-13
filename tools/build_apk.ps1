# Build the Android APK: web build -> copy into Android project -> Gradle.
# Caches and temp files go to D: because C: is nearly full.
param([switch]$Release)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:GRADLE_USER_HOME = 'D:\CodexBuild\Dynamics\gradle-home'
$env:TEMP = 'D:\CodexBuild\InterestLedger\tmp'; $env:TMP = $env:TEMP
Push-Location $root
try {
  npx vite build
  if ($LASTEXITCODE -ne 0) { throw 'web build failed' }
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw 'cap sync failed' }
  node tools/android_icons.mjs; node tools/android_splash.mjs
  if ($LASTEXITCODE -ne 0) { throw 'cap sync failed' }
  Push-Location android
  try {
    & .\gradlew.bat assembleDebug --console=plain
    if ($LASTEXITCODE -ne 0) { throw "Gradle failed: $LASTEXITCODE" }
  } finally { Pop-Location }
  $apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
  Copy-Item $apk (Join-Path $root 'InterestLedger.apk') -Force
  Write-Host "done: $root\InterestLedger.apk"
} finally { Pop-Location }
