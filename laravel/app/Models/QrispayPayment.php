<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class QrispayPayment extends Model
{
    protected $table = 'qrispay_payments';

    protected $fillable = [
        'qris_id',
        'order_id',
        'merchant_id',
        'amount',
        'unique_code',
        'total',
        'mdr_fee',
        'net_amount',
        'status',
        'qris_string',
        'payment_link',
        'provider',
        'customer_name',
        'description',
        'paid_at',
        'expires_at',
    ];

    protected $casts = [
        'amount' => 'integer',
        'unique_code' => 'integer',
        'total' => 'integer',
        'mdr_fee' => 'integer',
        'net_amount' => 'integer',
        'paid_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function merchant()
    {
        return $this->belongsTo(Merchant::class, 'merchant_id', 'id');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopePaid($query)
    {
        return $query->where('status', 'paid');
    }

    public function isPaid(): bool
    {
        return $this->status === 'paid';
    }

    public function isExpired(): bool
    {
        return $this->status === 'expired' || ($this->status === 'pending' && $this->expires_at && now()->isAfter($this->expires_at));
    }
}
