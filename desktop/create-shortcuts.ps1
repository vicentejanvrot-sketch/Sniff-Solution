param([switch]$OpenApp)
$ErrorActionPreference='Stop'
$root=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target=Join-Path $root 'SniffSolution.exe'
if(!(Test-Path $target)){throw 'SniffSolution.exe is missing. Extract all files from the complete ZIP first. (GitHub "Code > Download ZIP" is source code only, not the runnable app.)'}
function Get-SniffVersion([string]$folder){
 try{return (Get-Content (Join-Path $folder 'package.json') -Raw | ConvertFrom-Json).version}catch{return 'unknown'}
}
$version=Get-SniffVersion $root
$commit='unknown'
try{$commit=(Get-Content (Join-Path $root 'build-info.json') -Raw | ConvertFrom-Json).source_commit}catch{}
Write-Host "This app folder: $root"
Write-Host "Version $version, source commit $commit"
Write-Host ''

# Report (never close) other running Sniff copies. SniffSolution.exe offers to close an older copy itself.
$running=@(Get-Process -Name SniffSolution -ErrorAction SilentlyContinue)
foreach($process in $running){
 $path=$null;try{$path=$process.Path}catch{}
 if($path){
  $folder=Split-Path $path -Parent
  Write-Host "Running now: Sniff Solution $(Get-SniffVersion $folder) from $folder"
 }else{Write-Host "Running now: Sniff Solution (process $($process.Id))"}
}
if($running.Count -gt 0){Write-Host 'When this copy opens, it will offer to close the running copy. Your settings and records are kept.';Write-Host ''}

# An installer-based copy may also exist. It is left in place, but shortcuts stop pointing at it.
$installed=Join-Path $env:LOCALAPPDATA 'Programs\Sniff Solution'
if((Test-Path (Join-Path $installed 'SniffSolution.exe')) -and ([System.IO.Path]::GetFullPath($installed).TrimEnd('\') -ine $root.TrimEnd('\'))){
 Write-Host "Note: an installed copy, version $(Get-SniffVersion $installed), is also in $installed"
 Write-Host 'Shortcuts will open THIS folder instead. You may uninstall that copy from Windows Settings > Apps; your data in %LOCALAPPDATA%\SniffSolution is kept.'
 Write-Host ''
}

$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('DesktopDirectory')
$programs=Join-Path ([Environment]::GetFolderPath('Programs')) 'Sniff Solution'
New-Item $programs -ItemType Directory -Force | Out-Null
foreach($file in @((Join-Path $desktop 'Sniff Solution.lnk'),(Join-Path $programs 'Sniff Solution.lnk'))){
 if(Test-Path $file){
  $previous=$shell.CreateShortcut($file).TargetPath
  if($previous -and ($previous -ine $target)){Write-Host "Shortcut $file previously opened: $previous"}
 }
 $link=$shell.CreateShortcut($file)
 $link.TargetPath=$target
 $link.WorkingDirectory=$root
 $link.IconLocation=(Join-Path $root 'SniffSolution.ico')
 $link.Description="Open Sniff Solution $version from this complete app folder"
 $link.Save()
}
Write-Host "Desktop and Start menu shortcuts now point to: $target"
if($OpenApp){Start-Process -FilePath $target -WorkingDirectory $root}
