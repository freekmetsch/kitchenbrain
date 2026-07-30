[CmdletBinding()]
param(
    [Parameter(Mandatory, ParameterSetName = 'Stage')]
    [ValidateSet('OpenRouter', 'FreekLogin', 'YlfaLogin', 'LitestreamReferences', 'RemoveRecipeTimerAlerts')]
    [string]$Profile,

    [Parameter(Mandatory, ParameterSetName = 'Validate')]
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

$projectId = 'a8fd74d7-2c0e-4d95-a310-7c13dc1c7936'
$environmentName = 'production'
$serviceName = 'household-brain'

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
        $npmRoot = Join-Path $env:APPDATA 'npm'
        $railwayScript = Join-Path $npmRoot 'node_modules\@railway\cli\bin\railway.js'
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

function Invoke-RailwayVariableWrite {
    param(
        [string]$VariableName,
        [string]$VariableValue,
        [AllowNull()][pscustomobject]$Invocation = $null
    )

    if ([string]::IsNullOrWhiteSpace($VariableValue) -or $VariableValue.Length -gt 16384) {
        throw 'Railway variable input is absent or oversized.'
    }

    $railway = if ($null -ne $Invocation) { $Invocation } else { Get-RailwayInvocation }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $railway.FileName
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @($railway.PrefixArguments) + @(
        'variable', 'set', $VariableName,
        '--stdin',
        '--skip-deploys',
        '--project', $projectId,
        '--environment', $environmentName,
        '--service', $serviceName
    )) {
        [void]$start.ArgumentList.Add($argument)
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        $process.StandardInput.Write($VariableValue)
        $process.StandardInput.Close()
        if (-not (Wait-ForProcess -Process $process -TimeoutMilliseconds 30000)) {
            throw 'Railway variable write timed out.'
        }
        if (-not [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($stdout, $stderr)).Wait(2000)) {
            throw 'Railway output capture did not close.'
        }
        if ($process.ExitCode -ne 0) {
            throw 'Railway rejected the variable write.'
        }
    } finally {
        try { $process.StandardInput.Close() } catch {}
        try { $process.StandardOutput.Close() } catch {}
        try { $process.StandardError.Close() } catch {}
        $process.Dispose()
        $VariableValue = $null
    }
}

function Invoke-RailwayVariableDelete {
    param(
        [ValidateSet('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT')]
        [string]$VariableName,
        [AllowNull()][pscustomobject]$Invocation = $null
    )

    $railway = if ($null -ne $Invocation) { $Invocation } else { Get-RailwayInvocation }
    $start = [Diagnostics.ProcessStartInfo]::new()
    $start.FileName = $railway.FileName
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @($railway.PrefixArguments) + @(
        'variable', 'delete', $VariableName,
        '--project', $projectId,
        '--environment', $environmentName,
        '--service', $serviceName
    )) {
        [void]$start.ArgumentList.Add($argument)
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not (Wait-ForProcess -Process $process -TimeoutMilliseconds 30000)) {
            throw 'Railway variable deletion result is indeterminate.'
        }
        if (-not [Threading.Tasks.Task]::WhenAll([Threading.Tasks.Task[]]@($stdout, $stderr)).Wait(2000)) {
            throw 'Railway variable deletion output capture did not close.'
        }
        if ($process.ExitCode -ne 0) {
            throw 'Railway rejected the variable deletion.'
        }
    } finally {
        try { $process.StandardInput.Close() } catch {}
        try { $process.StandardOutput.Close() } catch {}
        try { $process.StandardError.Close() } catch {}
        $process.Dispose()
    }
}

if ($ValidateOnly) {
    $parameterNames = $MyInvocation.MyCommand.Parameters.Keys
    if ($parameterNames -contains 'Value' -or $parameterNames -contains 'Secret') {
        throw 'A secret-bearing command parameter exists.'
    }
    $fixtureValue = 'railway-stdin-fixture'
    $fixtureScript = @'
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const expectedArgs = [
    'variable', 'set', 'OPENROUTER_API_KEY', '--stdin', '--skip-deploys',
    '--project', 'a8fd74d7-2c0e-4d95-a310-7c13dc1c7936',
    '--environment', 'production', '--service', 'household-brain'
  ];
  const argsMatch = JSON.stringify(process.argv.slice(1)) === JSON.stringify(expectedArgs);
  const secretStayedOffArgv = !process.argv.includes('railway-stdin-fixture');
  process.exit(input === 'railway-stdin-fixture' && argsMatch && secretStayedOffArgv ? 0 : 9);
});
'@
    Invoke-RailwayVariableWrite `
        -VariableName 'OPENROUTER_API_KEY' `
        -VariableValue $fixtureValue `
        -Invocation ([pscustomobject]@{
            FileName = (Resolve-UniqueApplicationPath 'node')
            PrefixArguments = @('-e', $fixtureScript)
        })
    $fixtureValue = $null
    $fixtureScript = $null

    $deleteFixtureScript = @'
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const args = process.argv.slice(1);
  const variableName = args[2];
  const allowedVariables = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
  const expectedArgs = [
    'variable', 'delete', variableName,
    '--project', 'a8fd74d7-2c0e-4d95-a310-7c13dc1c7936',
    '--environment', 'production', '--service', 'household-brain'
  ];
  const argsMatch = JSON.stringify(args) === JSON.stringify(expectedArgs);
  process.stdout.write('DELETE-STDOUT-CANARY\n');
  process.stderr.write('DELETE-STDERR-CANARY\n');
  process.exitCode = input === '' && allowedVariables.includes(variableName) && argsMatch ? 0 : 9;
});
'@
    foreach ($fixtureVariable in @('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT')) {
        Invoke-RailwayVariableDelete `
            -VariableName $fixtureVariable `
            -Invocation ([pscustomobject]@{
                FileName = (Resolve-UniqueApplicationPath 'node')
                PrefixArguments = @('-e', $deleteFixtureScript)
            })
    }
    $deleteFixtureScript = $null
    Write-Output 'RAILWAY-CONFIG-STAGER-VALID'
    exit 0
}

$writes = switch ($Profile) {
    'OpenRouter' {
        @(
            @{
                Name = 'OPENROUTER_API_KEY'
                Value = $env:HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY
            },
            @{
                Name = 'ANTHROPIC_API_KEY'
                Value = 'disabled-after-20260728-containment'
            }
        )
    }
    'FreekLogin' {
        @(
            @{
                Name = 'PWA_USER_FREEK_PASSWORD'
                Value = $env:HOUSEHOLD_BRAIN_FREEK_PASSWORD
            }
        )
    }
    'YlfaLogin' {
        @(
            @{
                Name = 'PWA_USER_YLFA_PASSWORD'
                Value = $env:HOUSEHOLD_BRAIN_YLFA_PASSWORD
            }
        )
    }
    'LitestreamReferences' {
        @(
            @{
                Name = 'LITESTREAM_R2_BUCKET'
                Value = '${{household-brain-litestream.BUCKET}}'
            },
            @{
                Name = 'LITESTREAM_R2_ENDPOINT'
                Value = '${{household-brain-litestream.ENDPOINT}}'
            },
            @{
                Name = 'LITESTREAM_R2_ACCESS_KEY_ID'
                Value = '${{household-brain-litestream.ACCESS_KEY_ID}}'
            },
            @{
                Name = 'LITESTREAM_R2_SECRET_ACCESS_KEY'
                Value = '${{household-brain-litestream.SECRET_ACCESS_KEY}}'
            }
        )
    }
    'RemoveRecipeTimerAlerts' {
        @()
    }
}

$deletes = if ($Profile -eq 'RemoveRecipeTimerAlerts') {
    @('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT')
} else {
    @()
}

try {
    foreach ($write in $writes) {
        Invoke-RailwayVariableWrite -VariableName $write.Name -VariableValue $write.Value
    }
    $deleteFailures = [Collections.Generic.List[string]]::new()
    foreach ($delete in $deletes) {
        try {
            Invoke-RailwayVariableDelete -VariableName $delete
        } catch {
            $deleteFailures.Add($delete)
        }
    }
    if ($deleteFailures.Count -gt 0) {
        throw "Railway variable deletion failed or is indeterminate for: $($deleteFailures -join ', ')"
    }
    Write-Output "RAILWAY-CONFIG-STAGED:$Profile"
} catch {
    Write-Error "Railway config staging failed for profile $Profile. $($_.Exception.Message) Child output was suppressed."
    exit 1
} finally {
    $writes = $null
    $deletes = $null
}
