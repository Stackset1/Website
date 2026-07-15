<?php
header('Content-Type: application/json');

$inspectUrl = isset($_GET['inspect_url']) ? trim($_GET['inspect_url']) : '';
if ($inspectUrl === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing inspect_url']);
    exit;
}

if (stripos($inspectUrl, 'steam://') !== 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid inspect_url']);
    exit;
}

$cacheKey = md5($inspectUrl);
$cacheFile = sys_get_temp_dir() . '/steam-float-' . $cacheKey . '.json';
$cacheTtlSeconds = 900;

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtlSeconds) {
    $cached = file_get_contents($cacheFile);
    if ($cached !== false) {
        echo $cached;
        exit;
    }
}

$query = http_build_query(['url' => $inspectUrl]);
$url = 'https://api.csgofloat.com/?' . $query;

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 20);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false || $httpCode >= 400) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch float']);
    exit;
}

file_put_contents($cacheFile, $response);
echo $response;
