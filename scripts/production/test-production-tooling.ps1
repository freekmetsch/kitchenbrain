$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

function Get-FreeLoopbackPort {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

$openRouterFixture = {
    param($Port, $Mode, $ReadyFile, $OldKey, $NewKey, $ManagementKey)

    function Read-Request {
        param([Net.Sockets.NetworkStream]$Stream)
        $Stream.ReadTimeout = 30000
        $headerBytes = [Collections.Generic.List[byte]]::new()
        while ($headerBytes.Count -lt 16384) {
            $next = $Stream.ReadByte()
            if ($next -lt 0) { throw 'fixture request ended early' }
            $headerBytes.Add([byte]$next)
            if (
                $headerBytes.Count -ge 4 -and
                $headerBytes[$headerBytes.Count - 4] -eq 13 -and
                $headerBytes[$headerBytes.Count - 3] -eq 10 -and
                $headerBytes[$headerBytes.Count - 2] -eq 13 -and
                $headerBytes[$headerBytes.Count - 1] -eq 10
            ) { break }
        }
        $headerText = [Text.Encoding]::ASCII.GetString($headerBytes.ToArray())
        $lines = $headerText.Split([string[]]@("`r`n"), [StringSplitOptions]::None)
        $requestLine = $lines[0].Split(' ')
        $headers = @{}
        foreach ($line in $lines[1..($lines.Count - 1)]) {
            $separator = $line.IndexOf(':')
            if ($separator -gt 0) {
                $headers[$line.Substring(0, $separator).Trim()] = $line.Substring($separator + 1).Trim()
            }
        }
        $contentLength = if ($headers['Content-Length']) { [int]$headers['Content-Length'] } else { 0 }
        $bodyBytes = [byte[]]::new($contentLength)
        $offset = 0
        while ($offset -lt $contentLength) {
            $read = $Stream.Read($bodyBytes, $offset, $contentLength - $offset)
            if ($read -le 0) { throw 'fixture body ended early' }
            $offset += $read
        }
        return [pscustomobject]@{
            Method = $requestLine[0]
            Path = $requestLine[1]
            Authorization = $headers['Authorization']
            Body = [Text.Encoding]::UTF8.GetString($bodyBytes)
        }
    }

    function Write-Response {
        param([Net.Sockets.NetworkStream]$Stream, [string]$Body)
        $bodyBytes = [Text.Encoding]::UTF8.GetBytes($Body)
        $head = "HTTP/1.1 200 OK`r`nContent-Type: application/json`r`nContent-Length: $($bodyBytes.Length)`r`nConnection: close`r`n`r`n"
        $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
        $Stream.Write($headBytes, 0, $headBytes.Length)
        $Stream.Write($bodyBytes, 0, $bodyBytes.Length)
        $Stream.Flush()
    }

    $hash = 'a' * 64
    $label = 'sk-or-v1-old...fixture'
    $steps = switch ($Mode) {
        'VerifyNew' {
            @(
                @{
                    Method = 'GET'
                    Path = '/api/v1/key'
                    Authorization = "Bearer $NewKey"
                    Response = '{"data":{"is_management_key":false,"label":"sk-or-v1-new...fixture"}}'
                }
            )
        }
        'CapOld' {
            @(
                @{
                    Method = 'GET'
                    Path = '/api/v1/key'
                    Authorization = "Bearer $OldKey"
                    Response = "{`"data`":{`"is_management_key`":false,`"label`":`"$label`"}}"
                },
                @{
                    Method = 'GET'
                    Path = '/api/v1/keys?include_disabled=true'
                    Authorization = "Bearer $ManagementKey"
                    Response = "{`"data`":[{`"hash`":`"$hash`",`"label`":`"$label`"}]}"
                },
                @{
                    Method = 'PATCH'
                    Path = "/api/v1/keys/$hash"
                    Authorization = "Bearer $ManagementKey"
                    Response = "{`"data`":{`"hash`":`"$hash`",`"limit`":1,`"limit_reset`":`"daily`"}}"
                }
            )
        }
        'DeleteOld' {
            @(
                @{
                    Method = 'GET'
                    Path = '/api/v1/key'
                    Authorization = "Bearer $OldKey"
                    Response = "{`"data`":{`"is_management_key`":false,`"label`":`"$label`"}}"
                },
                @{
                    Method = 'GET'
                    Path = '/api/v1/keys?include_disabled=true'
                    Authorization = "Bearer $ManagementKey"
                    Response = "{`"data`":[{`"hash`":`"$hash`",`"label`":`"$label`"}]}"
                },
                @{
                    Method = 'DELETE'
                    Path = "/api/v1/keys/$hash"
                    Authorization = "Bearer $ManagementKey"
                    Response = '{"deleted":true}'
                }
            )
        }
    }

    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    $listener.Start(1)
    [IO.File]::WriteAllText($ReadyFile, 'ready')
    try {
        foreach ($step in $steps) {
            $client = $listener.AcceptTcpClient()
            try {
                $stream = $client.GetStream()
                $request = Read-Request -Stream $stream
                if (
                    $request.Method -cne $step.Method -or
                    $request.Path -cne $step.Path -or
                    $request.Authorization -cne $step.Authorization
                ) {
                    $authMatch = $request.Authorization -ceq $step.Authorization
                    throw "fixture request mismatch: expected=$($step.Method) $($step.Path); actual=$($request.Method) $($request.Path); authMatch=$authMatch"
                }
                if ($Mode -eq 'CapOld' -and $step.Method -eq 'PATCH') {
                    $body = $request.Body | ConvertFrom-Json
                    if (
                        [double]$body.limit -ne 1 -or
                        [string]$body.limit_reset -cne 'daily' -or
                        $body.include_byok_in_limit -ne $true
                    ) {
                        throw 'fixture received incorrect cap controls'
                    }
                }
                Write-Response -Stream $stream -Body $step.Response
            } finally {
                $client.Dispose()
            }
        }
        Write-Output 'FIXTURE-PASS'
    } finally {
        $listener.Stop()
    }
}

$powerShellScripts = @(
    (Join-Path $repoRoot 'scripts\invoke-production-secret-tool.ps1'),
    (Join-Path $repoRoot 'scripts\production\stage-railway-config.ps1'),
    (Join-Path $repoRoot 'scripts\production\openrouter-key-admin.ps1'),
    (Join-Path $repoRoot 'scripts\production\create-openrouter-app-key.ps1'),
    (Join-Path $repoRoot 'scripts\production\reset-railway-bucket-credentials.ps1'),
    (Join-Path $repoRoot 'scripts\production\test-production-tooling.ps1')
)
foreach ($script in $powerShellScripts) {
    $tokens = $null
    $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($script, [ref]$tokens, [ref]$errors) | Out-Null
    Assert-True ($errors.Count -eq 0) "PowerShell parser failure: $script"
}

$wrapper = Get-Content -Raw -LiteralPath $powerShellScripts[0]
$stager = Get-Content -Raw -LiteralPath $powerShellScripts[1]
$admin = Get-Content -Raw -LiteralPath $powerShellScripts[2]
$bucketReset = Get-Content -Raw -LiteralPath $powerShellScripts[4]
$authCanaryPath = Join-Path $repoRoot 'scripts\production\verify-production-auth.mjs'
$authCanary = Get-Content -Raw -LiteralPath $authCanaryPath
$recipeOptionsCanaryPath = Join-Path $repoRoot 'scripts\canary\recipe-options-live.ts'
$recipeOptionsCanary = Get-Content -Raw -LiteralPath $recipeOptionsCanaryPath
$tsxCli = Join-Path $repoRoot 'node_modules\tsx\dist\cli.mjs'
$template = Get-Content -Raw -LiteralPath (Join-Path $repoRoot '.env.template')

Assert-True ($wrapper -notmatch '(?i)\[(string|securestring)\]\$(Secret|Value|Token)\b') 'Wrapper accepts a secret-bearing parameter'
Assert-True ($wrapper.Contains('"--env-file=$envTemplate"')) 'Wrapper does not use the committed 1Password template'
Assert-True ($stager -match "'--stdin'" -and $stager -match "'--skip-deploys'") 'Railway stager does not require stdin plus skipped deploys'
Assert-True ($stager -notmatch "'variable', 'set', [^\r\n]+=") 'Railway stager contains an argv value fallback'
Assert-True ($admin -notmatch 'Write-(Output|Host).*(managementKey|oldAppKey|newAppKey|responseText)') 'OpenRouter admin can print a credential or provider response'
Assert-True ($bucketReset -match "'--reset'" -and $bucketReset -notmatch "'--json'") 'Bucket reset is not fixed to the output-suppressed reset route'
Assert-True ($authCanary -match [regex]::Escape('https://household-brain-production.up.railway.app')) 'Auth canary is not fixed to production'
Assert-True ($authCanary -notmatch 'response\.(text|json|arrayBuffer)\(') 'Auth canary can read a production response body'
Assert-True ($wrapper -match "'RunRecipeOptionsCanary'") 'Secret wrapper does not expose the fixed recipe-options canary'
Assert-True ($recipeOptionsCanary -notmatch 'console\.(log|error|warn)') 'Recipe-options canary can print child details'
Assert-True ($recipeOptionsCanary -match "delete process\.env\.HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY") 'Recipe-options canary retains the source secret name'
Assert-True ($recipeOptionsCanary -notmatch 'productId\s*:|product_id\s*:') 'Recipe-options fixture exposes a product ID'
Assert-True (
    @($template -split "`r?`n" | Where-Object {
        $_ -match '^[A-Z][A-Z0-9_]*=' -and $_ -notmatch '=("?op://Dev-Agents/)'
    }).Count -eq 0
) 'The production env template contains a non-1Password value'

$wrapperValidation = & pwsh -NoProfile -File $powerShellScripts[0] -ValidateOnly
$stagerValidation = & pwsh -NoProfile -File $powerShellScripts[1] -ValidateOnly
$adminValidation = & pwsh -NoProfile -File $powerShellScripts[2] -ValidateOnly
$bucketResetValidation = & pwsh -NoProfile -File $powerShellScripts[4] -ValidateOnly
$truthValidation = & node (Join-Path $repoRoot 'scripts\production\railway-deployment-truth.mjs') --validate-only
$authValidation = & node $authCanaryPath --validate-only
$recipeOptionsCanaryValidation = & node $tsxCli $recipeOptionsCanaryPath --validate-only

Assert-True ($wrapperValidation -eq 'PRODUCTION-SECRET-TOOL-VALID') 'Secret wrapper validation failed'
Assert-True ($stagerValidation -eq 'RAILWAY-CONFIG-STAGER-VALID') 'Railway stager validation failed'
Assert-True ($adminValidation -eq 'OPENROUTER-KEY-ADMIN-VALID') 'OpenRouter admin validation failed'
Assert-True ($bucketResetValidation -eq 'RAILWAY-BUCKET-RESET-VALID') 'Bucket reset validation failed'
Assert-True ($truthValidation -eq 'RAILWAY-DEPLOYMENT-TRUTH-VALID') 'Deployment-truth validation failed'
Assert-True ($authValidation -eq 'PRODUCTION-AUTH-CANARY-VALID') 'Production auth canary validation failed'
Assert-True ($recipeOptionsCanaryValidation -eq 'RECIPE-OPTIONS-LIVE-CANARY-VALID') 'Recipe-options live canary validation failed'

$priorSecretEnvironment = @{
    HOUSEHOLD_BRAIN_OLD_OPENROUTER_API_KEY = $env:HOUSEHOLD_BRAIN_OLD_OPENROUTER_API_KEY
    HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY = $env:HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY
    HOUSEHOLD_BRAIN_OPENROUTER_MANAGEMENT_KEY = $env:HOUSEHOLD_BRAIN_OPENROUTER_MANAGEMENT_KEY
}
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ("household-brain-production-tooling-" + [Guid]::NewGuid().ToString('N'))
$tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
Assert-True ([IO.Path]::GetFullPath($fixtureRoot).StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) 'Unexpected fixture root'
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
try {
    $oldKey = 'sk-or-v1-' + ('O' * 64)
    $newKey = 'sk-or-v1-' + ('N' * 64)
    $managementKey = 'sk-or-v1-' + ('M' * 64)
    $env:HOUSEHOLD_BRAIN_OLD_OPENROUTER_API_KEY = $oldKey
    $env:HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY = $newKey
    $env:HOUSEHOLD_BRAIN_OPENROUTER_MANAGEMENT_KEY = $managementKey

    foreach ($action in @('VerifyNew', 'CapOld', 'DeleteOld')) {
        $port = Get-FreeLoopbackPort
        $readyFile = Join-Path $fixtureRoot "$action-ready"
        $job = Start-Job -ScriptBlock $openRouterFixture -ArgumentList $port, $action, $readyFile, $oldKey, $newKey, $managementKey
        try {
            for ($attempt = 0; $attempt -lt 300 -and -not (Test-Path -LiteralPath $readyFile); $attempt++) {
                Start-Sleep -Milliseconds 100
            }
            Assert-True (Test-Path -LiteralPath $readyFile) "OpenRouter fixture did not start: $action"
            $output = & pwsh -NoProfile -File $powerShellScripts[2] -Action $action -ApiBaseUri "http://127.0.0.1:$port" 2>&1
            if ($LASTEXITCODE -ne 0) {
                $null = Wait-Job -Job $job -Timeout 5
                $fixtureFailure = (Receive-Job -Job $job 2>&1 | Out-String).Trim()
                throw "OpenRouter admin fixture failed: $action; fixture=$fixtureFailure"
            }
            Assert-True ($output -eq "OPENROUTER-KEY-ADMIN-SUCCESS:$action") "OpenRouter admin fixture returned unexpected output: $action"
            $null = Wait-Job -Job $job -Timeout 30
            $fixtureResult = (Receive-Job -Job $job | Out-String).Trim()
            Assert-True ($fixtureResult -eq 'FIXTURE-PASS') "OpenRouter fixture rejected a request: $action"
        } finally {
            Stop-Job -Job $job -ErrorAction SilentlyContinue
            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
        }
    }
} finally {
    foreach ($name in $priorSecretEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($name, $priorSecretEnvironment[$name], 'Process')
    }
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}

Write-Output 'PRODUCTION-TOOLING-TESTS:PASS'
