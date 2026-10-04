<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Qrispay API Gateway Configuration
    |--------------------------------------------------------------------------
    | Konfigurasi gateway pembayaran QRIS untuk aplikasi Laravel.
    | Mendukung gateway mandiri VPS (Node.js/Docker) maupun InfinityFree (PHP).
    */

    'base_url' => env('QRISPAY_BASE_URL', 'http://localhost:3000'),

    'api_key' => env('QRISPAY_API_KEY', ''),

    'webhook_secret' => env('QRISPAY_WEBHOOK_SECRET', ''),

    'callback_url' => env('QRISPAY_CALLBACK_URL', env('APP_URL') . '/api/qrispay/webhook'),

    // Masa berlaku tagihan QRIS dalam menit
    'expiry_minutes' => env('QRISPAY_EXPIRY_MINUTES', 15),
];
