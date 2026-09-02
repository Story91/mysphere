# SPHERE - automat epoki sezonu (codziennie; sam wie, kiedy jest co robic).
#
# Co robi jeden przebieg (AUTO=tak w publishEpoch.ts):
#   - bierze ostatnia ZAMKNIETA epoke; jesli juz zaproponowana albo poprzedni
#     root czeka na aktywacje - konczy natychmiast (idempotentne),
#   - liczy leaderboard z logow, pula = wolne saldo dystrybutora, VWAP
#     z transz SphereBuyback, buduje liscie + root,
#   - propose() kluczem PROPOSER z .env.local, manifest z proofami na Blob
#     (jesli BLOB_READ_WRITE_TOKEN) + kopia w public/sphere-epochs,
#   - po udanym propose publikuje public/sphere-epochs na master przez
#     TYMCZASOWY worktree origin/master (nie dotyka galezi, na ktorej stoi
#     repo) - Vercel wdraza, Claim ma swieze proofy takze bez Bloba.
# Po 24 h weta keeper.ps1 wola activate() - Claim na stronie sezonu.
#
# Harmonogram (raz, w PowerShellu, z katalogu repo):
#   schtasks /Create /TN "SPHERE epoch" /SC DAILY /ST 05:10 /TR "powershell -ExecutionPolicy Bypass -File $PWD\scripts\sphere\epoch.ps1" /F
# Logi: scripts\output\epoch.log

$ErrorActionPreference = 'Continue'
$repo = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
Set-Location $repo

$env:AUTO = 'tak'
$env:PROPOSE = 'tak'

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$log = Join-Path $repo 'scripts\output\epoch.log'
"=== $stamp ===" | Out-File -FilePath $log -Append -Encoding utf8
$out = npm run sphere:epoch 2>&1 | ForEach-Object { "$_" }
$out | Out-File -FilePath $log -Append -Encoding utf8
$out

if (($out | Out-String) -match 'propose OK') {
  # Publikacja manifestu na master bez ruszania biezacej galezi.
  $wt = Join-Path $env:TEMP 'sphere-epoch-wt'
  git fetch -q origin master
  if (Test-Path $wt) { git worktree remove $wt --force | Out-Null }
  git worktree add --detach $wt origin/master | Out-Null
  New-Item -ItemType Directory -Force (Join-Path $wt 'public\sphere-epochs') | Out-Null
  Copy-Item (Join-Path $repo 'public\sphere-epochs\*') (Join-Path $wt 'public\sphere-epochs\') -Force
  New-Item -ItemType Directory -Force (Join-Path $wt 'scripts\output\sphere-epochs') | Out-Null
  Copy-Item (Join-Path $repo 'scripts\output\sphere-epochs\*') (Join-Path $wt 'scripts\output\sphere-epochs\') -Force
  Push-Location $wt
  git add public/sphere-epochs scripts/output/sphere-epochs
  git commit -q -m "chore(sphere): manifest epoki sezonu (automat epoch.ps1, $stamp)"
  git push -q origin HEAD:master
  Pop-Location
  git worktree remove $wt --force | Out-Null
  "manifest opublikowany na master ($stamp)" | Tee-Object -FilePath $log -Append
}
