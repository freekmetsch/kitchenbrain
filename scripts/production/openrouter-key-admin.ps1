[CmdletBinding()]
param(
    [Parameter(Mandatory, ParameterSetName = 'Action')]
    [ValidateSet('VerifyNew', 'CapOld', 'DeleteOld')]
    [string]$Action,

    [Parameter(ParameterSetName = 'Action')]
    [ValidatePattern('^https://openrouter\.ai$|^http://127\.0\.0\.1:[0-9]{2,5}$')]
    [string]$ApiBaseUri = 'https://openrouter.ai',

    [Parameter(Mandatory, ParameterSetName = 'Validate')]
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'

function Invoke-OpenRouterRequest {
    param(
        [ValidateSet('GET', 'PATCH', 'DELETE')]
        [string]$Method,
        [string]$Path,
        [string]$Bearer,
        [AllowNull()][hashtable]$Body,
        [int[]]$ExpectedStatus
    )

    if ([string]::IsNullOrWhiteSpace($Bearer)) {
        throw 'Provider credential is missing.'
    }

    $handler = [Net.Http.HttpClientHandler]::new()
    $client = [Net.Http.HttpClient]::new($handler)
    try {
        $client.Timeout = [TimeSpan]::FromSeconds(30)
        $request = [Net.Http.HttpRequestMessage]::new(
            [Net.Http.HttpMethod]::new($Method),
            "$ApiBaseUri$Path"
        )
        try {
            $request.Headers.Authorization =
                [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Bearer)
            if ($null -ne $Body) {
                $json = $Body | ConvertTo-Json -Compress
                $request.Content = [Net.Http.StringContent]::new(
                    $json,
                    [Text.Encoding]::UTF8,
                    'application/json'
                )
            }
            $response = $client.Send($request)
            try {
                $responseText = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                if ($ExpectedStatus -notcontains [int]$response.StatusCode) {
                    throw 'Provider request failed.'
                }
                if ([string]::IsNullOrWhiteSpace($responseText)) {
                    return $null
                }
                return $responseText | ConvertFrom-Json -Depth 100
            } finally {
                $responseText = $null
                $response.Dispose()
            }
        } finally {
            $json = $null
            $request.Dispose()
        }
    } finally {
        $client.Dispose()
        $handler.Dispose()
    }
}

function Get-OldKeyRecord {
    param(
        [string]$OldAppKey,
        [string]$ManagementKey
    )

    $current = Invoke-OpenRouterRequest -Method GET -Path '/api/v1/key' -Bearer $OldAppKey -Body $null -ExpectedStatus @(200)
    if ($current.data.is_management_key -eq $true -or [string]::IsNullOrWhiteSpace([string]$current.data.label)) {
        throw 'Old application key metadata is invalid.'
    }
    $list = Invoke-OpenRouterRequest -Method GET -Path '/api/v1/keys?include_disabled=true' -Bearer $ManagementKey -Body $null -ExpectedStatus @(200)
    $keyMatches = @($list.data | Where-Object { [string]$_.label -ceq [string]$current.data.label })
    if ($keyMatches.Count -ne 1) {
        throw 'Old application key could not be identified uniquely.'
    }
    $keyHash = [string]$keyMatches[0].hash
    if ($keyHash -cnotmatch '\A[a-f0-9]{64}\z') {
        throw 'Old application key could not be identified uniquely.'
    }
    return $keyMatches[0]
}

if ($ValidateOnly) {
    Write-Output 'OPENROUTER-KEY-ADMIN-VALID'
    exit 0
}

$managementKey = $env:HOUSEHOLD_BRAIN_OPENROUTER_MANAGEMENT_KEY
$oldAppKey = $env:HOUSEHOLD_BRAIN_OLD_OPENROUTER_API_KEY
$newAppKey = $env:HOUSEHOLD_BRAIN_NEW_OPENROUTER_API_KEY

try {
    switch ($Action) {
        'VerifyNew' {
            $current = Invoke-OpenRouterRequest -Method GET -Path '/api/v1/key' -Bearer $newAppKey -Body $null -ExpectedStatus @(200)
            if ($current.data.is_management_key -eq $true) {
                throw 'Replacement is not an application key.'
            }
        }
        'CapOld' {
            $oldRecord = Get-OldKeyRecord -OldAppKey $oldAppKey -ManagementKey $managementKey
            $updated = Invoke-OpenRouterRequest `
                -Method PATCH `
                -Path "/api/v1/keys/$($oldRecord.hash)" `
                -Bearer $managementKey `
                -Body @{
                    limit = 1
                    limit_reset = 'daily'
                    include_byok_in_limit = $true
                } `
                -ExpectedStatus @(200)
            if (
                [string]$updated.data.hash -cne [string]$oldRecord.hash -or
                [double]$updated.data.limit -ne 1 -or
                [string]$updated.data.limit_reset -cne 'daily'
            ) {
                throw 'Provider did not confirm the old-key cap.'
            }
        }
        'DeleteOld' {
            $oldRecord = Get-OldKeyRecord -OldAppKey $oldAppKey -ManagementKey $managementKey
            $deleted = Invoke-OpenRouterRequest `
                -Method DELETE `
                -Path "/api/v1/keys/$($oldRecord.hash)" `
                -Bearer $managementKey `
                -Body @{} `
                -ExpectedStatus @(200)
            if ($deleted.deleted -ne $true) {
                throw 'Provider did not confirm old-key deletion.'
            }
        }
    }
    Write-Output "OPENROUTER-KEY-ADMIN-SUCCESS:$Action"
} catch {
    Write-Error "OpenRouter key administration failed for $Action. Provider details were suppressed."
    exit 1
} finally {
    $managementKey = $null
    $oldAppKey = $null
    $newAppKey = $null
    $current = $null
    $oldRecord = $null
    $updated = $null
    $deleted = $null
}
