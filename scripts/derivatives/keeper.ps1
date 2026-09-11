# Keeper perpow na Arc Testnet - funding i likwidacje, uruchomienie na zywo.
#
# Reczne odpalenie (z katalogu repo):
#   powershell -ExecutionPolicy Bypass -File scripts\derivatives\keeper.ps1
#
# Co 15 minut przez Task Scheduler (jednorazowo, w PowerShellu jako Ty):
#   schtasks /Create /TN "Perps keeper Arc" /SC MINUTE /MO 15 /TR "powershell -ExecutionPolicy Bypass -File \"$PWD\scripts\derivatives\keeper.ps1\"" /F
# Zatrzymanie:  schtasks /Delete /TN "Perps keeper Arc" /F
#
# Klucz bierze hardhat z .env.local (ADMIN_PRIVATE_KEY) - portfel
# 0xD4885A5aa53446843CABcDE1F35DE9b4E906030e, ten sam co deployer modulu.
# Gaz na Arc to USDC (to samo saldo, co kolateral) - prog alarmu w USDC.
# Logi: scripts\output\perps-keeper.log (dopisywane).

$ErrorActionPreference = 'Continue'
Set-Location (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

$env:KEEPER_CONFIRM = 'tak'
if (-not $env:GAS_ALERT_USDC) { $env:GAS_ALERT_USDC = '1' }

$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$log = Join-Path $PWD 'scripts\output\perps-keeper.log'
"=== $stamp ===" | Out-File -FilePath $log -Append -Encoding utf8
$out = npm run perps:keeper 2>&1 | ForEach-Object { "$_" }
$out | Out-File -FilePath $log -Append -Encoding utf8
$out

# Alarm gazu jak w scripts\sphere\keeper.ps1: znacznik + toast najwyzej raz na 12 h.
$alertLine = $out | Where-Object { $_ -match 'GAZ NISKI|insufficient funds|INSUFFICIENT_FUNDS' } | Select-Object -First 1
if ($alertLine) {
  $marker = Join-Path $PWD 'scripts\output\PERPS-GAZ-NISKI.txt'
  $recent = (Test-Path $marker) -and ((Get-Date) - (Get-Item $marker).LastWriteTime).TotalHours -lt 12
  "$stamp $alertLine" | Out-File -FilePath $marker -Append -Encoding utf8
  if (-not $recent) {
    try {
      [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
      [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
      $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
      $safeText = [System.Security.SecurityElement]::Escape("$alertLine")
      $xml.LoadXml("<toast scenario=`"reminder`"><visual><binding template=`"ToastGeneric`"><text>Perps keeper Arc: konczy sie gaz (USDC)</text><text>$safeText</text><text>Doladuj 0xD4885A5aa53446843CABcDE1F35DE9b4E906030e na Arc Testnet (faucet.circle.com).</text></binding></visual></toast>")
      $toast = New-Object Windows.UI.Notifications.ToastNotification $xml
      [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show($toast)
      "$stamp toast: alarm gazu pokazany" | Out-File -FilePath $log -Append -Encoding utf8
    } catch {
      "$stamp toast nieudany: $($_.Exception.Message)" | Out-File -FilePath $log -Append -Encoding utf8
    }
  }
}
