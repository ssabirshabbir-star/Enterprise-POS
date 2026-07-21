param(
  [string]$BundleRoot = (Split-Path -Parent $MyInvocation.MyCommand.Path),
  [string]$LocalRoot = 'C:\EnterprisePOSCert\Phase6',
  [string]$SourceHead = '',
  [string]$PostgresArchiveRelativePath = 'payloads\postgres\postgresql-17.10-2-windows-x64-binaries.zip',
  [string]$VcRuntimeRootRelativePath = 'resources\prerequisites\microsoft-vc-runtime',
  [string]$NodeRelativePath = 'tools\node\node.exe'
)

$ErrorActionPreference = 'Stop'
$StartedAt = Get-Date
$ExpectedPostgresSha256 = 'EF9B1E5E23D2E8A83914BA13D9DC536A72210FBA53FD1808FF1F7E06BB22B106'
$ExpectedVcRuntimeSha256 = '843068991DAAA1F73AD9F6239BCE4D0F6A07A51F18C37EA2A867E9BECA71295C'

function Sha256($Path) {
  (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function To-HexExit($Code) {
  if ($null -eq $Code) { return $null }
  return ('0x{0:X8}' -f ([uint32]$Code))
}

function Write-Json($Path, $Value) {
  $Value | ConvertTo-Json -Depth 18 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Capture-Safe($Name, [scriptblock]$Script) {
  try {
    [pscustomobject]@{
      name = $Name
      ok = $true
      value = & $Script
      error = $null
    }
  } catch {
    [pscustomobject]@{
      name = $Name
      ok = $false
      value = $null
      error = $_.Exception.Message
    }
  }
}

function Capture-NativeCommand($Name, [string]$FilePath, [string[]]$Arguments) {
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & $FilePath @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  [pscustomobject]@{
    name = $Name
    command = $FilePath
    arguments = $Arguments
    exitCode = $exitCode
    exitCodeHex = To-HexExit $exitCode
    ok = ($exitCode -eq 0)
    output = @($output | ForEach-Object { $_.ToString() })
  }
}

$RunRoot = Join-Path $LocalRoot ('run-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$EvidenceRoot = Join-Path $RunRoot 'evidence'
$RepoRoot = Join-Path $RunRoot 'repo'
New-Item -ItemType Directory -Force -Path $EvidenceRoot, $RepoRoot | Out-Null

Start-Transcript -LiteralPath (Join-Path $EvidenceRoot 'phase6-runtime-transcript.txt') -Force | Out-Null

try {
  Copy-Item -Path (Join-Path $BundleRoot '*') -Destination $RepoRoot -Recurse -Force

  $Node = Join-Path $RepoRoot $NodeRelativePath
  $Archive = Join-Path $RepoRoot $PostgresArchiveRelativePath
  $VcRoot = Join-Path $RepoRoot $VcRuntimeRootRelativePath
  $Vc = Join-Path $VcRoot 'vc_redist.x64.exe'
  $HarnessOutput = Join-Path $EvidenceRoot 'runtime-harness'
  New-Item -ItemType Directory -Force -Path $HarnessOutput | Out-Null

  $os = Get-CimInstance Win32_OperatingSystem
  $computer = Get-CimInstance Win32_ComputerSystem
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  $defender = Capture-Safe 'Get-MpComputerStatus' { Get-MpComputerStatus -ErrorAction Stop }
  $mpPref = Capture-Safe 'Get-MpPreference' { Get-MpPreference -ErrorAction Stop }
  $vcRegistry = Capture-NativeCommand `
    'VC Runtime x64 registry query' `
    'reg.exe' `
    @('query', 'HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64', '/reg:64')

  $baseline = [pscustomobject]@{
    capturedAt = (Get-Date).ToString('o')
    os = [pscustomobject]@{
      Caption = $os.Caption
      Version = $os.Version
      BuildNumber = $os.BuildNumber
      OSArchitecture = $os.OSArchitecture
      LastBootUpTime = $os.LastBootUpTime
    }
    computer = [pscustomobject]@{
      Name = $env:COMPUTERNAME
      Manufacturer = $computer.Manufacturer
      Model = $computer.Model
      UserName = $computer.UserName
      TotalPhysicalMemory = $computer.TotalPhysicalMemory
    }
    elevated = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    powershellVersion = $PSVersionTable.PSVersion.ToString()
    freeSpaceC = (Get-PSDrive C).Free
    temp = $env:TEMP
    tmp = $env:TMP
    dbEnv = [pscustomobject]@{
      DATABASE_URL = if ($env:DATABASE_URL) { '<present>' } else { '<absent>' }
      PGHOST = if ($env:PGHOST) { '<present>' } else { '<absent>' }
      PGPORT = if ($env:PGPORT) { '<present>' } else { '<absent>' }
      PGDATABASE = if ($env:PGDATABASE) { '<present>' } else { '<absent>' }
      PGUSER = if ($env:PGUSER) { '<present>' } else { '<absent>' }
      PGPASSWORD = if ($env:PGPASSWORD) { '<present>' } else { '<absent>' }
    }
    existingPostgresServices = @(Get-Service | Where-Object { $_.Name -match 'postgres|EnterprisePOS' } | Select-Object Name, DisplayName, Status, StartType)
    existingPostgresProcesses = @(Get-Process postgres, pg_ctl -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path)
    existingEnterpriseProcesses = @(Get-Process 'Enterprise POS', 'EnterprisePOS' -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path)
    vcRegistry = $vcRegistry
    vcDlls = @('VCRUNTIME140.dll', 'VCRUNTIME140_1.dll', 'MSVCP140.dll') | ForEach-Object {
      $p = Join-Path $env:SystemRoot "System32\$_"
      [pscustomobject]@{
        name = $_
        path = $p
        exists = (Test-Path $p)
        version = if (Test-Path $p) { (Get-Item $p).VersionInfo.FileVersion } else { $null }
      }
    }
    defenderStatus = $defender
    defenderPreference = $mpPref
  }
  Write-Json (Join-Path $EvidenceRoot 'clean-environment-baseline.json') $baseline

  $inputHashes = [pscustomobject]@{
    node = [pscustomobject]@{ path = $Node; size = (Get-Item $Node).Length; sha256 = Sha256 $Node }
    postgresArchive = [pscustomobject]@{ path = $Archive; size = (Get-Item $Archive).Length; sha256 = Sha256 $Archive; expectedSha256 = $ExpectedPostgresSha256 }
    vcRuntime = [pscustomobject]@{ path = $Vc; size = (Get-Item $Vc).Length; sha256 = Sha256 $Vc; expectedSha256 = $ExpectedVcRuntimeSha256 }
    harness = [pscustomobject]@{ path = (Join-Path $RepoRoot 'scripts\certify-managed-postgres-runtime.js'); sha256 = Sha256 (Join-Path $RepoRoot 'scripts\certify-managed-postgres-runtime.js') }
    manifest = [pscustomobject]@{ path = (Join-Path $RepoRoot 'resources\postgres\manifest.json'); sha256 = Sha256 (Join-Path $RepoRoot 'resources\postgres\manifest.json') }
    vcManifest = [pscustomobject]@{ path = (Join-Path $VcRoot 'manifest.json'); sha256 = Sha256 (Join-Path $VcRoot 'manifest.json') }
  }
  Write-Json (Join-Path $EvidenceRoot 'local-staging-hashes.json') $inputHashes
  if ($inputHashes.postgresArchive.sha256 -ne $inputHashes.postgresArchive.expectedSha256) {
    throw 'PostgreSQL archive hash mismatch after local staging.'
  }
  if ($inputHashes.vcRuntime.sha256 -ne $inputHashes.vcRuntime.expectedSha256) {
    throw 'VC runtime hash mismatch after local staging.'
  }

  $cmdArgs = @(
    'scripts\certify-managed-postgres-runtime.js',
    '--certify-managed-postgres-runtime',
    '--clean-environment',
    '--archive',
    $Archive,
    '--vc-runtime-root',
    $VcRoot,
    '--output',
    $HarnessOutput
  )
  $plan = [pscustomobject]@{
    command = $Node
    arguments = $cmdArgs
    workingDirectory = $RepoRoot
    cleanEnvironmentFlagUsed = $true
    evidenceDestination = $EvidenceRoot
    harnessOutput = $HarnessOutput
    sourceHead = $SourceHead
  }
  Write-Json (Join-Path $EvidenceRoot 'execution-plan.json') $plan

  $stdout = Join-Path $EvidenceRoot 'runtime-harness.stdout.log'
  $stderr = Join-Path $EvidenceRoot 'runtime-harness.stderr.log'
  $RunStart = Get-Date
  $process = Start-Process `
    -FilePath $Node `
    -ArgumentList $cmdArgs `
    -WorkingDirectory $RepoRoot `
    -Wait `
    -PassThru `
    -NoNewWindow `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr
  $RunEnd = Get-Date

  $post = [pscustomobject]@{
    capturedAt = (Get-Date).ToString('o')
    postgresProcesses = @(Get-Process postgres, pg_ctl -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path)
    enterpriseProcesses = @(Get-Process 'Enterprise POS', 'EnterprisePOS' -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path)
    postgresServices = @(Get-Service | Where-Object { $_.Name -match 'postgres|EnterprisePOS' } | Select-Object Name, DisplayName, Status, StartType)
    listeners = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object LocalAddress, LocalPort, OwningProcess)
  }
  Write-Json (Join-Path $EvidenceRoot 'post-run-residue.json') $post

  $harnessReportPath = Join-Path $HarnessOutput 'managed-postgres-runtime-certification.json'
  $harnessReport = if (Test-Path $harnessReportPath) { Get-Content -Raw $harnessReportPath | ConvertFrom-Json } else { $null }
  $result = [pscustomobject]@{
    phase = 6
    phaseName = 'Clean Windows Certification / Managed PostgreSQL clean-machine runtime certification'
    status = if ($process.ExitCode -eq 0 -and $harnessReport -and $harnessReport.status -eq 'passed') { 'PASS' } else { 'FAIL' }
    startedAt = $StartedAt.ToString('o')
    completedAt = (Get-Date).ToString('o')
    sourceHead = $SourceHead
    cleanEnvironment = $true
    environmentBaseline = $baseline
    inputHashes = $inputHashes
    localStagingPaths = [pscustomobject]@{
      runRoot = $RunRoot
      repoRoot = $RepoRoot
      evidenceRoot = $EvidenceRoot
      archive = $Archive
      vcRuntimeRoot = $VcRoot
      vcRuntime = $Vc
      node = $Node
    }
    cleanEnvironmentFlagUsed = $true
    command = $plan
    harnessExitCode = $process.ExitCode
    harnessExitCodeHex = To-HexExit $process.ExitCode
    harnessStartedAt = $RunStart.ToString('o')
    harnessCompletedAt = $RunEnd.ToString('o')
    harnessResult = $harnessReport
    postgresVersion = if ($harnessReport) { $harnessReport.runtime.serverVersion } else { $null }
    postgresExecutablePath = if ($harnessReport) { $harnessReport.executables.postgres } else { $null }
    dataDirectory = if ($harnessReport) { $harnessReport.runtimeRoot } else { $null }
    port = if ($harnessReport) { $harnessReport.runtime.port } else { $null }
    serviceStatus = 'not created by harness'
    databaseReadiness = if ($harnessReport) { $harnessReport.runtime.connectionPassed } else { $null }
    schemaReadiness = if ($harnessReport) { $harnessReport.runtime.sqlRoundTripPassed } else { $null }
    cleanupStatus = if ($harnessReport -and $harnessReport.status -eq 'passed') { 'runtime temp root removed unless keep-on-success was used' } else { 'failure evidence preserved' }
    residue = $post
    signingStatus = 'unsigned certification artifact; not signed by Phase 6 runtime harness'
    legalStatus = 'pending external legal review; not approved'
    redistributionStatus = 'PostgreSQL not-certified; VC Runtime not-certified; no redistribution approval claimed'
    securityStatus = 'technical clean-machine runtime evidence only; external security review pending'
    releaseAuthorizationStatus = 'pending/non-authorizing'
    managedPostgresProductionStatus = 'blocked/not enabled'
    productionRestoreStatus = 'blocked/not enabled'
    productionReleaseDecision = 'DO NOT RELEASE'
    evidencePaths = [pscustomobject]@{
      root = $EvidenceRoot
      finalAssessment = (Join-Path $EvidenceRoot 'phase6-clean-machine-runtime-final-assessment.json')
      harnessReport = $harnessReportPath
      stdout = $stdout
      stderr = $stderr
      transcript = (Join-Path $EvidenceRoot 'phase6-runtime-transcript.txt')
    }
  }
  Write-Json (Join-Path $EvidenceRoot 'phase6-clean-machine-runtime-final-assessment.json') $result
  Write-Output ($result | ConvertTo-Json -Depth 18)
  exit $process.ExitCode
} catch {
  $err = [pscustomobject]@{
    status = 'FAIL'
    error = $_.Exception.Message
    completedAt = (Get-Date).ToString('o')
    evidenceRoot = $EvidenceRoot
  }
  Write-Json (Join-Path $EvidenceRoot 'phase6-clean-machine-runtime-final-assessment.json') $err
  Write-Error $_
  exit 1
} finally {
  try { Stop-Transcript | Out-Null } catch {}
}
