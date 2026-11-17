# Sniff Solution App

- Phase 2 may run locally until go-live. Render is the user's chosen future cloud processing provider; do not provision cloud services during local completion.

- After implementing a requested change and passing the relevant checks, merge the completed code into `main`. The user has explicitly authorized this workflow; do not leave completed updates only on development branches.
- Every implementation must deliver a complete, ready-to-run Windows app ZIP containing all current application files, the launcher and bundled runtimes. A patch-only ZIP or installer-only ZIP is not a sufficient sole deliverable.
- Confirm the complete ZIP is built from the merged main revision and provide its download link. GitHub's Code > Download ZIP is the source archive; the GitHub Release asset Sniff-Solution-Windows-Full-App-<version>-<commit>.zip (also attached to the Windows workflow run as an artifact) is the runnable distribution.
- Preserve existing user configuration and records. Never package a real `.env`, API keys, `.data`, or personal application data. Support overwriting app files without overwriting these records.
- Keep the running version visible, and include clear quit, overwrite, restart and shortcut instructions with full app ZIP updates.
