param([Parameter(Mandatory=$true)][string]$Archive)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Archive))
try {
    $files = @($zip.Entries | Where-Object { $_.Name })
    foreach ($entry in $files) {
        if (!$entry.FullName.StartsWith('uniquiz/') -or $entry.FullName.Contains('..')) {
            throw "Unexpected archive path: $($entry.FullName)"
        }
        if ($entry.FullName -match '/(\.build|\.github|\.git|node_modules|submission|test-results)/') {
            throw "Development-only content: $($entry.FullName)"
        }
        $relative = $entry.FullName.Substring(8)
        $source = Join-Path (Resolve-Path "$PSScriptRoot/../..") $relative
        $stream = $entry.Open()
        try {
            $sha = [Security.Cryptography.SHA256]::Create()
            $actual = [Convert]::ToHexString($sha.ComputeHash($stream))
        } finally { $stream.Dispose() }
        if ($actual -ne (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash) {
            throw "Archive differs from checkout: $relative"
        }
    }
    foreach ($required in @('version.php','COPYING.txt','README.md','QA.md','SECURITY.md','amd/build/app.min.js')) {
        if (!$zip.GetEntry("uniquiz/$required")) { throw "Missing $required" }
    }
    Write-Output "Verified $($files.Count) files: one plugin root, no development directories, exact checkout bytes."
} finally { $zip.Dispose() }
Get-FileHash -LiteralPath $Archive -Algorithm SHA256
