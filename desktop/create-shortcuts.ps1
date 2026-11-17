param([switch]$OpenApp)
$ErrorActionPreference='Stop'
$root=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target=Join-Path $root 'SniffSolution.exe'
if(!(Test-Path $target)){throw 'SniffSolution.exe is missing. Extract all files from the complete ZIP first.'}
if(Get-Process -Name SniffSolution -ErrorAction SilentlyContinue){
 Write-Host 'Sniff Solution is still running. Quit it from the tray icon beside the clock, then run START_SNIFF.cmd again.'
 exit 1
}
$shell=New-Object -ComObject WScript.Shell
$desktop=[Environment]::GetFolderPath('DesktopDirectory')
$programs=Join-Path ([Environment]::GetFolderPath('Programs')) 'Sniff Solution'
New-Item $programs -ItemType Directory -Force | Out-Null
foreach($file in @((Join-Path $desktop 'Sniff Solution.lnk'),(Join-Path $programs 'Sniff Solution.lnk'))){
 $link=$shell.CreateShortcut($file)
 $link.TargetPath=$target
 $link.WorkingDirectory=$root
 $link.IconLocation=(Join-Path $root 'SniffSolution.ico')
 $link.Description='Open Sniff Solution from this complete app folder'
 $link.Save()
}
Write-Host "Desktop and Start menu shortcuts now point to: $target"
if($OpenApp){Start-Process -FilePath $target -WorkingDirectory $root}

