# ==============================
# Enterprise POS - SAFE CLEANUP v2
# ==============================

Write-Host "Starting cleanup process..." -ForegroundColor Cyan

$basePath = "D:\Enterprise-POS\src\main"

# Step 1: Backup folder
$backupPath = "$basePath\_backup_old_structure"

if (!(Test-Path $backupPath)) {
    New-Item -ItemType Directory -Path $backupPath | Out-Null
}

Write-Host "Backup folder ready..." -ForegroundColor Green

# Step 2: Move core files safely
$oldFiles = @("database.js","main.js","preload.js")

foreach ($file in $oldFiles) {
    $fullPath = "$basePath\$file"
    if (Test-Path $fullPath) {
        Move-Item $fullPath "$backupPath\$file.old" -Force
        Write-Host "Moved: $file -> backup" -ForegroundColor Yellow
    }
}

# Step 3: Move folders BUT EXCLUDE backup folder
$allowedFolders = @("config","database","security","features","ipc")

Get-ChildItem $basePath -Directory |
Where-Object { $_.Name -ne "_backup_old_structure" } |
ForEach-Object {

    if ($allowedFolders -notcontains $_.Name) {
        $target = "$backupPath\$($_.Name)"

        if ($_.FullName -ne $target) {
            Move-Item $_.FullName $target -Force
            Write-Host "Archived folder: $($_.Name)" -ForegroundColor Yellow
        }
    }
}

Write-Host "Cleanup completed successfully!" -ForegroundColor Green
Write-Host "Backup location: $backupPath"