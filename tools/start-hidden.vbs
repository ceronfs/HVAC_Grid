' HVAC Grid: runs tools\launch.cjs without a console window (HVAC_Grid.bat starts this). Arguments go through (the port).
' Node.js: runtime\node.exe when the folder has one (the copy for a closed network), else node on PATH.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
a = ""
For Each x In WScript.Arguments
  a = a & " " & x
Next
n = "node"
If fso.FileExists(sh.CurrentDirectory & "\runtime\node.exe") Then n = """" & sh.CurrentDirectory & "\runtime\node.exe"""
sh.Run n & " tools\launch.cjs" & a, 0, False
