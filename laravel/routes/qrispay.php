<?php

use App\Http\Controllers\QrispayController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Qrispay SaaS Payment Gateway Routes
|--------------------------------------------------------------------------
| Tambahkan require __DIR__ . '/qrispay.php'; di dalam routes/api.php
*/

Route::prefix('api/qrispay')->group(function () {
    Route::post('/checkout', [QrispayController::class, 'checkout'])->name('qrispay.checkout');
    Route::post('/webhook', [QrispayController::class, 'webhook'])->name('qrispay.webhook');
    Route::post('/charge', [QrispayController::class, 'charge'])->name('qrispay.charge');
    Route::post('/snap/transactions', [QrispayController::class, 'snap'])->name('qrispay.snap');
});
