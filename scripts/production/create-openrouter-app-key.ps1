$ErrorActionPreference = 'Stop'

$machineSetupRoot = 'C:\Users\metsc\Cloned_Repositories\freek-machine-setup'
$writer = Join-Path $machineSetupRoot 'bin\op-secret-write.ps1'
$producer = Join-Path $machineSetupRoot 'bin\secret-producers\openrouter-app-key.ps1'

if (
    -not (Test-Path -LiteralPath $writer -PathType Leaf) -or
    -not (Test-Path -LiteralPath $producer -PathType Leaf)
) {
    throw 'OpenRouter secret tooling is missing.'
}

& $writer `
    -Operation Edit `
    -Item 'household-brain-openrouter-20260728' `
    -Field 'credential' `
    -ProducerScript $producer `
    -ProducerArgument @(
        '-KeyName', 'household-brain-production-20260728',
        '-DailyLimitUsd', '1'
    ) `
    -InputFormat Json `
    -JsonProperty key

if ($LASTEXITCODE -ne 0) {
    throw 'OpenRouter application-key creation failed.'
}
