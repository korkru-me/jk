$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ExpectedInstallerSha256 = 'fa5a3b95f5f1e5380f71c5e9db7b4fbeb583262eeffefc598ace3665e98d02c3'
$InstallerUrl = 'https://github.com/SafeExamBrowser/seb-win-refactoring/releases/download/v3.10.2/SEB_3.10.2.920_x64_Setup.msi'
$UuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$Sha256Pattern = '^[0-9a-f]{64}$'
$RequestPattern = '^seb-s5-native-[a-z0-9]{12,48}$'

function Assert-Input {
  param([bool]$Condition)
  if (-not $Condition) { throw 'SEB_S5_NATIVE_INPUT_INVALID' }
}

function Decode-Base64 {
  param([string]$Value, [int]$Minimum, [int]$Maximum)
  try { $Bytes = [Convert]::FromBase64String($Value) } catch { throw 'SEB_S5_NATIVE_INPUT_INVALID' }
  Assert-Input ($Bytes.Length -ge $Minimum -and $Bytes.Length -le $Maximum)
  return $Bytes
}

if ($env:GITHUB_EVENT_NAME -eq 'push') {
  $RequestPath = Join-Path $env:GITHUB_WORKSPACE '.github\seb-s5\request.json'
  Assert-Input (Test-Path -LiteralPath $RequestPath -PathType Leaf)
  try { $Request = Get-Content -LiteralPath $RequestPath -Raw | ConvertFrom-Json } catch {
    throw 'SEB_S5_NATIVE_INPUT_INVALID'
  }
  $ExpectedProperties = @(
    'schemaVersion', 'requestId', 'assignmentId', 'revision', 'seedSha256',
    'payloadIv', 'payloadTag', 'payloadCiphertext'
  )
  $ActualProperties = @($Request.PSObject.Properties.Name | Sort-Object)
  $WantedProperties = @($ExpectedProperties | Sort-Object)
  Assert-Input ($ActualProperties.Count -eq $WantedProperties.Count)
  Assert-Input (-not (Compare-Object $ActualProperties $WantedProperties))
  Assert-Input ($Request.schemaVersion -eq 1)
  $env:SEB_S5_REQUEST_ID = [string]$Request.requestId
  $env:SEB_S5_ASSIGNMENT_ID = [string]$Request.assignmentId
  $env:SEB_S5_REVISION = [string]$Request.revision
  $env:SEB_S5_SEED_SHA256 = [string]$Request.seedSha256
  $env:SEB_S5_PAYLOAD_IV = [string]$Request.payloadIv
  $env:SEB_S5_PAYLOAD_TAG = [string]$Request.payloadTag
  $env:SEB_S5_PAYLOAD_CIPHERTEXT = [string]$Request.payloadCiphertext
}

function Read-AutomationValue {
  param(
    [System.Windows.Automation.AutomationElement]$Root,
    [string]$AutomationId
  )
  $Condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty,
    $AutomationId
  )
  $Deadline = [DateTime]::UtcNow.AddMinutes(2)
  do {
    $Element = $Root.FindFirst(
      [System.Windows.Automation.TreeScope]::Descendants,
      $Condition
    )
    if ($null -ne $Element) {
      try {
        $Pattern = $Element.GetCurrentPattern(
          [System.Windows.Automation.ValuePattern]::Pattern
        )
        $Value = $Pattern.Current.Value
        if ($Value -match $Sha256Pattern) { return $Value.ToLowerInvariant() }
      } catch { }
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $Deadline)
  throw 'SEB_S5_NATIVE_KEY_UNAVAILABLE'
}

Assert-Input ($env:SEB_S5_REQUEST_ID -match $RequestPattern)
Assert-Input ($env:SEB_S5_ASSIGNMENT_ID -match $UuidPattern)
$Revision = 0
Assert-Input ([int]::TryParse($env:SEB_S5_REVISION, [ref]$Revision))
Assert-Input ($Revision -ge 1 -and $Revision -le 2147483646)
Assert-Input ($env:SEB_S5_SEED_SHA256 -match $Sha256Pattern)
"request_id=$($env:SEB_S5_REQUEST_ID)" | Out-File -FilePath $env:GITHUB_OUTPUT -Append -Encoding utf8

$Key = Decode-Base64 $env:SEB_S5_AUTOMATION_KEY_B64 32 32
$Iv = Decode-Base64 $env:SEB_S5_PAYLOAD_IV 12 12
$Tag = Decode-Base64 $env:SEB_S5_PAYLOAD_TAG 16 16
$Ciphertext = Decode-Base64 $env:SEB_S5_PAYLOAD_CIPHERTEXT 1 2097152

$Root = Join-Path $env:RUNNER_TEMP 'seb-s5-native'
New-Item -ItemType Directory -Path $Root -Force | Out-Null
$Compressed = New-Object byte[] $Ciphertext.Length
$Aes = [System.Security.Cryptography.AesGcm]::new($Key)
try {
  $Aes.Decrypt($Iv, $Ciphertext, $Tag, $Compressed)
} catch {
  throw 'SEB_S5_NATIVE_DECRYPT_FAILED'
} finally {
  $Aes.Dispose()
  [Array]::Clear($Key, 0, $Key.Length)
}

$CompressedStream = [System.IO.MemoryStream]::new($Compressed, $false)
$Gzip = [System.IO.Compression.GZipStream]::new(
  $CompressedStream,
  [System.IO.Compression.CompressionMode]::Decompress
)
$SeedStream = [System.IO.MemoryStream]::new()
try {
  $Gzip.CopyTo($SeedStream)
  $SeedBytes = $SeedStream.ToArray()
} finally {
  $Gzip.Dispose()
  $CompressedStream.Dispose()
  $SeedStream.Dispose()
  [Array]::Clear($Compressed, 0, $Compressed.Length)
}
Assert-Input ($SeedBytes.Length -ge 1 -and $SeedBytes.Length -le 2097152)
$SeedHash = [Convert]::ToHexString(
  [System.Security.Cryptography.SHA256]::HashData($SeedBytes)
).ToLowerInvariant()
Assert-Input ($SeedHash -eq $env:SEB_S5_SEED_SHA256)

$SeedPath = Join-Path $Root 'assignment.seb'
[System.IO.File]::WriteAllBytes($SeedPath, $SeedBytes)
[Array]::Clear($SeedBytes, 0, $SeedBytes.Length)

$InstallerPath = Join-Path $Root 'seb-x64.msi'
Invoke-WebRequest -Uri $InstallerUrl -OutFile $InstallerPath -UseBasicParsing
$InstallerHash = (Get-FileHash -Path $InstallerPath -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-Input ($InstallerHash -eq $ExpectedInstallerSha256)
$Install = Start-Process msiexec.exe -ArgumentList @(
  '/i', ('"{0}"' -f $InstallerPath), '/qn', '/norestart'
) -Wait -PassThru
Assert-Input ($Install.ExitCode -eq 0 -or $Install.ExitCode -eq 3010)

$Candidates = @(
  (Join-Path $env:ProgramFiles 'SafeExamBrowser\Application\SebWindowsConfig.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'SafeExamBrowser\Application\SebWindowsConfig.exe')
)
$ConfigTool = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $ConfigTool) {
  $ConfigTool = Get-ChildItem -Path $env:ProgramFiles, ${env:ProgramFiles(x86)} `
    -Filter 'SebWindowsConfig.exe' -File -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
}
Assert-Input (-not [string]::IsNullOrWhiteSpace($ConfigTool))

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$LaunchProcess = Start-Process -FilePath $ConfigTool -ArgumentList @($SeedPath) -PassThru
$WindowProcess = $null
try {
  $Deadline = [DateTime]::UtcNow.AddMinutes(2)
  do {
    Start-Sleep -Milliseconds 250
    $Candidates = @(Get-Process -Name 'SebWindowsConfig' -ErrorAction SilentlyContinue)
    foreach ($Candidate in $Candidates) {
      try {
        $Candidate.Refresh()
        if ($Candidate.MainWindowHandle -ne 0) {
          $WindowProcess = $Candidate
          break
        }
      } catch { }
    }
  } while ($null -eq $WindowProcess -and [DateTime]::UtcNow -lt $Deadline)
  Assert-Input ($null -ne $WindowProcess -and $WindowProcess.MainWindowHandle -ne 0)
  $Window = [System.Windows.Automation.AutomationElement]::FromHandle($WindowProcess.MainWindowHandle)
  Assert-Input ($null -ne $Window)
  $ConfigurationKey = Read-AutomationValue $Window 'textBoxConfigurationKey'
  $BrowserExamKey = Read-AutomationValue $Window 'textBoxBrowserExamKey'
} finally {
  foreach ($Candidate in @(Get-Process -Name 'SebWindowsConfig' -ErrorAction SilentlyContinue)) {
    try { if (-not $Candidate.HasExited) { $Candidate.Kill() } } catch { }
    try { $Candidate.Dispose() } catch { }
  }
  try { if (-not $LaunchProcess.HasExited) { $LaunchProcess.Kill() } } catch { }
  $LaunchProcess.Dispose()
}

$Evidence = [ordered]@{
  schemaVersion = 1
  assignmentId = $env:SEB_S5_ASSIGNMENT_ID
  revision = $Revision
  configKey = $ConfigurationKey
  browserExamKeys = @(
    [ordered]@{
      platform = 'windows'
      versionString = '3.10.2'
      buildNumber = '920'
      key = $BrowserExamKey
    }
  )
}
$EvidenceBytes = [Text.Encoding]::UTF8.GetBytes(($Evidence | ConvertTo-Json -Compress -Depth 4))
$OutputKey = Decode-Base64 $env:SEB_S5_AUTOMATION_KEY_B64 32 32
$OutputIv = New-Object byte[] 12
[System.Security.Cryptography.RandomNumberGenerator]::Fill($OutputIv)
$OutputCiphertext = New-Object byte[] $EvidenceBytes.Length
$OutputTag = New-Object byte[] 16
$OutputAes = [System.Security.Cryptography.AesGcm]::new($OutputKey)
try {
  $OutputAes.Encrypt($OutputIv, $EvidenceBytes, $OutputCiphertext, $OutputTag)
} finally {
  $OutputAes.Dispose()
  [Array]::Clear($OutputKey, 0, $OutputKey.Length)
  [Array]::Clear($EvidenceBytes, 0, $EvidenceBytes.Length)
}
$Envelope = [ordered]@{
  schemaVersion = 1
  requestId = $env:SEB_S5_REQUEST_ID
  seedSha256 = $SeedHash
  iv = [Convert]::ToBase64String($OutputIv)
  tag = [Convert]::ToBase64String($OutputTag)
  ciphertext = [Convert]::ToBase64String($OutputCiphertext)
}
[System.IO.File]::WriteAllText(
  (Join-Path $Root 'evidence.enc.json'),
  ($Envelope | ConvertTo-Json -Compress),
  [Text.UTF8Encoding]::new($false)
)

[Array]::Clear($Iv, 0, $Iv.Length)
[Array]::Clear($Tag, 0, $Tag.Length)
[Array]::Clear($Ciphertext, 0, $Ciphertext.Length)
[Array]::Clear($OutputIv, 0, $OutputIv.Length)
[Array]::Clear($OutputTag, 0, $OutputTag.Length)
[Array]::Clear($OutputCiphertext, 0, $OutputCiphertext.Length)
Remove-Item -LiteralPath $SeedPath -Force
