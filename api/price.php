<?php
header('Content-Type: application/json');

$marketHashName = isset($_GET['market_hash_name']) ? trim($_GET['market_hash_name']) : '';
if ($marketHashName === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing market_hash_name']);
    exit;
}

$cacheKey = md5($marketHashName);
$cacheFile = sys_get_temp_dir() . '/steam-price-' . $cacheKey . '.json';
$cacheTtlSeconds = 600;

if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTtlSeconds) {
    $cached = file_get_contents($cacheFile);
    if ($cached !== false) {
        echo $cached;
        exit;
    }
}

$query = http_build_query([
    'appid' => '730',
    'currency' => '1',
    'market_hash_name' => $marketHashName,
]);

$url = 'https://steamcommunity.com/market/priceoverview/?' . $query;
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 15);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Accept: application/json']);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($response === false || $httpCode >= 400) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to fetch price']);
    exit;
}

file_put_contents($cacheFile, $response);
echo $response;
