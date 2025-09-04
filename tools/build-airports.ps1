Param(
  [string]$OutPath = "assets/data/airports.min.json"
)

$ErrorActionPreference = 'Stop'

function Write-Info($msg) { Write-Host "[airports] $msg" }

$base = 'https://ourairports.com/data'
$tmpDir = Join-Path $env:TEMP "ourairports_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
New-Item -Path $tmpDir -ItemType Directory -Force | Out-Null

$airportsCsv = Join-Path $tmpDir 'airports.csv'
$countriesCsv = Join-Path $tmpDir 'countries.csv'

Write-Info "Downloading airports.csv and countries.csv ..."
Invoke-WebRequest -Uri "$base/airports.csv" -OutFile $airportsCsv
Invoke-WebRequest -Uri "$base/countries.csv" -OutFile $countriesCsv

Write-Info "Parsing CSV files ..."
$countries = @{}
Import-Csv -Path $countriesCsv | ForEach-Object {
  if ($_.code -and $_.name) { $countries[$_.code] = $_.name }
}

$rows = @()
Import-Csv -Path $airportsCsv | ForEach-Object {
  # Filters: has IATA, scheduled service, major airports
  if ($_.iata_code -and ($_.scheduled_service -eq 'yes') -and ($_.type -in @('large_airport','medium_airport'))) {
    $city = if ([string]::IsNullOrWhiteSpace($_.municipality)) { '' } else { $_.municipality }
    $cc = $_.iso_country
    $countryName = if ($countries.ContainsKey($cc)) { $countries[$cc] } else { $cc }
    $name = $_.name
    $code = $_.iata_code
    # Latitude/Longitude can be empty for some entries; coerce carefully
    $lat = $null; [double]::TryParse($_.latitude_deg, [ref]$lat) | Out-Null
    $lon = $null; [double]::TryParse($_.longitude_deg, [ref]$lon) | Out-Null

    $rows += [PSCustomObject]@{
      city    = $city
      country = $countryName
      name    = $name
      code    = $code
      lat     = $lat
      lon     = $lon
    }
  }
}

Write-Info ("Filtered airports: {0}" -f $rows.Count)

$outFile = Resolve-Path -LiteralPath $OutPath -ErrorAction SilentlyContinue
if (-not $outFile) {
  $outDir = Split-Path -Parent $OutPath
  if (-not (Test-Path $outDir)) { New-Item -Path $outDir -ItemType Directory -Force | Out-Null }
  $outFile = $OutPath
}

Write-Info "Writing minified JSON to $OutPath ..."
ConvertTo-Json $rows -Depth 1 -Compress | Out-File -FilePath $OutPath -Encoding UTF8

Write-Info "Done."
