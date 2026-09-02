# SPHERE keeper - komplet adresow Base mainnet, uruchomienie na zywo.
#
# Reczne odpalenie (z katalogu repo):
#   powershell -ExecutionPolicy Bypass -File scripts\sphere\keeper.ps1
#
# Co godzine przez Task Scheduler (jednorazowo, w PowerShellu jako Ty):
#   schtasks /Create /TN "SPHERE keeper" /SC HOURLY /TR "powershell -ExecutionPolicy Bypass -File \"$PWD\scripts\sphere\keeper.ps1\"" /F
# Zatrzymanie:  schtasks /Delete /TN "SPHERE keeper" /F
#
# Klucz bierze hardhat z .env.local (ADMIN_PRIVATE_KEY) - ten sam, ktory jest
# CHECKPOINTEREM SphereBuyback, wiec checkpoint odswieza sie sam.
# Logi: scripts\output\keeper.log (dopisywane).

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$env:TOKENS      = '0xB200000000000000000000BA5eDb84c678432476'   # SPHERE
$env:SAFE        = '0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F'
$env:REWARDS     = '0x9030e53E7AC1bc81Cf28b196BA336E5544ce4A47'
$env:ESCROW      = '0xe984986f4F1E067f697b548D5fe942813d03Da37'
$env:VESTING     = '0xB5dE95224F2bEDee2e7Ca7170F5B6a02641255AD'
$env:BUYBACK     = '0x98e51f42245Bf9A0b1e0005510aEE82C52bE8A7b'   # faza 1B
$env:DISTRIBUTOR = '0xc0b018161bB48383c808Aa47923f5501758D3E9D'   # faza 1B
$env:TRANCHE_ETH = '0.05'
# Jeden staly wezel zamiast load-balansowanego mainnet.base.org - ten mieszal
# stan miedzy wezlami (sphereToken()=0x0 po launchu, panic 0x11 przy execute).
# (publicnode odpadl: odpytywanie o paragon tx liczy jako "archive request")
if (-not $env:BASE_RPC_URL) { $env:BASE_RPC_URL = 'https://base.drpc.org' }
$env:KEEPER_CONFIRM = 'tak'

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$log = Join-Path $PWD 'scripts\output\keeper.log'
"=== $stamp ===" | Out-File -FilePath $log -Append -Encoding utf8
npm run sphere:keeper 2>&1 | Tee-Object -FilePath $log -Append
