<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Merchant extends Model
{
    protected $table = 'merchants';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'name',
        'email',
        'password_hash',
        'phone',
        'server_key',
        'client_key',
        'webhook_secret',
        'webhook_url',
        'provider',
        'custom_qris',
    ];

    protected $hidden = [
        'password_hash',
    ];

    public function payments()
    {
        return $this->hasMany(QrispayPayment::class, 'merchant_id', 'id');
    }
}
