# Doğrulama kaydı — 21 Ekim 2026

## Geçen kontroller

`node --test`: son tamamlanan koşuda **22 / 22 geçti**, 0 başarısız. Windows üzerinde gerçek geçici dosya ve localhost bağlantıları kullanıldı. Wine komutları sahte çalıştırıcıyla sınandı; bu sayılar Wine veya oyun başarısı değildir.

- Mac dışındaki ortamda gerçek Wine işlemlerinin engellenmesi.
- Orijinal Wine'a dokunmadan özel kopya ve DXMT dosya özetleri.
- Yanlış Wine sürümünü reddetme; önceki motoru koruma.
- Oyun başına ayrı Steam/Wine ortamı ve motor bağlantısı.
- Kapatma komutunun yalnızca ilgili WINEPREFIX'e gönderilmesi.
- Başlatma isteğinin arka planda gönderilmesi; oynama süresine süre aşımı uygulanmaması.
- Yarım kalan hazırlığın ilk motorunda devam etmesi.
- Geçersiz oyun ve klasör dışına çıkma girişiminin reddi.
- Başarı bildirimi için cihaz/sürüm bilgisi; katılma ve oda kurma ayrımı.
- Bozuk JSON kaydının üzerine yazılmadan hata verilmesi.
- İkinci uygulama örneğine karşı veri kilidi.
- Gerçek Node alt süreciyle boşluk ve özel işaret içeren argümanlar; sıfır dışı çıkışın hata olması.
- Yerel API erişim anahtarı, yabancı site isteğini reddetme ve proje dosyalarını sunmama.
- Kullanıcı test bildiriminin kaydedilmesi ve dışa aktarılması.

`node --check`: src/server.mjs, src/engine.mjs ve public/app.js sözdizimi kontrolleri geçti.

## Ekran kontrolü

Yerel uygulama tarayıcıda açıldı. Bellwright, Palworld ve Raft kartları görüldü. Palworld penceresinde Windows Steam yolu, ayrı katılma/oda kurma adımları ve test formu görüldü. Kurulum ekranı ve Windows üzerinde devre dışı Mac düğmeleri kontrol edildi. Ana ekran görüntüsü ONIZLEME.png.

## Bulut Mac sonucu — 21 Ekim 2026

[39535358384 numaralı gerçek koşu](https://github.com/anilbirdan/coop-oyun/actions/runs/39535358384), kaynak c209d4b4958f5b129aeeff02dc033aaf019231eb:

- Apple M1 (Virtual), macOS 15.7.9, ARM64; Rosetta komutu geçti. M5 testi değildir.
- 23/23 yazılım kontrolü geçti. Bu kontroller oyun çalıştırmaz.
- Resmî motor arşivleri doğrulandı, kuruldu; gerçek Wine sürüm komutu geçti.
- Mac ZIP paketi üretildi, ditto ile açıldı. Paketteki ARM64 Node, erişim anahtarlı yerel API ve normal kapanış geçti.
- Paket macOS `open` ile açıldı; uygulamanın yerel API yanıtı ve kapanışı doğrulandı. Finder tıklaması veya görsel ekran testi yapılmadı.
- Windows ortamı başlatma BAŞARISIZ: wineboot çıkış 1. Grafik, Steam ve oyun/co-op sonucu yok. Sorun çözülmeden çalışan oyun uygulaması olarak sunulmaz.

Sınanan uygulama kaynak özeti: b7b20c44dba2d0fa0ce287157683cbb95d0cba78575aad4dd627e7c5c22be8d5. Yerel dağıtım ZIP'inin bu özetle eşleşmesi ayrıca gerekir.

## Bekleyen gerçek kontroller

Mac / M5 erişimi yok. Aşağıdakilerin hiçbiri başarı olarak işaretlenmedi:

- Gerçek Wine Sikarugir 11.0 revision 1 paketinin uygulamayla çalıştırılması.
- DXMT grafik çevirisinin bu Wine paketiyle yüklenmesi.
- Hedef M5'te Rosetta, macOS izinleri ve paket dış bağımlılıklarının uygunluğu.
- Valve adresinden canlı Steam indirmesi, kurulum ve çevrim içi giriş.
- Üç oyunun açılması, performansı, Windows odasına katılması, Mac'ten oda kurması.
- Dünyanın kaydedilip yeniden yüklenmesi ve 30 dakika bağlantı testi.

Paket imzalı/noter onaylı değildir. Node çalıştırıcısı içeren Mac .app paketi üretildi. ZIP bütünlüğü, Info.plist, ARM64 ikili başlığı ve Mac'te gereken çalıştırma izinleri kontrol edildi. Son paket boyutu ve SHA256: PAKET_DOGRULAMA.json. README önkoşulları geçerlidir.

## Gerçek indirilen dosyalarla inceleme

Resmî GitHub API dosya özetleri ve Node SHASUMS256 listesi okunarak arşivler indirildi. SHA256 değerleri eşleşti. Bütün arşivlerin dosya ve sembolik bağlantı yolları içeride kalıyor. ARM64 Node ikilisinin Mach-O başlığı ve sistem kütüphanelerine bağlantıları kontrol edildi.

Wine 11.18'in gerçek winemac.so dosyasında DXMT'nin kullandığı bağlantı bulunmadı; aday elendi. WS12WineSikarugir11.0_1 gerçek dosyasında `_macdrv_functions` dışa aktarımı var. DXMT 0.80 kaynağında bu tabloya dlsym ile erişildiği görüldü. Gerçek DXMT arşivi uygulamanın dosya bulma işleviyle açıldı: i386 dosyaları atlandı, x86_64 ve builtin biçimi doğru saptandı. Bu incelemeler herhangi bir Mac ikilisini çalıştırmadan yapıldı. Ayrıntı: VENDOR_DOGRULAMA.json.

0.2 son yerel ekran kontrolünde otomatik kurulum ve denetim düğmeleri görüldü; Windows'ta kapalı oldukları doğrulandı. Tarayıcı hata/uyarı kayıtları boştu. KURULUM-0.2.png yeni ekranı gösterir. Arka plan çalıştırma hata çıktıları da artık dosyaya alınır.
