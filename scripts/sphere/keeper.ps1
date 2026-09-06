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
# RPC: hardhat.config sam wybiera dedykowany wezel Coinbase (klucz OnchainKit
# z .env.local). Publiczne wezly odpadly: mainnet.base.org mieszal stan,
# publicnode blokowal paragony, drpc dawal 429. BASE_RPC_URL nadal nadpisuje.
$env:KEEPER_CONFIRM = 'tak'
# Prog alarmu gazu (ETH); mozna nadpisac z zewnatrz: $env:GAS_ALERT_ETH='0.01'.
if (-not $env:GAS_ALERT_ETH) { $env:GAS_ALERT_ETH = '0.001' }

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$log = Join-Path $PWD 'scripts\output\keeper.log'
# Jedno kodowanie (UTF-8) dla naglowka i tresci - Tee-Object w PS 5.1 pisze
# UTF-16 i log wygladal jak "s p a c j e" miedzy literami.
"=== $stamp ===" | Out-File -FilePath $log -Append -Encoding utf8
$out = npm run sphere:keeper 2>&1 | ForEach-Object { "$_" }
$out | Out-File -FilePath $log -Append -Encoding utf8
$out

# Alarm gazu. Wlasciciel nie doladowuje z wyprzedzeniem ("jak sie skonczy, daj
# znac" - 6.09.2026). sphereKeeper.ts drukuje "GAZ NISKI" ponizej progu, a przy
# pustym portfelu ethers rzuca "insufficient funds". Tu: znacznik w
# scripts\output\GAZ-NISKI.txt (kazdy bieg) + powiadomienie Windows (najwyzej
# raz na 12 h, zeby nie meczyc co godzine). Zadanie jest "Interactive only",
# wiec toast trafia na pulpit zalogowanego uzytkownika.
$alertLine = $out | Where-Object { $_ -match 'GAZ NISKI|insufficient funds|INSUFFICIENT_FUNDS' } | Select-Object -First 1
if ($alertLine) {
  $marker = Join-Path $PWD 'scripts\output\GAZ-NISKI.txt'
  $recent = (Test-Path $marker) -and ((Get-Date) - (Get-Item $marker).LastWriteTime).TotalHours -lt 12
  "$stamp $alertLine" | Out-File -FilePath $marker -Append -Encoding utf8
  if (-not $recent) {
    try {
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $safeText = [System.Security.SecurityElement]::Escape("$alertLine")
      $xml.LoadXml("<toast scenario=`"reminder`"><visual><binding template=`"ToastGeneric`"><text>SPHERE keeper: konczy sie gaz</text><text>$safeText</text><text>Doladuj 0xD4885A5aa53446843CABcDE1F35DE9b4E906030e na Base (np. 0.02 ETH ze Safe).</text></binding></visual></toast>")
      $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show($toast)
      "$stamp toast: alarm gazu pokazany" | Out-File -FilePath $log -Append -Encoding utf8
    } catch {
      "$stamp toast nieudany: $($_.Exception.Message)" | Out-File -FilePath $log -Append -Encoding utf8
    }
  }
}
