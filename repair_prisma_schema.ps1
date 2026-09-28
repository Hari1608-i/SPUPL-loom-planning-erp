$ErrorActionPreference = "Stop"

$root = "C:\Users\SPUPL-PLANNING\Downloads\Hari Project\Hari Project"
$schemaPath = Join-Path $root "backend\prisma\schema.prisma"

Write-Host "===== BACKUP CURRENT SCHEMA ====="

$backupPath = "$schemaPath.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item $schemaPath $backupPath -Force
Write-Host "Backup: $backupPath"

Write-Host "===== READ CURRENT SCHEMA ====="

$current = Get-Content $schemaPath -Raw

Write-Host "===== READ KNOWN-GOOD MODEL DEFINITIONS FROM GIT ====="

$historical = git -C $root show "54d2775:backend/prisma/schema.prisma" | Out-String

function Get-ModelBlock {
    param(
        [string]$Text,
        [string]$ModelName
    )

    $escaped = [regex]::Escape($ModelName)
    $pattern = "(?ms)^model\s+$escaped\s*\{.*?^\}"

    $match = [regex]::Match($Text, $pattern)

    if (-not $match.Success) {
        throw "Model not found in reference schema: $ModelName"
    }

    return $match.Value.Trim()
}

function Add-ModelIfMissing {
    param(
        [string]$Schema,
        [string]$ModelName
    )

    if ($Schema -match "(?m)^model\s+$([regex]::Escape($ModelName))\s*\{") {
        Write-Host "$ModelName already exists - keeping current version"
        return $Schema
    }

    $block = Get-ModelBlock -Text $historical -ModelName $ModelName

    Write-Host "Adding missing model: $ModelName"

    return $Schema.TrimEnd() + "`r`n`r`n" + $block + "`r`n"
}

function Add-RelationIfMissing {
    param(
        [string]$Schema,
        [string]$ModelName,
        [string]$RelationLine
    )

    $escaped = [regex]::Escape($ModelName)
    $pattern = "(?ms)^model\s+$escaped\s*\{.*?^\}"

    $match = [regex]::Match($Schema, $pattern)

    if (-not $match.Success) {
        throw "Target model not found: $ModelName"
    }

    $modelBlock = $match.Value

    $relationName = ($RelationLine.Trim() -split "\s+")[0]

    if ($modelBlock -match "(?m)^\s*$([regex]::Escape($relationName))\s+") {
        Write-Host "$ModelName.$relationName already exists"
        return $Schema
    }

    Write-Host "Adding relation: $ModelName.$relationName"

    $newBlock = $modelBlock -replace "\r?\n\}\s*$", "`r`n  $RelationLine`r`n}"

    return $Schema.Substring(0, $match.Index) +
           $newBlock +
           $Schema.Substring($match.Index + $match.Length)
}

$current = Add-ModelIfMissing -Schema $current -ModelName "BeamPreparationRequest"
$current = Add-ModelIfMissing -Schema $current -ModelName "WarpPreparationProcess"

$current = Add-RelationIfMissing `
    -Schema $current `
    -ModelName "LoomMaster" `
    -RelationLine "WarpPreparationProcess WarpPreparationProcess[]"

$current = Add-RelationIfMissing `
    -Schema $current `
    -ModelName "PlannedAssignment" `
    -RelationLine "WarpPreparationProcess WarpPreparationProcess[]"

Set-Content $schemaPath $current -Encoding UTF8

Write-Host ""
Write-Host "===== SCHEMA REPAIR COMPLETE ====="
Write-Host "Original schema backup created."
Write-Host "Only missing Warp/Beam preparation models and relations were restored."