param(
  [Parameter(Mandatory = $true)]
  [string]$Root,

  [Parameter(Mandatory = $true)]
  [int]$Port
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-ContentType {
  param([string]$Path)

  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".mjs" { "text/javascript; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".wgsl" { "text/plain; charset=utf-8" }
    ".ts" { "text/plain; charset=utf-8" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".svg" { "image/svg+xml; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    default { "application/octet-stream" }
  }
}

$resolvedRoot = [System.IO.Path]::GetFullPath($Root)
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
      if ([string]::IsNullOrWhiteSpace($requestPath) -or $requestPath -eq "/") {
        $requestPath = "/index.html"
      }

      $relativePath = $requestPath.TrimStart("/").Replace("/", "\")
      $filePath = [System.IO.Path]::GetFullPath((Join-Path $resolvedRoot $relativePath))

      if (-not $filePath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $context.Response.StatusCode = 403
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
      } elseif (-not [System.IO.File]::Exists($filePath)) {
        $context.Response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
      } else {
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $context.Response.StatusCode = 200
        $context.Response.ContentType = Get-ContentType -Path $filePath
      }

      $context.Response.Headers["Cache-Control"] = "no-store"
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $payload = [System.Text.Encoding]::UTF8.GetBytes($_.Exception.Message)
      $context.Response.StatusCode = 500
      $context.Response.ContentType = "text/plain; charset=utf-8"
      $context.Response.ContentLength64 = $payload.Length
      $context.Response.OutputStream.Write($payload, 0, $payload.Length)
    } finally {
      $context.Response.OutputStream.Close()
      $context.Response.Close()
    }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
