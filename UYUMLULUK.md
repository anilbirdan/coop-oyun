# Oyunlara göre uyumluluk

İnceleme: 21 Ekim 2026. Üç oyunun kendi Mac/co-op testimiz yok. Temel motorun bulut Mac üzerinde gerçek Direct3D görüntü sınaması geçti; ayrıntı DOGRULAMA.md içinde. Hedef, kullanıcının mevcut Windows/Steam oyunlarını yeniden Mac sürümü satın almadan çalıştırması; Palworld kapsamda kalacak.

| Oyun / Steam kimliği | Açılma hakkında kaynak | Windows odasına katılma | Mac'ten oda kurma | Başlangıç kararı |
|---|---|---|---|---|
| Bellwright / 1812450 | CodeWeavers kaydı: CrossOver 26.0.0, macOS 26, Runs Well; kayıt değişikliği 13 Nisan 2026 | Kaynakta ayrıca doğrulanmamış | Kaynakta ayrıca doğrulanmamış | İlk teknik deneme adayı; ücretsiz Wine + DXMT için sonuç aktarılmaz |
| Palworld / 1623730 | Güncel Steam gereksinimi DX11; Wine 11 + D3DMetal için Ağustos 2026 tarihli doğrudan saha raporu var | Aynı raporda Steam giriş/TLS sorunu yüzünden başarısız; tüm Wine sürümlerine genellenemez | Bu yolda doğrulanmamış | Windows Steam sürümü hedef; uygulamada deneysel profil, ayrıca co-op testi şart |
| Raft / 648800 | Geçmiş CrossOver raporları var; güncel çok oyunculu yolun kanıtı sayılmaz | Güncel sürüm için bizim doğrulamamız yok | Güncel sürüm için bizim doğrulamamız yok | Sürüm eşleşmesi ve bağlantı testi şart; hazır çalışıyor rozeti yok |

## Kaynakların sınırı

- Bellwright'ın CodeWeavers kaydı arama çıktısında okunabildi, doğrudan açma 403 döndürdü. CPU/bellek, oyun yapı numarası ve grafik yolu görünmüyor: https://www.codeweavers.com/compatibility/crossover/bellwright
- Bellwright resmî Steam sayfası çevrim içi co-op desteğini listeliyor; bu Mac uyumluluğu demek değil: https://store.steampowered.com/app/1812450/Bellwright/
- Palworld resmî Steam sayfası Windows, DX11 ve çevrim içi co-op bilgisini veriyor: https://store.steampowered.com/app/1623730/Palworld/
- Palworld Wine raporu doğrudan deneyi yapan kişinin kaydıdır; tek makine, macOS 26.x, Wine 11 + D3DMetal. Steam girişi olmadan oyunun açılması çok oyunculu başarı sayılmamalı: https://github.com/bcupello/palworld-on-macos
- Palworld geliştiricisinin 19 Mart 2025 çapraz platform duyurusu protokol desteğini gösterir; bizim ücretsiz motorumuzun başarısını kanıtlamaz: https://www.pocketpair.jp/zh/game-news/%E3%80%8Apalworld-%E5%B9%BB%E5%85%BD%E5%B8%95%E9%B2%81%E3%80%8B%E8%B7%A8%E5%B9%B3%E5%8F%B0%E8%81%94%E6%9C%BA%EF%BC%88crossplay%EF%BC%89%E6%9B%B4%E6%96%B0%E6%AD%A3%E5%BC%8F%E6%8E%A8%E9%80%81/
- Raft güncel Steam sayfası: https://store.steampowered.com/app/648800/Raft/
- Raft geliştirici duyurusunun başlığı güncel çapraz platform geçişini gösteriyor; bu erişimde duyuru gövdesi alınamadı. İkincil aktarımdaki 10 Mart 2026 tarihi ve eski dal önerisi doğrulanmış çözüm olarak uygulanmadı: https://store.steampowered.com/news/app/648800/view/529873418368060473
- Aramada yeni Raft PlayFab/error 63 saha iddiasına rastlandı; motor ve sürüm bizimkinden farklı, bağımsız doğrulanmadı. Bu nedenle uygulamada kesin hata nedeni veya çözüm diye sunulmuyor.

## Ücretsiz motor adayı

**0.3.0 güncellemesi:** Standart Wine 11.18'in grafik bağlantısı eksik olduğu için ilk hazır paket doğrudan kullanılamıyordu. Sikarugir alternatifleri de gerçek Windows ortamını açamadı. Artık aynı resmî Wine 11.18 kaynağından derlenen, DXMT pencere arayüzünü uyarlayan sürücümüz kullanılıyor. Wine 11.18 + sürücü + DXMT 0.80, gerçek bulut Mac'te küçük bir Direct3D görüntüsü, renk geri okuma, Present ve pencere yaşam döngüsü sınamasını geçti. Bu sonuç aşağıdaki oyunların açılmasına veya çok oyunculu başarısına aktarılmaz.

- Sürücü, lisans ve tam değiştirilmiş kaynak: https://github.com/anilbirdan/coop-oyun/releases/tag/wine-driver-11.18-coop1
- Gerçek grafik ve pencere testi: https://github.com/anilbirdan/coop-oyun/actions/runs/39671105404

- https://github.com/Gcenx/macOS_Wine_builds/releases/tag/11.18
- https://github.com/Sikarugir-App/Engines/releases/tag/v1.0
- https://github.com/Sikarugir-App/wine
- https://github.com/3Shain/dxmt/releases/tag/v0.80
- https://github.com/3Shain/dxmt/wiki/Device-System-Runtime-Specifications
- https://github.com/3Shain/dxmt/wiki/DXMT-Installation-Guide-for-Geeks

## Gerçek test ölçütü

Her oyun için: Mac çipi/bellek/macOS, oyun yapı numarası, Wine sürümü ve dosya özeti, DXMT dosya özetleri, Steam giriş sonucu, açılma, Windows arkadaşının odasına katılma, Mac'ten oda kurma, kaydetme/yeniden yükleme, en az 30 dakika bağlantı sonucu. Oda kurma ve katılma ayrı kaydedilir. Güncelleme sonrası eski sonuç otomatik güncel sayılmaz.
