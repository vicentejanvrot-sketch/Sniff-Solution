SNIFF SOLUTION - COMPLETE APP FOLDER

1. Quit Sniff Solution using its tray icon beside the Windows clock.
   Closing only the browser is not enough.
2. Extract ALL files from this ZIP into your existing Sniff app folder.
   Choose Replace when Windows asks about existing application files.
3. Run START_SNIFF.cmd once from that folder.
   It updates the desktop/Start menu shortcuts to THIS copy and opens the app.
4. Check the version shown in the app. This package is version 0.1.2.
5. In Brand Studio > Add brand, enter a name and website.
   The Suggest from website button appears immediately below those fields.

This is a complete application folder, including the Windows launcher,
all current app code, Node.js and Python. No separate runtime installation
or setup executable is required.

Existing records and API settings in %LOCALAPPDATA%\SniffSolution are retained.
The ZIP includes only an empty .env.example template; it does not include an
.env file or user-data folders, so these are not overwritten.

If you were running source code from another folder, its local .data and .env
files are preserved when copying these files. They are not automatically
imported into the desktop launcher's %LOCALAPPDATA%\SniffSolution data folder.
Do not delete either location if you have records in both.

For AI suggestions, a provider key and model must be configured. Automatic
selection prefers Perplexity. Suggested content remains editable before Save.

Future updates will be delivered as a complete ZIP using this same layout.
