<?php
/**
 * Qris.php - Parser & Dynamic QRIS Generator (EMVCo Standard)
 * Zero dependency - PHP 7.4 / 8.x compatible
 */

class Qris
{
    public static function crc16(string $str): string
    {
        $crc = 0xFFFF;
        $len = strlen($str);
        for ($i = 0; $i < $len; $i++) {
            $crc ^= (ord($str[$i]) << 8);
            for ($j = 0; $j < 8; $j++) {
                if (($crc & 0x8000) !== 0) {
                    $crc = (($crc << 1) ^ 0x1021) & 0xFFFF;
                } else {
                    $crc = ($crc << 1) & 0xFFFF;
                }
            }
        }
        return strtoupper(str_pad(dechex($crc), 4, '0', STR_PAD_LEFT));
    }

    public static function parseItems(string $str): array
    {
        $out = [];
        $i = 0;
        $len = strlen($str);
        while ($i < $len) {
            $tag = substr($str, $i, 2);
            $l = (int)substr($str, $i + 2, 2);
            if (!preg_match('/^\d{2}$/', $tag)) break;
            $val = substr($str, $i + 4, $l);
            $out[] = ['tag' => $tag, 'value' => $val];
            $i += 4 + $l;
        }
        return $out;
    }

    public static function validate(string $str): bool
    {
        if (strlen($str) < 30) {
            throw new InvalidArgumentException("QRIS string terlalu pendek");
        }
        if (substr($str, 0, 4) !== '0002') {
            throw new InvalidArgumentException("Format awal QRIS harus diawali Tag 00");
        }
        $crcIdx = strrpos($str, '6304');
        if ($crcIdx === false) {
            throw new InvalidArgumentException("Tag 63 (CRC) tidak ditemukan");
        }
        $actual = substr($str, $crcIdx + 4, 4);
        $expected = self::crc16(substr($str, 0, $crcIdx + 4));
        if (strtoupper($actual) !== strtoupper($expected)) {
            throw new InvalidArgumentException("Checksum CRC16 tidak cocok: $actual vs $expected");
        }
        return true;
    }

    public static function toDynamic(string $staticQris, int $amount): string
    {
        if ($amount < 1) {
            throw new InvalidArgumentException("Nominal harus lebih dari 0");
        }
        self::validate($staticQris);

        $items = array_filter(self::parseItems(trim($staticQris)), function($x) {
            return $x['tag'] !== '63' && $x['tag'] !== '54';
        });

        $out = [];
        $inserted = false;
        foreach ($items as $it) {
            if ($it['tag'] === '01') {
                $it['value'] = '12';
            }
            if (!$inserted && (int)$it['tag'] > 54) {
                $out[] = ['tag' => '54', 'value' => (string)$amount];
                $inserted = true;
            }
            $out[] = $it;
        }
        if (!$inserted) {
            $out[] = ['tag' => '54', 'value' => (string)$amount];
        }

        $body = '';
        foreach ($out as $it) {
            $val = $it['value'];
            $len = str_pad((string)strlen($val), 2, '0', STR_PAD_LEFT);
            $body .= $it['tag'] . $len . $val;
        }
        $body .= '6304';
        return $body . self::crc16($body);
    }
}
