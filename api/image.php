<?php
$allowedHosts = [
    'steamcommunity-a.akamaihd.net',
    'community.cloudflare.steamstatic.com',
    'steamcdn-a.akamaihd.net',
    'steamcommunity.com',
];

$imageUrl = isset($_GET['url']) ? trim($_GET['url']) : '';
if ($imageUrl === '' || !preg_match('/^https?:\/\//i', $imageUrl)) {
    http_response_code(400);
    echo 'Invalid image URL';
    exit;
}

$parts = parse_url($imageUrl);
$host = isset($parts['host']) ? strtolower($parts['host']) : '';
if ($host === '' || !in_array($host, $allowedHosts, true)) {
    http_response_code(403);
    echo 'Host not allowed';
    exit;
}

$cacheFile = sys_get_temp_dir() . '/steam-image-' . md5($imageUrl) . '.bin';
$cacheTtlSeconds = 60;
if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtlSeconds) {
    $data = file_get_contents($cacheFile);
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->buffer($data) ?: 'application/octet-stream';
    header('Content-Type: ' . $mime);
    echo $data;
    exit;
}

$ch = curl_init($imageUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept: image/*'
]);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$data = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($data === false || $httpCode >= 400) {
    http_response_code(502);
    echo 'Failed to fetch image';
    exit;
}

file_put_contents($cacheFile, $data);
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->buffer($data) ?: 'application/octet-stream';
header('Content-Type: ' . $mime);
echo $data;
