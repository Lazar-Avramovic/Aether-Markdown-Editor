# Unregister Aether file associations from Windows UI
[CmdletBinding()]
param()

$AppName = "Aether"
$AppProgId = "Aether.Markdown"
$Extensions = @(".md", ".markdown", ".mdown", ".mkd")

Write-Host "Unregistering Aether file associations from Windows..." -ForegroundColor Cyan

# Remove RegisteredApplications
Remove-ItemProperty -Path "HKCU:\Software\RegisteredApplications" -Name $AppName -ErrorAction SilentlyContinue
Remove-Item -Path "HKCU:\Software\Aether" -Recurse -Force -ErrorAction SilentlyContinue

# Remove ProgID
Remove-Item -Path "HKCU:\Software\Classes\$AppProgId" -Recurse -Force -ErrorAction SilentlyContinue

# Remove Application entry
Remove-Item -Path "HKCU:\Software\Classes\Applications\Aether.exe" -Recurse -Force -ErrorAction SilentlyContinue

# Remove App Paths
Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Aether.exe" -Recurse -Force -ErrorAction SilentlyContinue

# Remove from extensions
foreach ($ext in $Extensions) {
    Remove-ItemProperty -Path "HKCU:\Software\Classes\$ext\OpenWithProgids" -Name $AppProgId -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\$ext\OpenWithList\Aether.exe" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\$ext\OpenWithList\Aether.exe" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\OpenWithAether" -Recurse -Force -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithProgids" -Name $AppProgId -ErrorAction SilentlyContinue
}

# Flush shell cache
try {
    $code = @'
using System;
using System.Runtime.InteropServices;
public class ShellChangeNotifierUnreg {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
'@
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
    [ShellChangeNotifierUnreg]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {}

Write-Host "Successfully removed Aether file associations." -ForegroundColor Green
