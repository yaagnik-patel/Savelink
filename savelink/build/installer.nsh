!macro customInstall
  CreateShortcut "$SMSTARTUP\SaveLink.lnk" "$INSTDIR\SaveLink.exe" "" "$INSTDIR\SaveLink.exe" 0
!macroend

!macro customUnInstall
  Delete "$SMSTARTUP\SaveLink.lnk"
!macroend
