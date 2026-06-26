$root = "D:\Enterprise-POS"

Write-Host "Creating Enterprise POS Clean Structure..." -ForegroundColor Cyan

$folders = @(
    "$root\src\main\config",
    "$root\src\main\database",
    "$root\src\main\security",
    "$root\src\main\features\auth",
    "$root\src\main\features\billing",
    "$root\src\main\features\products",
    "$root\src\main\features\inventory",
    "$root\src\main\features\customers",
    "$root\src\main\features\returns",
    "$root\src\main\features\reports",
    "$root\src\main\features\dashboard",
    "$root\src\main\features\settings",
    "$root\src\main\features\expenses",
    "$root\src\main\features\printing",
    "$root\src\main\features\sync",
    "$root\src\main\features\access-control",
    "$root\src\main\features\deployment",
    "$root\src\main\features\lucky-draw",
    "$root\src\renderer\assets\icons",
    "$root\src\renderer\assets\images",
    "$root\src\renderer\assets\fonts",
    "$root\src\renderer\pages",
    "$root\src\renderer\components",
    "$root\src\renderer\styles",
    "$root\src\renderer\js",
    "$root\scripts",
    "$root\shared"
)

foreach ($folder in $folders) {
    if (!(Test-Path $folder)) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
        Write-Host "Created: $folder"
    } else {
        Write-Host "Exists (skipped): $folder"
    }
}

Write-Host "`nDONE! Structure is ready." -ForegroundColor Green