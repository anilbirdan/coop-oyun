# Doğrulama — 0.3.0

21 Ekim 2026. Hedef M5; test makinesi Apple M1 (Virtual), macOS 15.7.9 ARM64. M5 veya oyun başarısı çıkarımı yapılmaz.

## Son gerçek uygulama koşusu

[39673633606](https://github.com/anilbirdan/coop-oyun/actions/runs/39673633606), kaynak b3dc40d639dea6875e12efbb373e184de1310e57: **GEÇTİ**.

- 27/27 yazılım kontrolü gerçek Mac'te geçti. Aynı kontroller yerelde de geçti; Wine çağrıları bu küçük kontrollerde taklit edilir.
- Resmî Wine 11.18, DXMT 0.80 ve kaynaklarımızdan derlenen sürücü sabit boyut/özetlerle indirilip uygulamanın kendi kurulum işleviyle kuruldu.
- Gerçek Wine Windows sürüm komutu geçti. Kapanmış hizmetin sessiz çıkış 1 vermesi, sınırlandırılmış beklemeyle doğrulanarak ele alınıyor; gerçek bekleme hatası saklanmıyor.
- Uygulamanın hazırladığı Palworld ortamında gerçek Windows D3D11 programı çalıştı. Pencere/swapchain, renk geri okuma, Present, boyutlandırma ve iki defa oluşturma/yok etme geçti. Bu, Palworld oyununun çalıştırılması değildir.
- Resmî Valve Steam kurucusu aynı ortamda çalıştırıldı; steam.exe dosyaları bulundu. Hesap girişi veya Steam oyun istemcisinin tam kullanılabilirliği doğrulanmadı.
- 0.3.0 Mac uygulama ZIP'i üretildi, ditto ile açıldı. Paketteki ARM64 Node, erişim anahtarlı yerel API ve normal kapanış geçti.
- Uygulama kabuğu macOS open üzerinden açıldı; sürüm ve üç oyun profili API'den doğrulandı, normal kapandı. Finder tıklaması ve tarayıcıdan indirmenin Gatekeeper süreci sınanmadı.

Sınanan uygulama kaynak özeti: a4779df8702f5fb11bff24562274dfec0d4a630ca038cf99b880dc9e14ba340c. Yerel paket aynı uygulama kaynak özetini taşıyor. Tam makine sonucu BULUT_MAC_DOGRULAMA.json içinde. Dağıtılacak ZIP ayrıca indirilip ayrı Mac açılış testine alınır; bu kayıt onun yerine geçmez.

## Sürücü ve kaynak kanıtı

[39671105404](https://github.com/anilbirdan/coop-oyun/actions/runs/39671105404): aynı Wine 11.18 kaydından yalnız Mac sürücüsü derlendi. DXMT 0.80 eski pencere veri düzeni ve Wine 11'in tembel client surface arayüzü uyarlandı. Gerçek D3D11 renkleri RGBA 64,128,191,255 eşleşti; sunum/boyutlandırma/yeniden açma geçti.

[Sürücü ön sürümü](https://github.com/anilbirdan/coop-oyun/releases/tag/wine-driver-11.18-coop1) ikiliyi, LGPL lisansını, tam değiştirilmiş Wine kaynaklarını ve yapım yönergelerini birlikte sunar. İndirilen sürücünün arşiv ve dosya özetleri yerelde de eşleşti. Kesin özetler src/releases.mjs içindedir.

## Henüz doğrulanmayan

- Steam hesabına çevrim içi giriş.
- Bellwright, Palworld ve Raft oyununun açılması; oyun grafiği ve performansı.
- Windows arkadaşının odasına katılma, Mac'ten oda kurma.
- Oyun dünyasını kaydetme/yeniden yükleme, 30 dakika bağlantı.
- Gerçek hedef M5 donanımı ve ilk Finder/Gatekeeper akışı.

Paket imzalı/noter onaylı değildir. Temel D3D11 sınaması ticari oyun veya co-op testi değildir. Kullanıcının formdan bildirdiği sonuçlar ayrıca user-reported olarak işaretlenir.

## Önceki yol

Sikarugir WS12/WS11 alternatifleri gerçek Wine ortamını başlatamadı; özgün paket, wow64 ve fallback yollarında da aynı wineboot hatası görüldü. Standart Wine 11.18 Windows komutu çalışınca kaynak sürücüsü yolu seçildi. Önceki yalnız dosya/simge veya Windows arayüz kontrolleri oyun başarısı sayılmadı. Karar ve gerekçeler KARARLAR.md / 12–15 içinde; eski VENDOR_DOGRULAMA.json tarihî statik incelemedir.
