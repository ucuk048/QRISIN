# QRISPAY - CodeIgniter 3 & 4 Library

Integrasi payment gateway QRIS untuk framework CodeIgniter (CI3 & CI4) berbasis MySQL/MariaDB.

---

## 1. Setup Database

Jalankan perintah SQL dari file `schema.sql` di database MySQL Anda:

```sql
source schema.sql;
```

---

## 2. Pemasangan di CodeIgniter 3

1. Salin `Qrispay.php` ke direktori `application/libraries/Qrispay.php`.
2. Tambahkan konfigurasi di `application/config/config.php` atau buat `application/config/qrispay.php`:

```php
$config['qrispay'] = [
    'base_url'       => 'https://gateway-anda.com', // URL Vercel / VPS / InfinityFree
    'api_key'        => 'secret_key_anda',
    'webhook_secret' => 'webhook_secret_anda',
];
```

3. Contoh Controller (`application/controllers/Payment.php`):

```php
<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Payment extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->config('qrispay');
        $this->load->library('qrispay', $this->config->item('qrispay'));
        $this->load->database();
    }

    public function checkout() {
        $payment = $this->qrispay->createPayment([
            'order_id'    => 'INV-' . time(),
            'amount'      => 50000,
            'description' => 'Pembelian Layanan',
        ]);

        // Simpan ke database MySQL
        $this->db->insert('qrispay_transactions', [
            'qris_id'      => $payment['id'],
            'order_id'     => $payment['order_id'],
            'amount'       => $payment['amount'],
            'unique_code'  => $payment['unique_code'],
            'total'        => $payment['total'],
            'status'       => $payment['status'],
            'qris_string'  => $payment['qris_string'],
            'payment_link' => $payment['payment_link'],
            'expires_at'   => date('Y-m-d H:i:s', strtotime($payment['expires_at'])),
        ]);

        redirect($payment['payment_link']);
    }

    public function webhook() {
        $rawPayload = file_get_contents('php://input');
        $signature  = $this->input->get_request_header('X-Signature', TRUE);

        if (!$this->qrispay->verifyWebhook($rawPayload, $signature)) {
            show_error('Invalid Signature', 401);
            return;
        }

        $data = json_decode($rawPayload, true);
        if (($data['event'] ?? '') === 'payment.paid') {
            $this->db->where('qris_id', $data['payment']['id']);
            $this->db->update('qrispay_transactions', [
                'status'  => 'paid',
                'paid_at' => date('Y-m-d H:i:s'),
            ]);
        }

        echo json_encode(['status' => 'ok']);
    }
}
```

---

## 3. Pemasangan di CodeIgniter 4

1. Salin `Qrispay.php` ke direktori `app/Libraries/Qrispay.php` (tambahkan `namespace App\Libraries;` di baris atas bila diperlukan).
2. Tambahkan variabel environment di file `.env`:

```env
QRISPAY_BASE_URL=https://gateway-anda.com
QRISPAY_API_KEY=secret_key_anda
QRISPAY_WEBHOOK_SECRET=webhook_secret_anda
```

3. Panggil langsung di Controller menggunakan dependency injection atau instansiasi manual:

```php
use App\Libraries\Qrispay;

$qrispay = new Qrispay([
    'base_url'       => env('QRISPAY_BASE_URL'),
    'api_key'        => env('QRISPAY_API_KEY'),
    'webhook_secret' => env('QRISPAY_WEBHOOK_SECRET'),
]);
```
