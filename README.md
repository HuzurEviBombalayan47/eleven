# ElevenLab

ElevenLabs TTS paneli.

## Özellikler

- Metin → MP3
- ElevenLabs seslerini API üzerinden listeler
- Ses seçimi
- Model seçimi
- Stability ayarı
- Similarity Boost ayarı
- Birden fazla yetkili API anahtarı arasında otomatik failover
- API kullanım durumunu gösterir
- Render üzerinde çalışmaya hazır

## Render Environment Variable

Render'da şu değişken oluşturulacak:

ELEVENLABS_API_KEYS

Birden fazla sana ait/yetkili API anahtarı varsa virgülle ayır:

KEY_1,KEY_2,KEY_3

API anahtarlarını GitHub'a koyma.

## Çalışma Mantığı

Metin
↓
ElevenLabs API
↓
Anahtar 1
↓
Kota / rate limit / yetki problemi varsa
↓
Anahtar 2
↓
Ses oluşturulur
↓
MP3 indirilir

Bu proje yeni hesap açarak ElevenLabs limitlerini aşmaz. Yalnızca kullanıcının yetkili olduğu API anahtarları arasında geçiş yapar.
