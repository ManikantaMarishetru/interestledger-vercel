# Build a ready-to-upload static folder for Vercel: deploy\InterestLedger-vercel (+ .zip).
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
  npx tsc -b; if ($LASTEXITCODE -ne 0) { throw 'type check failed' }
  npx vite build; if ($LASTEXITCODE -ne 0) { throw 'web build failed' }
  $out = Join-Path $root 'deploy\InterestLedger-vercel'
  if (Test-Path 'deploy') { Remove-Item 'deploy' -Recurse -Force }
  New-Item -ItemType Directory -Force $out | Out-Null
  Copy-Item 'dist\*' $out -Recurse
  Copy-Item 'tools\vercel.json' (Join-Path $out 'vercel.json')
  Copy-Item 'tools\vercel-README.txt' (Join-Path $out 'README.txt')
  Compress-Archive -Path "$out\*" -DestinationPath 'deploy\InterestLedger-vercel.zip' -Force
  Write-Host "done: $out"
} finally { Pop-Location }
