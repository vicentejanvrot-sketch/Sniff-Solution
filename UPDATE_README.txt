SNIFF SOLUTION - COMPLETE APP FOLDER

This ZIP is the complete runnable Windows app: SniffSolution.exe,
START_SNIFF.cmd, all app files, and bundled Node.js, Python, FFmpeg and FFprobe.
VERSION.txt and build-info.json show its version and source commit.
This update is version 0.2.4. PHASE2_TEST_GUIDE.md contains the complete
step-by-step acceptance tests and remaining external requirements.
(GitHub "Code > Download ZIP" / "Source code" archives are NOT this app.)

UPDATE
1. Quit Sniff Solution: right-click its tray icon beside the Windows clock
   and choose "Quit Sniff Solution". Closing the browser is not enough.
2. Extract ALL files from this ZIP into your Sniff app folder.
   Choose Replace when Windows asks about existing application files.
3. Run START_SNIFF.cmd from that same folder. It points the desktop and
   Start menu shortcuts at THIS folder, lists any other Sniff copy that is
   running or installed, and opens the app.
4. Confirm the version badge (top right, and next to "Create a brand")
   matches VERSION.txt. In Brand Studio > Add brand, "Suggest from website"
   appears right below the Brand name and Website fields.

IF AN OLDER COPY IS STILL RUNNING
Opening this copy while another copy or version is running in the tray
shows both folders and versions and offers to close the running copy.
Its server finishes any request in progress first. Settings and records
are kept. It never closes other Node.js programs.

OLDER INSTALLED COPY
If you once used the setup installer, a copy may remain in
%LOCALAPPDATA%\Programs\Sniff Solution. START_SNIFF.cmd repoints your
shortcuts away from it. You may uninstall it from Windows Settings > Apps;
your data is kept.

YOUR DATA
Records, API settings (.env) and logs stay in %LOCALAPPDATA%\SniffSolution.
The ZIP contains only an empty .env.example; it has no .env or user data,
so extracting it never overwrites them. A .env or .data folder inside a
source-code folder is separate and is not imported automatically.

For AI suggestions, a provider key and model must be configured (tray menu >
Edit API settings, then Settings & Costs). Suggestions stay editable and
nothing is saved until you choose Save brand.
