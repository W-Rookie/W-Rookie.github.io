param(
    [Parameter(Mandatory = $true)]
    [string]$DraftPath
)

$ErrorActionPreference = 'Stop'
$source = (Resolve-Path -LiteralPath $DraftPath).Path
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($source.StartsWith($repoRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw '평문 초안은 공개 저장소 밖에 두어야 합니다.'
}

$first = Read-Host '비밀글에 사용할 새 비밀번호를 입력하세요' -AsSecureString
$second = Read-Host '같은 비밀번호를 다시 입력하세요' -AsSecureString
$password = [System.Net.NetworkCredential]::new('', $first).Password
$confirmation = [System.Net.NetworkCredential]::new('', $second).Password
if ($password -ne $confirmation) { throw '두 비밀번호가 일치하지 않습니다.' }
if ($password.Length -lt 12) { throw '12자 이상의 비밀번호를 사용해 주세요.' }

$salt = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(16)
$iv = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
$iterations = 310000
$key = [System.Security.Cryptography.Rfc2898DeriveBytes]::Pbkdf2(
    $password, $salt, $iterations,
    [System.Security.Cryptography.HashAlgorithmName]::SHA256, 32
)
$plain = [System.IO.File]::ReadAllBytes($source)
$ciphertext = [byte[]]::new($plain.Length)
$tag = [byte[]]::new(16)
$aes = [System.Security.Cryptography.AesGcm]::new($key, 16)
try { $aes.Encrypt($iv, $plain, $ciphertext, $tag) }
finally {
    $aes.Dispose()
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($key)
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plain)
}

$payload = [ordered]@{
    version = 1
    kdf = 'PBKDF2-SHA256'
    iterations = $iterations
    cipher = 'AES-256-GCM'
    salt = [Convert]::ToBase64String($salt)
    iv = [Convert]::ToBase64String($iv)
    ciphertext = [Convert]::ToBase64String($ciphertext)
    tag = [Convert]::ToBase64String($tag)
}
$output = Join-Path $repoRoot 'assets\rookies-sqli.enc.json'
[System.IO.File]::WriteAllText($output, ($payload | ConvertTo-Json -Compress), [System.Text.UTF8Encoding]::new($false))
Write-Output '비밀글 본문을 암호화했습니다. 비밀번호는 파일에 저장되지 않았습니다.'
