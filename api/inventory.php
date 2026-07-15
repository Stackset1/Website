<?php
header('Content-Type: application/json');

$steamId = isset($_GET['steamid']) ? trim($_GET['steamid']) : '';
if ($steamId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Missing steamid']);
    exit;
}

$url = "https://steamcommunity.com/inventory/{$steamId}/730/2?l=english&count=500";
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
    echo json_encode(['error' => 'Failed to fetch inventory']);
    exit;
}

echo $response;
