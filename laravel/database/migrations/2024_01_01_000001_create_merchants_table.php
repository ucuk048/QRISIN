<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('merchants', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('name', 191);
            $table->string('email', 191)->unique();
            $table->string('password_hash', 255);
            $table->string('phone', 64)->nullable();
            $table->string('server_key', 191)->unique();
            $table->string('client_key', 191)->unique();
            $table->string('webhook_secret', 191);
            $table->text('webhook_url')->nullable();
            $table->string('provider', 64)->default('platform');
            $table->text('custom_qris')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('merchants');
    }
};
