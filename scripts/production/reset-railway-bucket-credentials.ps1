[CmdletBinding()]
param(
    [Parameter(Mandatory, ParameterSetName = 'Reset')]
    [switch]$Reset,

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

function Get-RailwayInvocation {
    if ($IsWindows) {
        $nodePath = Resolve-UniqueApplicationPath 'node'
        $railwayScript = Join-Path $env:APPDATA 'npm\node_modules\@railway\cli\bin\railway.js'
        if (-not (Test-Path -LiteralPath $railwayScript -PathType Leaf)) {
            throw 'Railway CLI entry point is missing.'
        }
        return [pscustomobject]@{
            FileName = $nodePath
            PrefixArguments = @($railwayScript)
        }
    }
    return [pscustomobject]@{
        FileName = (Resolve-UniqueApplicationPath 'railway')
        PrefixArguments = @()
    }
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
    Write-Output 'RAILWAY-BUCKET-RESET-VALID'
    exit 0
}

try {
    $railway = Get-RailwayInvocation
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $railway.FileName
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @($railway.PrefixArguments) + @(
        'bucket', 'credentials',
        '--reset',
        '--yes',
        '--bucket', 'household-brain-litestream',
        '--environment', 'production'
    )) {
        [void]$start.ArgumentList.Add($argument)
    }
    $start.Environment['RAILWAY_CALLER'] = 'skill:use-railway@1.3.6'
    $start.Environment['RAILWAY_AGENT_SESSION'] = 'railway-skill-20260728-shopping-recovery'

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not (Wait-ForProcess -Process $process -TimeoutMilliseconds 120000)) {
            throw 'Railway bucket reset timed out.'
        }
        if (-not [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($stdout, $stderr)).Wait(2000)) {
            throw 'Railway bucket reset output capture did not close.'
        }
        if ($process.ExitCode -ne 0) {
            throw 'Railway bucket reset failed.'
        }
    } finally {
        try { $process.StandardOutput.Close() } catch {}
        try { $process.StandardError.Close() } catch {}
        $process.Dispose()
    }
    Write-Output 'RAILWAY-BUCKET-RESET-SUCCESS'
} catch {
    Write-Error 'Railway bucket credential reset failed. Child output was suppressed.'
    exit 1
}
