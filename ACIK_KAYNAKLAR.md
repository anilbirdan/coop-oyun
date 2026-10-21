# Açık kaynak parçalarımız

## Doğrudan kullandığımız

- **Wine'ın Sikarugir için hazırlanmış 11.0 revision 1 Mac ikilisi.** Windows programlarının çalıştırılmasını bu hazır motor yapar. Motoru burada yeniden yazmadık veya kaynak kodundan derlemedik. Resmî paket kullanıcı bilgisayarına indirilir; uygulamanın kaynak deposuna motor ikilisi eklenmez. https://github.com/Sikarugir-App/Engines ve https://github.com/Sikarugir-App/wine
- **DXMT 0.80 builtin hazır ikilisi.** DirectX 10/11 grafik çevirisi. Resmî paket indirilir ve Wine ortamına yerleştirilir. Kaynağı burada derlemedik; Mac sürücüsüyle bağlantısını incelemek için kaynak dosyasını okuduk. https://github.com/3Shain/dxmt
- **Gcenx Wine macOS 11.18 paketindeki yardımcı kütüphaneler.** Sikarugir motorunun ihtiyaç duyduğu libinotify ve diğer genel paylaşımlı kütüphaneler bu doğrulanmış paketten alınır. Bu paketin Wine sürücüsü veya motoru, seçili Sikarugir motorunun yerine geçirilmez. https://github.com/Gcenx/macOS_Wine_builds
- **Node.js 22.23.3 resmî ARM64 Mac ikilisi.** Bizim arayüz/kurulum/başlatma kodumuzu çalıştırır. Mac uygulama paketinde lisans metniyle birlikte bulunur. https://nodejs.org/

Kesin paket adresleri, boyutları ve SHA256 değerleri src/releases.mjs dosyasındadır. Lisans ve kullanım koşulları ilgili projelere aittir.

## Kopyalamadığımız

- **Whisky:** Kaynak ve bakım durumunu inceledik; SwiftUI arayüzünü, WhiskyKit'i veya WhiskyWine'ı projeye kopyalamadık. Uygulama Whisky'nin değiştirilmiş sürümü değil. https://github.com/Whisky-App/Whisky
- **CrossOver uygulaması ve arayüzü:** Kodunu kopyalamadık. Wine ekosistemindeki katkıları, ücretsiz Wine türevlerinin geçmişinde bulunabilir; bunu bağımsız sıfırdan motor yazmışız gibi sunmuyoruz.
- **Apple D3DMetal:** Paketlenmedi veya kurulmadı. Mevcut grafik yolumuz DXMT.

## Burada yazılan

Türkçe yerel arayüz, motor indirme/doğrulama/kurulum yönetimi, oyun başına ayrı ortam, Steam komutları, hata ve test kayıtları, Mac paketleme ve bulut test betikleri. Bunlar Wine'ın yerini almaz; hazır açık kaynak motorları yönetir.
