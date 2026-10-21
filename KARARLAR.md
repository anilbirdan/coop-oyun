# Teknik kararlar

21 Ekim 2026

1. Palworld kapsamda kalır. Kullanıcı mevcut Windows/Steam sürümünü hedefliyor; Mac sürümünü yeniden satın almak çözüm olarak sunulmayacak.
2. Whisky'nin eski çalıştırma altyapısı kopyalanmıyor. Yeni, küçük bir başlatıcı hazırlıyoruz; Wine/Grafik motoru özgün projelerden sağlanacak. Whisky veya CrossOver kodu bu projeye alınmadı.
3. İlk aday Wine 11.18 gerçek arşiv incelemesinde elendi: winemac.so gerekli DXMT simgelerini dışarı sunmuyor. Yerine **WS12WineSikarugir11.0_1 + DXMT 0.80 builtin** seçildi. Gerçek sürücü dosyasında `_macdrv_functions` bulundu; DXMT kaynağının bu tabloyu kullandığı doğrulandı. Bu statik bağlantı kontrolü, gerçek Mac çalıştırması değildir. Kanıt: VENDOR_DOGRULAMA.json ve src/macho.mjs. D3DMetal paketlenmez.
4. Motor, resmî indirme adresi/boyut/SHA256 ile sabitlenerek otomatik kurulur. Arşivler açılmadan doğrulanır. Kaynak kurulumlar değiştirilmez. Elle seçme de var; elle seçilen dosyada sadece biçim/bağlantı/özet denetimi yapılır. Otomatik sürüm yükseltme yoktur.
5. Node 22.23.3 darwin-arm64 resmî ikilisi Mac .app paketinde lisansıyla birlikte taşınır. Kullanıcı ayrıca Node kurmaz. Yerel tarayıcı arayüzü, ek npm bağımlılığı, hesap ve dış sunucu gerektirmez. İmzalı/noter onaylı paket değildir; Mac açılışı doğrulanmadı.
6. Kullanıcının devam edip programı somutlaştırma isteği üzerine otomatik kurulum ve gerçek .app kabı eklendi. Oyun uyumluluğu doğrulanmadan ürün kapsamı büyütülmedi. PLAN adım 3'ün Mac kabulü ve 4. adım açık kalır; Windows önizlemesi oyun çalıştırmaz.
7. Her oyun için ayrı Wine ortamı ve ayrı Steam kurulumu kullanılır. Ağ protokolleri değiştirilmez, oda/arkadaş sistemi oyunun ve Steam'in kendi ekranında kalır. Başlatıcı kendi oda sunucusunu icat etmez.
8. Kullanıcı az rapor istedi: rutin ilerleme dosyaya, yalnızca önemli değişiklik veya gerekli engel konuşmaya yazılır.
9. DXMT 0.80 resmî yayını builtin pakettir. Önceki sürümün standart paket varsayımı ve i386-windows klasörünü eleme eksikliği düzeltildi. Builtin DLL için yükleme tercihi builtin olur; native,builtin kullanılmaz.
10. Kurulum denetimi donanımı, macOS'u, Rosetta'yı ve Windows komutunu ayrı ortamda sınar. Grafik ve co-op onayı üretmez. Arka plan Steam/oyun çıktıları yerel dosyada saklanır; hata görünmez kalmaz.
