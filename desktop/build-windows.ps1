$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$root=Split-Path $PSScriptRoot -Parent
$build=Join-Path $root 'build'
$stage=Join-Path $build 'stage'
$output=Join-Path $build 'output'
$downloads=Join-Path $build 'downloads'
if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
New-Item $stage,$output,$downloads,(Join-Path $stage 'runtime\python'),(Join-Path $stage 'desktop') -ItemType Directory -Force | Out-Null
# Complete source allowlist: excludes real .env, user records, build directories and Git metadata.
foreach($name in @('server.mjs','package.json','.env.example','.gitignore','README.md','START_SNIFF.cmd','UPDATE_README.txt')){Copy-Item (Join-Path $root $name) $stage}
foreach($name in @('lib','public','tools','desktop','db','test','.github')){Copy-Item (Join-Path $root $name) $stage -Recurse}
Copy-Item (Join-Path $PSScriptRoot 'INSTALL.txt') $stage
Get-ChildItem $stage -Directory -Recurse -Filter '__pycache__' | Remove-Item -Recurse -Force
$version=(Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$version | Set-Content (Join-Path $stage 'VERSION.txt') -Encoding ascii
$node=(Get-Command node -ErrorAction Stop).Source
$nodeVersion=(&$node --version).Trim()
if($nodeVersion -notmatch '^v22\.'){throw 'Node 22 is required for this build.'}
Copy-Item $node (Join-Path $stage 'runtime\node.exe')
$license=Join-Path (Split-Path $node -Parent) 'LICENSE'
if(!(Test-Path $license)){throw 'Node redistribution license is missing.'}
Copy-Item $license (Join-Path $stage 'runtime\NODE-LICENSE.txt')
$pythonVersion='3.13.16'
$pythonHash='97dae5274cc54867065e8d5a3226e48c35017ed332a0fdb0e27d5b5821961297'
$pythonZip=Join-Path $downloads "python-$pythonVersion-embed-amd64.zip"
Invoke-WebRequest "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip" -OutFile $pythonZip
if((Get-FileHash $pythonZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $pythonHash){throw 'Python checksum mismatch.'}
Expand-Archive $pythonZip (Join-Path $stage 'runtime\python') -Force
& (Join-Path $stage 'runtime\python\python.exe') -c "import sys; print(sys.version)"
if($LASTEXITCODE -ne 0){throw 'Bundled Python failed.'}
Add-Type -AssemblyName System.Drawing
$bitmap=New-Object System.Drawing.Bitmap 64,64
$g=[System.Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::FromArgb(22,61,48))
$font=New-Object System.Drawing.Font 'Arial',36,([System.Drawing.FontStyle]::Bold)
$brush=New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(201,227,161))
$format=New-Object System.Drawing.StringFormat
$format.Alignment=[System.Drawing.StringAlignment]::Center
$format.LineAlignment=[System.Drawing.StringAlignment]::Center
$g.DrawString('S',$font,$brush,(New-Object System.Drawing.RectangleF 0,0,64,64),$format)
$iconPath=Join-Path $stage 'SniffSolution.ico'
$icon=[System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream=[System.IO.File]::Create($iconPath)
$icon.Save($stream)
$stream.Dispose();$g.Dispose();$bitmap.Dispose();$font.Dispose();$brush.Dispose();$format.Dispose()
$csc=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(!(Test-Path $csc)){throw '.NET C# compiler is missing.'}
$cscArgs=@('/nologo','/target:winexe','/platform:x64','/optimize+',"/out:$(Join-Path $stage 'SniffSolution.exe')","/win32icon:$iconPath",'/reference:System.dll','/reference:System.Core.dll','/reference:System.Drawing.dll','/reference:System.Windows.Forms.dll','/reference:System.Web.Extensions.dll',(Join-Path $PSScriptRoot 'Launcher.cs'))
& $csc @cscArgs
if($LASTEXITCODE -ne 0){throw 'Launcher compilation failed.'}
$metadata=[ordered]@{application='Sniff Solution';version='0.1.2';source_commit=$env:GITHUB_SHA;node_version=$nodeVersion;node_sha256=(Get-FileHash (Join-Path $stage 'runtime\node.exe') -Algorithm SHA256).Hash.ToLowerInvariant();python_version=$pythonVersion;python_archive_sha256=$pythonHash;platform='Windows x64';code_signed=$false}
$metadata | ConvertTo-Json | Set-Content (Join-Path $stage 'build-info.json') -Encoding utf8
$iscc=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Inno Setup 6\ISCC.exe'
if(!(Test-Path $iscc)){throw 'Inno Setup 6 is missing.'}
& $iscc "/DStageDir=$stage" "/DOutputDirPath=$output" '/DAppVersion=0.1.2' (Join-Path $PSScriptRoot 'installer.iss')
if($LASTEXITCODE -ne 0){throw 'Installer compilation failed.'}
$installer=Join-Path $output 'Sniff-Solution-Setup-0.1.2-x64.exe'
if(!(Test-Path $installer)){throw 'Installer output is missing.'}
$hash=(Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  Sniff-Solution-Setup-0.1.2-x64.exe" | Set-Content (Join-Path $output 'SHA256SUMS.txt') -Encoding ascii
Copy-Item (Join-Path $PSScriptRoot 'INSTALL.txt') $output
Copy-Item (Join-Path $stage 'build-info.json') $output
Write-Host "Installer built: $installer"

