$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=Split-Path $PSScriptRoot -Parent
$stage=Join-Path $root 'build\stage'
$testRoot=Join-Path $env:RUNNER_TEMP 'Sniff complete ZIP verification'
$appDir=Join-Path $testRoot 'Existing App Folder'
$dataHome=Join-Path $testRoot 'Existing User Data'
New-Item $appDir -ItemType Directory -Force | Out-Null
# Simulate an older copy with configuration and local records before overlaying the full package.
New-Item (Join-Path $appDir 'public'),(Join-Path $appDir '.data') -ItemType Directory -Force | Out-Null
'old application file' | Set-Content (Join-Path $appDir 'public\app.js')
'KEEP_MY_EXISTING_CONFIGURATION=yes' | Set-Content (Join-Path $appDir '.env')
'keep my local records' | Set-Content (Join-Path $appDir '.data\keep.txt')
if(Test-Path (Join-Path $stage '.env')){throw 'Full package must not contain a user .env.'}
if(Test-Path (Join-Path $stage '.data')){throw 'Full package must not contain a user-data directory.'}
Copy-Item (Join-Path $stage '*') $appDir -Recurse -Force
foreach($file in @('SniffSolution.exe','START_SNIFF.cmd','UPDATE_README.txt','VERSION.txt','.env.example','runtime\node.exe','runtime\python\python.exe','server.mjs','lib\website.mjs','lib\brand-research.mjs','public\app.js','desktop\create-shortcuts.ps1')){
 if(!(Test-Path (Join-Path $appDir $file))){throw "Complete package is missing $file."}
}
if(!(Select-String -Path (Join-Path $appDir 'public\app.js') -SimpleMatch 'Suggest from website')){throw 'Latest brand button is missing from the packaged UI.'}
if((Get-Content (Join-Path $appDir '.env') -Raw).Trim() -ne 'KEEP_MY_EXISTING_CONFIGURATION=yes'){throw 'Overlay replaced existing configuration.'}
if((Get-Content (Join-Path $appDir '.data\keep.txt') -Raw).Trim() -ne 'keep my local records'){throw 'Overlay replaced existing local data.'}
# Verify the package works without setup.exe, including Python and record persistence.
$env:SNIFF_SMOKE_HOME=$dataHome
foreach($mode in @('write','read')){
 $proc=Start-Process (Join-Path $appDir 'SniffSolution.exe') -ArgumentList "--smoke-test-$mode" -PassThru
 if(!$proc.WaitForExit(120000)){Stop-Process -Id $proc.Id -Force;throw 'Full-package startup timed out.'}
 if($proc.ExitCode -ne 0){
  if(Test-Path (Join-Path $dataHome 'desktop.log')){Get-Content (Join-Path $dataHome 'desktop.log') -Tail 30}
  throw "Full-package smoke test failed: $mode"
 }
}
# Run the same shortcut helper START_SNIFF.cmd uses, through stock Windows PowerShell.
$helper=Join-Path $appDir 'desktop\create-shortcuts.ps1'
$proc=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$helper+'"')) -Wait -PassThru
if($proc.ExitCode -ne 0){throw 'Shortcut updater failed.'}
$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('DesktopDirectory')
$link=$shell.CreateShortcut((Join-Path $desktop 'Sniff Solution.lnk'))
if($link.TargetPath -ne (Join-Path $appDir 'SniffSolution.exe')){throw 'Shortcut still points to an older app folder.'}
$expectedVersion=(Get-Content (Join-Path $appDir 'package.json') -Raw | ConvertFrom-Json).version
if((Get-Content (Join-Path $appDir 'VERSION.txt') -Raw).Trim() -ne $expectedVersion){throw 'Visible package version is incorrect.'}
Write-Host 'Full app ZIP verified: all sources/runtimes, latest website button, standalone launcher, current server version, overwrite-safe configuration/data and desktop shortcut pointing at the extracted folder.'

