$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=Split-Path $PSScriptRoot -Parent
$installer=Join-Path $root 'build\output\Sniff-Solution-Setup-0.1.1-x64.exe'
$testRoot=Join-Path $env:RUNNER_TEMP 'Sniff installer verification'
$installDir=Join-Path $testRoot 'Installed Application'
$dataHome=Join-Path $testRoot 'User Data'
New-Item $testRoot -ItemType Directory -Force | Out-Null
$env:SNIFF_SMOKE_HOME=$dataHome
function Install-Application {
 $arguments=@('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',('/DIR="'+$installDir+'"'))
 $proc=Start-Process $installer -ArgumentList $arguments -Wait -PassThru
 if($proc.ExitCode -ne 0){throw "Installer exited with code $($proc.ExitCode)."}
}
function Invoke-DesktopSmoke([string]$mode){
 $launcher=Join-Path $installDir 'SniffSolution.exe'
 $proc=Start-Process $launcher -ArgumentList "--smoke-test-$mode" -PassThru
 if(!$proc.WaitForExit(120000)){Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue;throw "Desktop smoke '$mode' timed out."}
 if($proc.ExitCode -ne 0){
  if(Test-Path (Join-Path $dataHome 'desktop.log')){Get-Content (Join-Path $dataHome 'desktop.log') -Tail 30}
  throw "Desktop smoke '$mode' failed with code $($proc.ExitCode)."
 }
 if(Test-Path (Join-Path $dataHome 'data\workspace.lock')){throw 'Lock remains after clean shutdown.'}
}
Install-Application
$desktop=[Environment]::GetFolderPath('DesktopDirectory')
$desktopShortcut=Join-Path $desktop 'Sniff Solution.lnk'
if(!(Test-Path $desktopShortcut)){throw 'Desktop shortcut was not created.'}
$shell=New-Object -ComObject WScript.Shell
$shortcut=$shell.CreateShortcut($desktopShortcut)
if($shortcut.TargetPath -ne (Join-Path $installDir 'SniffSolution.exe')){throw 'Shortcut target is incorrect.'}
$programs=[Environment]::GetFolderPath('Programs')
if(!(Test-Path (Join-Path $programs 'Sniff Solution\Sniff Solution.lnk'))){throw 'Start menu shortcut was not created.'}
Invoke-DesktopSmoke 'write'
$before=(Get-FileHash (Join-Path $dataHome '.env') -Algorithm SHA256).Hash
Install-Application
Invoke-DesktopSmoke 'read'
$after=(Get-FileHash (Join-Path $dataHome '.env') -Algorithm SHA256).Hash
if($before -ne $after){throw 'Reinstall changed configuration.'}
# Simulate an interrupted desktop server, with a confirmed dead PID.
$dead=Start-Process $env:ComSpec -ArgumentList '/c exit 0' -Wait -PassThru
@{pid=$dead.Id;startedAt='interrupted-smoke-test'} | ConvertTo-Json | Set-Content (Join-Path $dataHome 'desktop-owner.json') -Encoding utf8NoBOM
'' | Set-Content (Join-Path $dataHome 'data\workspace.lock') -NoNewline
Invoke-DesktopSmoke 'read'
$uninstall=Start-Process (Join-Path $installDir 'unins000.exe') -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait -PassThru
if($uninstall.ExitCode -ne 0){throw 'Uninstall failed.'}
if(!(Test-Path (Join-Path $dataHome 'data\workspace.json'))){throw 'Uninstall removed user data.'}
if(!(Test-Path (Join-Path $dataHome '.env'))){throw 'Uninstall removed configuration.'}
Write-Host 'Installer verification passed: desktop/start-menu shortcuts, bundled runtimes, Python tools, persistence across reinstall/restart, stale desktop-lock recovery, clean shutdown and retained user files.'

