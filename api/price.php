<?php
header('Content-Type: application/json');

$marketHashName = isset($_GET['market_hash_name']) ? trim($_GET['market_hash_name']) : '';
if ($marketHashName === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing market_hash_name']);
    exit;
}

$cacheKey = md5($marketHashName);
$cacheDir = sys_get_temp_dir();
$cacheFile = $cacheDir . '/steam-price-' . $cacheKey . '.json';
$cacheTtlSeconds = 86400; // 24 hours cache

// Check valid cache first
if (file_exists($cacheFile)) {
    $fileAge = time() - filemtime($cacheFile);
    if ($fileAge < $cacheTtlSeconds) {
        $cached = file_get_contents($cacheFile);
        if ($cached !== false) {
            echo $cached;
            exit;
        }
    }
}

// Fetch from Steam API
$query = http_build_query([
    'appid' => '730',
    'currency' => '1',
    'market_hash_name' => $marketHashName,
]);

$url = 'https://steamcommunity.com/market/priceoverview/?' . $query;
$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept: application/json'
]);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

// If fresh fetch fails, return last cached value (even if stale) or error
if ($response === false || $httpCode >= 400) {
    if (file_exists($cacheFile)) {
        $cached = file_get_contents($cacheFile);
        if ($cached !== false) {
            // Return stale cache as fallback
            echo $cached;
            exit;
        }
    }
    
    http_response_code(200);
    echo json_encode(['error' => 'Price unavailable', 'lowest_price' => null]);
    exit;
}

// Cache successful response
@file_put_contents($cacheFile, $response);
echo $response;
