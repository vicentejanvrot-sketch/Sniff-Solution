#ifndef AppVersion
  #define AppVersion "0.1.5"
#endif
#ifndef StageDir
  #define StageDir "..\build\stage"
#endif
#ifndef OutputDirPath
  #define OutputDirPath "..\build\output"
#endif

[Setup]
AppId={{12A9CF20-6E47-4A0A-A904-8AF5FE90EAF5}
AppName=Sniff Solution
AppVersion={#AppVersion}
AppPublisher=Lantern Studios
DefaultDirName={localappdata}\Programs\Sniff Solution
DefaultGroupName=Sniff Solution
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
AppMutex=SniffSolutionDesktop
OutputDir={#OutputDirPath}
OutputBaseFilename=Sniff-Solution-Setup-{#AppVersion}-x64
SetupIconFile={#StageDir}\SniffSolution.ico
UninstallDisplayIcon={app}\SniffSolution.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\Sniff Solution"; Filename: "{app}\SniffSolution.exe"; WorkingDir: "{app}"
Name: "{group}\Sniff Solution"; Filename: "{app}\SniffSolution.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\SniffSolution.exe"; Description: "Open Sniff Solution"; Flags: nowait postinstall skipifsilent

; Data and .env are in the user's LocalAppData\SniffSolution folder.
; They are deliberately outside {app} and are never deleted by this installer.

