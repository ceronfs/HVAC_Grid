' HVAC Grid: runs tools\launch.cjs without a console window (HVAC_Grid.bat starts this). Arguments go through (the port).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
a = ""
For Each x In WScript.Arguments
  a = a & " " & x
Next
sh.Run "node tools\launch.cjs" & a, 0, False
