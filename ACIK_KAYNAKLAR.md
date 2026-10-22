# Açık kaynak parçalarımız

## Uygulamanın kullandığı

- **Wine 11.18:** Windows programlarını çalıştıran temel motor. Gcenx'in [resmî Mac paketi](https://github.com/Gcenx/macOS_Wine_builds/releases/tag/11.18) indirilir. Wine'ın tamamını burada derlemedik.
- **Wine Mac grafik sürücüsü:** Aynı sürümün [resmî Wine kaynak kaydından](https://github.com/wine-mirror/wine/tree/7b3fff76fa5178f6ce0141b2c776afa2a822f101) bu projede derlendi. DXMT bağlantıları ve yeni pencere yüzeyi düzeni scripts/wine-dxmt-compat.c ile uyarlandı. Birleşik sürücü LGPL-2.1-or-later kapsamındadır. İkili, lisans, tam değiştirilmiş Wine kaynakları ve yapım yönergeleri [aynı sürümde](https://github.com/anilbirdan/coop-oyun/releases/tag/wine-driver-11.18-coop1) bulunur.
- **DXMT 0.80:** DirectX 10/11 grafik çevirisi. [Resmî hazır ikilisi](https://github.com/3Shain/dxmt/releases/tag/v0.80) indirilir; burada kaynak kodundan derlenmedi.
- **Node.js 22.23.3 ARM64 Mac:** Arayüz ve kurulum kodumuzu çalıştırır. [Resmî ikili](https://nodejs.org/dist/v22.23.3/) Mac uygulamasında lisansıyla birlikte gelir.

Paket adresleri, sürümleri, boyutları ve sabit SHA256 özetleri src/releases.mjs içindedir. Sürücü yalnız sınandığı Wine arşiviyle eşleşirse kurulur. Wine, DXMT ve Steam kullanıcı bilgisayarına indirilir; uygulama ZIP'ine oyun veya Steam hesabı eklenmez.

## Kopyalamadığımız ve elenen aday

- **Whisky:** SwiftUI arayüzü, WhiskyKit veya WhiskyWine projeye kopyalanmadı. Uygulama Whisky'nin değiştirilmiş sürümü değil. [Whisky kaynağı](https://github.com/Whisky-App/Whisky).
- **CrossOver uygulaması ve arayüzü:** Kodları kopyalanmadı. Wine ekosistemindeki katkıları yok sayıp Windows motorunu sıfırdan yazdığımızı iddia etmiyoruz.
- **Sikarugir:** Hazır Wine motoru geliştirme sırasında denendi; gerçek bulut Mac'te Windows ortamını açamadığı için mevcut otomatik kurulumdan çıkarıldı. Artık yardımcı kütüphane paketiyle birleştirilen Sikarugir motoru kullanılmıyor.
- **Apple D3DMetal:** Paketlenmedi veya kurulmadı. Grafik yolumuz DXMT; Mac'in kendi Metal sistem arayüzünü kullanır.

## Burada yazılan ve doğrulama sınırı

Türkçe yerel arayüz, doğrulanmış motor indirme/kurulum yönetimi, oyun başına ayrı ortam, Steam komutları, hata/test kayıtları, Mac paketleme ve bulut test betikleri burada yazıldı. Bunlar Wine'ın yerini almaz; açık kaynak motorları yönetir.

Gerçek bulut Mac'te Windows komutu, küçük bir Direct3D 11 görüntüsünün renk geri okuması ve sunulması, pencere boyutlandırma ve kapatıp yeniden açma geçti. Bu, Palworld/Bellwright/Raft açılışı, performansı veya arkadaş odası testi değildir. Güncel kanıt DOGRULAMA.md içindedir.

## 0.3.2 Steam arayüz uyarlaması

steam-mac-duzeltme dalının 2a8ca36 değişikliğindeki MIT lisanslı steamwebhelper yardımcı kaynağı kullanıldı. Valve özgün dosyası yedeklenir; yardımcı Mac derlemesinde kaynak koddan üretilir. Kaynak: https://github.com/anilbirdan/coop-oyun/tree/2a8ca36acf9e303c5f70684232a1a4e58cd52816/wrapper . Giriş ekranı, hesapla giriş ve oyun açılışı ayrı doğrulamalardır.
