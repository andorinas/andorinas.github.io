# Genera un WAV por escena con la voz de Windows (Microsoft Laura, español).
# Uso: powershell -File voces.ps1 voces.json   (lista de { archivo, texto })
param([string]$Lista)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
function Esperar($op, [Type]$tipo) { $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }

$s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$s.Voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.DisplayName -like '*Laura*' } | Select-Object -First 1
$s.Options.SpeakingRate = 1.05
$items = Get-Content -Raw -Encoding UTF8 $Lista | ConvertFrom-Json
foreach ($it in $items) {
  $stream = Esperar ($s.SynthesizeTextToStreamAsync($it.texto)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $n = [uint32]$stream.Size
  Esperar ($reader.LoadAsync($n)) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $n
  $reader.ReadBytes($bytes)
  [IO.File]::WriteAllBytes($it.archivo, $bytes)
  Write-Output ("voz " + [IO.Path]::GetFileName($it.archivo))
}
