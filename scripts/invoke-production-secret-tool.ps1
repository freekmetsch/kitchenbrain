[CmdletBinding()]
param(
    [Parameter(Mandatory, ParameterSetName = 'Run')]
    [ValidateSet(
        'CreateOpenRouterAppKey',
        'StageOpenRouter',
        'StageFreekLogin',
        'StageYlfaLogin',
        'VerifyFreekAuth',
        'VerifyYlfaAuth',
        'VerifyOpenRouterNew',
        'CapOpenRouterOld',
        'DeleteOpenRouterOld'
    )]
    [string]$Tool,

    [Parameter(Mandatory, ParameterSetName = 'Validate')]
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

function Resolve-UniqueApplicationPath {
    param([string]$Name)

    $commands = @(Get-Command $Name -CommandType Application -ErrorAction Stop)
    $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($command in $commands) {
        [void]$paths.Add([IO.Path]::GetFullPath([string]$command.Source))
    }
    if ($paths.Count -ne 1) {
        throw 'Application command resolution is ambiguous.'
    }
    return @($paths)[0]
}

function Wait-ForProcess {
    param([Diagnostics.Process]$Process, [int]$TimeoutMilliseconds)

    if ($Process.WaitForExit($TimeoutMilliseconds)) {
        return $true
    }
    try { $Process.Kill($true) } catch {}
    try { [void]$Process.WaitForExit(2000) } catch {}
    return $false
}

if ($ValidateOnly) {
    $parameterNames = $MyInvocation.MyCommand.Parameters.Keys
    if ($parameterNames -contains 'Value' -or $parameterNames -contains 'Secret') {
        throw 'A secret-bearing command parameter exists.'
    }
    Write-Output 'PRODUCTION-SECRET-TOOL-VALID'
    exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$envTemplate = Join-Path $repoRoot '.env.template'
$railwayStager = Join-Path $PSScriptRoot 'production\stage-railway-config.ps1'
$openRouterAdmin = Join-Path $PSScriptRoot 'production\openrouter-key-admin.ps1'
$openRouterCreator = Join-Path $PSScriptRoot 'production\create-openrouter-app-key.ps1'
$authCanary = Join-Path $PSScriptRoot 'production\verify-production-auth.mjs'

$childArguments = switch ($Tool) {
    'CreateOpenRouterAppKey' {
        @('-NoProfile', '-File', $openRouterCreator)
    }
    'StageOpenRouter' {
        @('-NoProfile', '-File', $railwayStager, '-Profile', 'OpenRouter')
    }
    'StageFreekLogin' {
        @('-NoProfile', '-File', $railwayStager, '-Profile', 'FreekLogin')
    }
    'StageYlfaLogin' {
        @('-NoProfile', '-File', $railwayStager, '-Profile', 'YlfaLogin')
    }
    'VerifyFreekAuth' {
        @($authCanary, '--account', 'freek')
    }
    'VerifyYlfaAuth' {
        @($authCanary, '--account', 'ylfa')
    }
    'VerifyOpenRouterNew' {
        @('-NoProfile', '-File', $openRouterAdmin, '-Action', 'VerifyNew')
    }
    'CapOpenRouterOld' {
        @('-NoProfile', '-File', $openRouterAdmin, '-Action', 'CapOld')
    }
    'DeleteOpenRouterOld' {
        @('-NoProfile', '-File', $openRouterAdmin, '-Action', 'DeleteOld')
    }
}

try {
    $childScript = if ($Tool -like 'Verify*Auth') {
        $childArguments[0]
    } else {
        $childArguments[2]
    }
    if (
        -not (Test-Path -LiteralPath $envTemplate -PathType Leaf) -or
        -not (Test-Path -LiteralPath $childScript -PathType Leaf)
    ) {
        throw 'Production tool input is missing.'
    }

    $opPath = Resolve-UniqueApplicationPath 'op'
    $pwshPath = Join-Path $PSHOME 'pwsh.exe'
    $childExecutable = if ($Tool -like 'Verify*Auth') {
        Resolve-UniqueApplicationPath 'node'
    } else {
        $pwshPath
    }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $opPath
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @('run', "--env-file=$envTemplate", '--', $childExecutable) + $childArguments) {
        [void]$start.ArgumentList.Add($argument)
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not (Wait-ForProcess -Process $process -TimeoutMilliseconds 600000)) {
            throw 'Production secret tool timed out.'
        }
        if (-not [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($stdout, $stderr)).Wait(2000)) {
            throw 'Production secret tool output capture did not close.'
        }
        if ($process.ExitCode -ne 0) {
            throw 'Production secret tool failed.'
        }
    } finally {
        try { $process.StandardOutput.Close() } catch {}
        try { $process.StandardError.Close() } catch {}
        $process.Dispose()
    }

    Write-Output "PRODUCTION-SECRET-TOOL-SUCCESS:$Tool"
} catch {
    Write-Error "Production secret tool failed for $Tool. Child output was suppressed."
    exit 1
} finally {
    $childArguments = $null
}
