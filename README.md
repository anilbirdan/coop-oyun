# coop. — Birlikte oyna

Mac için deneysel, Türkçe oyun başlatıcısı. Bellwright, **Palworld Windows/Steam sürümü** ve Raft kapsamda. Abonelik veya uygulama hesabı yok; oyun lisansları kullanıcıya ait olmalı.

**Sürüm 0.3.0 hazırlanıyor.** Kaynaktan uyarlanan Wine sürücüsüyle bulut Mac üzerinde Windows komutu, gerçek Direct3D 11 görüntüsü, boyutlandırma ve kapatıp yeniden açma geçti. Uygulamanın otomatik kurulumuyla son doğrulama sürüyor. **Oyun, performans ve arkadaş bağlantısı henüz doğrulanmadı.** Paket imzalı/noter onaylı değildir.

## Açma

1. `dist/Coop-Oyun-M5-0.3.0.zip` dosyasını Mac'te açın.
2. **Coop Oyun.app** uygulamasını Uygulamalar klasörüne taşıyıp açın. Node programın içinde gelir; ayrıca kurulmaz. M serisi Mac içindir.
3. Tarayıcıda yerel arayüz açılır. Programı tekrar açmak aynı pencereye bağlantı verir. Kapatmak için arayüzde **Uygulamayı kapat** seçeneğini kullanın. Oyunlar otomatik kapatılmaz; önce oyun içinden kaydedin.

macOS ilk açılışı imzasız paket olduğu için engelleyebilir; güvenlik ayarları otomatik değiştirilmez. Bulut ARM64 Mac'te `open` üzerinden paket açılışı ve yerel hizmet doğrulandı; Finder tıklaması ve hedef M5 doğrulanmadı. Ayrıntı DOGRULAMA.md içinde.

Kaynak koddan çalıştıracaksanız Node.js 22+ gerekir: `node src/server.mjs`. `Baslat.command` da aynı kaynak sürümünü açar.

Windows üzerinde `node src/server.mjs --preview` arayüzü açar; ekrandaki yerel bağlantıyı tarayıcıya yapıştırın. Windows'ta Wine çalıştırma işlemleri kapalıdır. Hiçbir ek npm paketi gerekmiyor.

## Mac'te ilk kurulum

Kurulum ekranındaki **Ücretsiz motoru indir ve kur** düğmesini kullanın. Resmî Wine 11.18 ve DXMT 0.80 ile bu proje için kaynak koddan derlenen Mac grafik sürücüsü indirilir. Dosyaların boyutları ve sabit özetleri doğrulanır. Yaklaşık 210 MB indirme ve hazırlık için en az 4 GB boş alan gerekir. Oyunlar ayrıca indirilir. Rosetta, Mac’in Intel programlarını çalıştırmasını sağlar; gerekirse Apple’ın kurulum ekranını siz tamamlarsınız.

Uyarlama sürücüsü, LGPL lisansı ve tam değiştirilmiş Wine kaynakları [aynı sürüm sayfasındadır](https://github.com/anilbirdan/coop-oyun/releases/tag/wine-driver-11.18-coop1). Sürücü yalnız doğrulandığı Wine paketiyle eşleştirilir.

Motor hazırlandıktan sonra **Kurulumu kontrol et** düğmesi Mac/Rosetta ve ayrı bir deneme ortamında Windows komutunu sınar. Bu kontrol, grafik veya co-op testi değildir. Gerçek sonuç yerel dosyada tutulur.

Elle dosya seçmek isteyenler gelişmiş bölümü kullanabilir. Uyarlanmış Wine uygulaması ve açılmış DXMT klasörü seçilir; özel kopya hazırlanır. Grafik sürücüsünde DXMT bağlantısı olmayan Wine paketi reddedilir. 64 bit DLL ve builtin/standart biçimi ayrılır. Elle seçilen paketin sürüm kökeni otomatik onaylanmaz.

Oyun kartından sırasıyla **Ortamı hazırla → Steam'i kur → Steam'i aç → Oyunu Steam'den kur**. Steam hesabınıza Steam penceresinde giriş yapın; uygulama parola istemez. Palworld için mevcut Windows sürümünüz kullanılır, Mac sürümünü yeniden satın alma akışı yoktur.

**Oyunu başlat** Steam'e komut gönderir. Oyun açılmış, kurulmuş veya co-op çalışıyor sonucunu otomatik üretmez. Davet/oda işlemleri oyunun kendi ekranında yapılır. Kapatma seçeneği ilgili oyunun Steam'ini de kapatır; önce kaydedin.

## Veriler ve sınırlar

- Her oyunun ayrı ortamı ve Steam kurulumu var; disk kullanımı tek ortak Steam'den daha fazla olabilir. Dünyalar taşınmaz ve mevcut kayıtlar silinmez.
- Mac verileri: `~/Library/Application Support/CoopOyun`. Windows önizleme verileri: projenin `.local` klasörü.
- Motorun değiştirilmesi mevcut oyunları otomatik yeni motora taşımaz; her ortam ilk motoruna bağlı kalır.
- Geliştiricinin Wine paketindeki gerekli grafik bağlantısı dosya üzerinden kontrol edilir. Bu, Mac'te grafik sürücüsünün gerçekten yüklendiği anlamına gelmez.
- Test kayıtları sizin bildiriminiz olarak işaretlenir. Açılma, katılma, oda kurma ve kayıt yükleme ayrıdır. Başarı kaydı için gerçek cihaz ve sürüm bilgisi gerekir.
- Sunucu yalnızca bu bilgisayardaki 127.0.0.1 adresini dinler. İşlem kayıtları yereldir, otomatik yükleme yoktur. Kayıtları paylaşmadan önce kişisel bilgiler açısından inceleyin.
- Steam indirmesi Valve'ın HTTPS adresinden yapılır. Hesaplanan SHA256 dosya izidir; önceden doğrulanmış sabit dosya özeti değildir. Steam'in güncel dağıtımına güvenilir.
- Gelişmiş grafik, performans, Steam girişi ve co-op uyumluluğu gerçek Mac testi bekliyor. “Motor kopyalandı” bunların kanıtı değildir.

## Kontroller

`node --test` — gerçek oyun testleri değil; motor kopyalama, sürüm reddi, oyun ortamı ayrımı, komut sınırları, kayıtlar ve yerel erişim kontrolleri.

Uyumluluk kaynakları UYUMLULUK.md, teknik kararlar KARARLAR.md ve doğrulama sonuçları DOGRULAMA.md içinde. Kişisel çalışma planı ve devam kayıtları açık depoya eklenmez.

Uygulama paketinde resmî ARM64 Node çalıştırıcısı ve lisansı bulunur. Wine, DXMT ve Steam kullanıcı bilgisayarına resmî kaynaklardan indirilir; dağıtım paketine eklenmez. Kaynaklar: https://github.com/Gcenx/macOS_Wine_builds ve https://github.com/wine-mirror/wine ve https://github.com/3Shain/dxmt . Whisky/CrossOver kodu kopyalanmadı. İlgili projelerin kullanım ve lisans koşulları geçerlidir.
