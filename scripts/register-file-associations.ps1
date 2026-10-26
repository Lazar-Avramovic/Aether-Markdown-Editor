# Register Aether as a Markdown file handler in Windows UI
[CmdletBinding()]
param()

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path "$ScriptDir\..").Path
$AppExe = Join-Path $ProjectRoot "dist\Aether-win32-x64\Aether.exe"
$AppIcon = Join-Path $ProjectRoot "icon.ico"
$AppName = "Aether"
$AppProgId = "Aether.Markdown"
$AppDescription = "Zero-gravity Liquid Glass Markdown Editor"

Write-Host "Registering Aether file associations in Windows..." -ForegroundColor Cyan

if (-not (Test-Path $AppExe)) {
    Write-Error "Aether executable not found at: $AppExe`nPlease run 'npm run build' first to create the packaged executable."
    exit 1
}

$IconPath = if (Test-Path $AppIcon) { "$AppIcon" } else { "$AppExe,0" }
$CommandStr = "`"$AppExe`" `"%1`""
$Extensions = @(".md", ".markdown", ".mdown", ".mkd")

function Ensure-Key($path) {
    if (-not (Test-Path $path)) {
        New-Item -Path $path -Force | Out-Null
    }
}

# 1. Register Application in HKCU\Software\Classes\Applications\Aether.exe
$AppRegPath = "HKCU:\Software\Classes\Applications\Aether.exe"
Ensure-Key $AppRegPath
Set-ItemProperty -Path $AppRegPath -Name "(Default)" -Value "Aether - Liquid Glass Markdown Editor"
Set-ItemProperty -Path $AppRegPath -Name "FriendlyAppName" -Value $AppName
Set-ItemProperty -Path $AppRegPath -Name "ApplicationCompany" -Value "Antigravity"

$AppSupportedPath = "$AppRegPath\SupportedTypes"
Ensure-Key $AppSupportedPath
foreach ($ext in $Extensions) {
    Set-ItemProperty -Path $AppSupportedPath -Name $ext -Value ""
}

$AppIconPath = "$AppRegPath\DefaultIcon"
Ensure-Key $AppIconPath
Set-ItemProperty -Path $AppIconPath -Name "(Default)" -Value "$AppExe,0"

$AppCmdPath = "$AppRegPath\shell\open\command"
Ensure-Key $AppCmdPath
Set-ItemProperty -Path $AppCmdPath -Name "(Default)" -Value $CommandStr

# 2. Register ProgID in HKCU\Software\Classes\Aether.Markdown
$ProgIdPath = "HKCU:\Software\Classes\$AppProgId"
Ensure-Key $ProgIdPath
Set-ItemProperty -Path $ProgIdPath -Name "(Default)" -Value "Markdown Document"
Set-ItemProperty -Path $ProgIdPath -Name "FriendlyTypeName" -Value "Markdown Document"
Set-ItemProperty -Path $ProgIdPath -Name "AppUserModelId" -Value "Antigravity.Aether"

$ProgIdIcon = "$ProgIdPath\DefaultIcon"
Ensure-Key $ProgIdIcon
Set-ItemProperty -Path $ProgIdIcon -Name "(Default)" -Value "$AppExe,0"

$ProgIdCmd = "$ProgIdPath\shell\open\command"
Ensure-Key $ProgIdCmd
Set-ItemProperty -Path $ProgIdCmd -Name "(Default)" -Value $CommandStr

$ProgIdOpen = "$ProgIdPath\shell\open"
Ensure-Key $ProgIdOpen
Set-ItemProperty -Path $ProgIdOpen -Name "(Default)" -Value "Open with Aether"
Set-ItemProperty -Path $ProgIdOpen -Name "FriendlyAppName" -Value $AppName

# 3. Associate extensions in HKCU\Software\Classes and Explorer
foreach ($ext in $Extensions) {
    # HKCU\Software\Classes\<ext>\OpenWithProgids
    $ExtProgids = "HKCU:\Software\Classes\$ext\OpenWithProgids"
    Ensure-Key $ExtProgids
    Set-ItemProperty -Path $ExtProgids -Name $AppProgId -Value ""

    # HKCU\Software\Classes\<ext>\OpenWithList\Aether.exe
    $ExtOpenWith = "HKCU:\Software\Classes\$ext\OpenWithList\Aether.exe"
    Ensure-Key $ExtOpenWith
    Set-ItemProperty -Path $ExtOpenWith -Name "(Default)" -Value ""

    # HKCU\Software\Classes\SystemFileAssociations\<ext>
    $SysAssoc = "HKCU:\Software\Classes\SystemFileAssociations\$ext\OpenWithList\Aether.exe"
    Ensure-Key $SysAssoc
    Set-ItemProperty -Path $SysAssoc -Name "(Default)" -Value ""

    # Direct Right-click context menu "Open with Aether"
    $SysContext = "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\OpenWithAether"
    Ensure-Key $SysContext
    Set-ItemProperty -Path $SysContext -Name "(Default)" -Value "Open with Aether"
    Set-ItemProperty -Path $SysContext -Name "Icon" -Value "$AppExe,0"
    
    $SysContextCmd = "$SysContext\command"
    Ensure-Key $SysContextCmd
    Set-ItemProperty -Path $SysContextCmd -Name "(Default)" -Value $CommandStr

    # HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\<ext>
    $ExplorerExtProgids = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithProgids"
    Ensure-Key $ExplorerExtProgids
    Set-ItemProperty -Path $ExplorerExtProgids -Name $AppProgId -Value "" -Type Binary -ErrorAction SilentlyContinue
    if (-not (Get-ItemProperty -Path $ExplorerExtProgids -Name $AppProgId -ErrorAction SilentlyContinue)) {
        Set-ItemProperty -Path $ExplorerExtProgids -Name $AppProgId -Value ""
    }

    $ExplorerOpenWithList = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\$ext\OpenWithList"
    Ensure-Key $ExplorerOpenWithList
    $props = Get-ItemProperty -Path $ExplorerOpenWithList -ErrorAction SilentlyContinue
    $existingLetter = $null
    $lettersUsed = @()
    if ($props) {
        foreach ($prop in $props.PSObject.Properties) {
            if ($prop.Name -match '^[a-z]$') {
                $lettersUsed += $prop.Name
                if ($prop.Value -eq "Aether.exe") {
                    $existingLetter = $prop.Name
                }
            }
        }
    }
    if (-not $existingLetter) {
        $alphabet = [char[]]([int][char]'a'..[int][char]'z')
        $available = $alphabet | Where-Object { $lettersUsed -notcontains $_ }
        if ($available.Count -gt 0) {
            $newLetter = [string]$available[0]
            Set-ItemProperty -Path $ExplorerOpenWithList -Name $newLetter -Value "Aether.exe"
            $currentMRU = if ($props.MRUList) { $props.MRUList } else { "" }
            Set-ItemProperty -Path $ExplorerOpenWithList -Name "MRUList" -Value "$newLetter$currentMRU"
        }
    }
}

# 4. RegisteredApplications (Enables Windows 10/11 "Default Apps" Settings)
$RegApps = "HKCU:\Software\RegisteredApplications"
Ensure-Key $RegApps
Set-ItemProperty -Path $RegApps -Name $AppName -Value "Software\Aether\Capabilities"

$Capabilities = "HKCU:\Software\Aether\Capabilities"
Ensure-Key $Capabilities
Set-ItemProperty -Path $Capabilities -Name "ApplicationName" -Value $AppName
Set-ItemProperty -Path $Capabilities -Name "ApplicationDescription" -Value $AppDescription
Set-ItemProperty -Path $Capabilities -Name "ApplicationIcon" -Value "$AppExe,0"

$CapAssoc = "$Capabilities\FileAssociations"
Ensure-Key $CapAssoc
foreach ($ext in $Extensions) {
    Set-ItemProperty -Path $CapAssoc -Name $ext -Value $AppProgId
}

# 5. App Paths
$AppPathKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\Aether.exe"
Ensure-Key $AppPathKey
Set-ItemProperty -Path $AppPathKey -Name "(Default)" -Value $AppExe
Set-ItemProperty -Path $AppPathKey -Name "Path" -Value (Split-Path -Parent $AppExe)

# 6. Notify Windows Shell to refresh file associations
Write-Host "Flushing Windows Shell file association cache..." -ForegroundColor Cyan
try {
    $code = @'
using System;
using System.Runtime.InteropServices;
public class ShellChangeNotifier {
    [DllImport("shell32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
'@
    Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
    [ShellChangeNotifier]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
} catch {
    Write-Warning "Could not send SHChangeNotify: $_"
}

Write-Host "Success! Aether is now registered in Windows UI for reading .md files." -ForegroundColor Green
Write-Host "You can now:" -ForegroundColor Yellow
Write-Host "  1. Right-click any .md file -> 'Open with' -> select 'Aether'."
Write-Host "  2. Right-click any .md file -> 'Open with' -> 'Choose another app' -> choose 'Aether' and select 'Always' to make it your default markdown reader."
Write-Host "  3. Or go to Windows Settings -> Apps -> Default apps -> search '.md' and choose 'Aether'."
