<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Qrispay API Configuration
    |--------------------------------------------------------------------------
    | Base URL gateway Qrispay Anda (VPS, Vercel, atau cPanel).
    */
    'base_url' => env('QRISPAY_BASE_URL', 'http://localhost:3000'),

    /*
    | API Key rahasia dari variabel API_KEY di server Qrispay
    */
    'api_key' => env('QRISPAY_API_KEY', ''),

    /*
    | Webhook Secret untuk validasi HMAC-SHA256 dari gateway
    */
    'webhook_secret' => env('QRISPAY_WEBHOOK_SECRET', ''),

    /*
    | URL Callback default toko online Anda untuk menerima webhook pelunasan
    */
    'callback_url' => env('QRISPAY_CALLBACK_URL', env('APP_URL') . '/api/qrispay/webhook'),
];
