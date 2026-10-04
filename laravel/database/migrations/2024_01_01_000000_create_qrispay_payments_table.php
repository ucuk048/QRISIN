<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations (MySQL / PostgreSQL / SQLite).
     */
    public function up(): void
    {
        Schema::create('qrispay_payments', function (Blueprint $table) {
            $table->id();
            $table->string('qris_id', 64)->unique()->index();
            $table->string('order_id', 191)->index();
            $table->string('merchant_id', 64)->default('mid_default')->index();
            $table->unsignedBigInteger('amount');
            $table->unsignedInteger('unique_code');
            $table->unsignedBigInteger('total')->index();
            $table->unsignedBigInteger('mdr_fee')->default(0);
            $table->unsignedBigInteger('net_amount')->default(0);
            $table->string('status', 32)->default('pending')->index(); // pending, paid, expired, cancelled
            $table->text('qris_string');
            $table->string('payment_link', 500);
            $table->string('provider', 32)->nullable();
            $table->string('customer_name', 191)->nullable();
            $table->text('description')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('qrispay_payments');
    }
};
