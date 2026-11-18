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
# Verify the actual release ZIP that users download, not just the staging folder.
$zips=@(Get-ChildItem (Join-Path $root 'build\release') -Filter 'Sniff-Solution-Windows-Full-App-*.zip')
if($zips.Count -ne 1){throw 'Expected exactly one complete app ZIP.'}
$zip=$zips[0].FullName
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[System.IO.Compression.ZipFile]::OpenRead($zip)
try{
 $names=@($archive.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
 foreach($name in $names){
  if($name -match '(^|/)\.env$' -or $name -match '(^|/)\.data/' -or $name -match '(^|/)(desktop\.url|desktop-owner\.json|workspace\.json)$'){throw "Complete ZIP contains private or user data: $name"}
 }
 foreach($required in @('SniffSolution.exe','START_SNIFF.cmd','VERSION.txt','build-info.json','package.json','runtime/node.exe','runtime/python/python.exe','public/app.js','public/planner.js','public/analytics.js','lib/planner.mjs','lib/insights.mjs','lib/analytics.mjs','db/phase4_insights.sql','PHASE4_TEST_GUIDE.md','desktop/server-runner.mjs','PHASE1_TEST_GUIDE.md','PHASE2_TEST_GUIDE.md','PHASE3_CALENDAR_TEST_GUIDE.md','PHASE3_LIVE_PUBLISHING.md','AGENTS.md','runtime/ffmpeg/ffmpeg.exe','runtime/ffmpeg/LICENSE','public/thumbnails.js','public/dictation.js','public/production.js','public/reconciliation.js','public/timing.js','public/video-brief.js','lib/video-brief.mjs','lib/fonts.mjs','lib/production.mjs')){
  if($names -notcontains $required){throw "Complete ZIP is missing $required at its top level."}
 }
}finally{$archive.Dispose()}
Write-Host "Complete ZIP entries: $($names.Count)"
Expand-Archive $zip $appDir -Force
foreach($file in @('SniffSolution.exe','START_SNIFF.cmd','UPDATE_README.txt','VERSION.txt','.env.example','runtime\node.exe','runtime\python\python.exe','server.mjs','lib\website.mjs','lib\brand-research.mjs','public\app.js','desktop\create-shortcuts.ps1')){
 if(!(Test-Path (Join-Path $appDir $file))){throw "Complete package is missing $file."}
}
if(!(Select-String -Path (Join-Path $appDir 'public\app.js') -SimpleMatch 'Suggest from website')){throw 'Latest brand button is missing from the packaged UI.'}
if((Get-Content (Join-Path $appDir '.env') -Raw).Trim() -ne 'KEEP_MY_EXISTING_CONFIGURATION=yes'){throw 'Overlay replaced existing configuration.'}
if((Get-Content (Join-Path $appDir '.data\keep.txt') -Raw).Trim() -ne 'keep my local records'){throw 'Overlay replaced existing local data.'}
# Verify the package works without setup.exe, including Python and record persistence.
$env:SNIFF_SMOKE_HOME=$dataHome
foreach($mode in @('write','read')){
 $proc=Start-Process (Join-Path $appDir 'SniffSolution.exe') -ArgumentList "--smoke-test-$mode" -PassThru -WindowStyle Hidden
 if(!$proc.WaitForExit(120000)){Stop-Process -Id $proc.Id -Force;throw 'Full-package startup timed out.'}
 if($proc.ExitCode -ne 0){
  if(Test-Path (Join-Path $dataHome 'desktop.log')){Get-Content (Join-Path $dataHome 'desktop.log') -Tail 30}
  throw "Full-package smoke test failed: $mode"
 }
}
# Run the same shortcut helper START_SNIFF.cmd uses, through stock Windows PowerShell.
$helper=Join-Path $appDir 'desktop\create-shortcuts.ps1'
$proc=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$helper+'"')) -Wait -PassThru -WindowStyle Hidden
if($proc.ExitCode -ne 0){throw 'Shortcut updater failed.'}
$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('DesktopDirectory')
$link=$shell.CreateShortcut((Join-Path $desktop 'Sniff Solution.lnk'))
if($link.TargetPath -ne (Join-Path $appDir 'SniffSolution.exe')){throw 'Shortcut still points to an older app folder.'}
$expectedVersion=(Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
if((Get-Content (Join-Path $appDir 'package.json') -Raw | ConvertFrom-Json).version -ne $expectedVersion){throw 'Packaged package.json version is incorrect.'}
if((Get-Content (Join-Path $appDir 'VERSION.txt') -Raw).Trim() -ne $expectedVersion){throw 'Visible package version is incorrect.'}
$info=Get-Content (Join-Path $appDir 'build-info.json') -Raw | ConvertFrom-Json
if($info.version -ne $expectedVersion){throw 'build-info.json version is incorrect.'}
$expectedCommit=$env:GITHUB_SHA
if([string]::IsNullOrWhiteSpace($expectedCommit)){$expectedCommit=(& git -C $root rev-parse HEAD).Trim()}
if($info.source_commit -ne $expectedCommit){throw "build-info.json commit $($info.source_commit) does not match $expectedCommit."}
if((Split-Path $zip -Leaf) -ne "Sniff-Solution-Windows-Full-App-$expectedVersion-$($expectedCommit.Substring(0,7)).zip"){throw 'ZIP name does not identify the version and commit.'}
if(!(Select-String -Path (Join-Path $appDir 'public\app.js') -SimpleMatch 'dialog-version')){throw 'Brand dialog version badge is missing.'}
Write-Host "Verified version $expectedVersion from commit $expectedCommit"
Write-Host 'Full app ZIP verified: all sources/runtimes, latest website button, standalone launcher, current server version, overwrite-safe configuration/data and desktop shortcut pointing at the extracted folder.'


$env:FFMPEG=Join-Path $appDir "runtime\ffmpeg\ffmpeg.exe"
& (Join-Path $appDir "runtime\node.exe") --test (Join-Path $appDir "test\production.test.mjs") (Join-Path $appDir "test\fonts.test.mjs")
if($LASTEXITCODE -ne 0){throw "Packaged production and real renderer tests failed."}
