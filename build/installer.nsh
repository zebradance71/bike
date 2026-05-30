; Ninja2 NSIS installer hooks.
;
; The app registers itself into HKCU\Software\Microsoft\Windows\CurrentVersion\Run
; at runtime via Electron's setLoginItemSettings(). Make sure uninstalling
; the app also clears that entry so the user's startup list doesn't end
; up with a broken shortcut to a deleted executable.
;
; `deleteAppDataOnUninstall` is intentionally `false` in package.json so
; users keep their settings.json / blocked-host list if they reinstall.

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Ninja2"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.toriilabs.ninja2"
!macroend
