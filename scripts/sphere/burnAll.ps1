# SPHERE - "wypalamy wszystko": oproznia kolejke auto-burna w kilku rundach.
#
#   powershell -ExecutionPolicy Bypass -File scripts\sphere\burnAll.ps1
#
# Hook wydaje na jedno wywolanie tylko tyle, ile miesci sie w 1.5% ruchu
# sqrtP (~3% ceny) - to jest w kontrakcie i nie da sie tego zmienic. Ten
# skrypt wola executeBuyback do 10 razy z 30 s przerwy, az w kolejce zostanie
# < 0.002 ETH. Kazda kolejna runda kupuje drozej - to swiadoma decyzja
# wlasciciela (2.09.2026), codzienny tryb to keeper.ps1 co godzine.
# Poza burnem robi to samo, co keeper.ps1 (dostawy, escrow, vesting).

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$env:TOKENS      = '0xB200000000000000000000BA5eDb84c678432476'
$env:SAFE        = '0x83E2DE974FC6B866FDb78AEFa5596d58fDc4142F'
$env:REWARDS     = '0x9030e53E7AC1bc81Cf28b196BA336E5544ce4A47'
$env:ESCROW      = '0xe984986f4F1E067f697b548D5fe942813d03Da37'
$env:VESTING     = '0xB5dE95224F2bEDee2e7Ca7170F5B6a02641255AD'
$env:BUYBACK     = '0x98e51f42245Bf9A0b1e0005510aEE82C52bE8A7b'
$env:DISTRIBUTOR = '0xc0b018161bB48383c808Aa47923f5501758D3E9D'
$env:TRANCHE_ETH = '0.05'
$env:BURN_ROUNDS = '10'
$env:BURN_PAUSE_S = '30'
# RPC wybiera hardhat.config (wezel Coinbase z klucza w .env.local).
$env:KEEPER_CONFIRM = 'tak'

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$log = Join-Path $PWD 'scripts\output\keeper.log'
"=== $stamp (burnAll) ===" | Out-File -FilePath $log -Append -Encoding utf8
npm run sphere:keeper 2>&1 | Tee-Object -FilePath $log -Append
