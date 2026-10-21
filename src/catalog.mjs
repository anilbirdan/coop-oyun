export const games = [
  {
    id: 'bellwright', name: 'Bellwright', appId: '1812450', mark: 'B', theme: 'forest',
    tagline: 'Birlikte bir yerleşim kurun.',
    note: 'CrossOver üzerinde olumlu kayıt var. Bu ücretsiz motorla açılma ve arkadaş odası henüz denenmedi.',
    source: 'https://www.codeweavers.com/compatibility/crossover/bellwright',
    steps: ['Steam’de çevrim içi giriş yapın.', 'Önce Windows kullanan arkadaşınızın oyunu kurmasını isteyin.', 'Oyunun kendi co-op ekranından katılın; sonra Mac’ten oda kurmayı ayrı deneyin.'],
  },
  {
    id: 'palworld', name: 'Palworld', appId: '1623730', mark: 'P', theme: 'sky',
    tagline: 'Aynı dünyada, kendi ekibinizle.',
    note: 'Mevcut Windows/Steam lisansınızı kullanmak hedefleniyor. Steam girişi ve çevrim içi bağlantı ayrıca denenmeli. Mac sürümünü satın alma adımı yok.',
    source: 'https://store.steampowered.com/app/1623730/Palworld/',
    steps: ['Windows sürümünüzü bu ortamın Steam’i içinden kurun.', 'Steam’e çevrim içi giriş yapın. Oyunun yalnızca açılması yeterli değil.', 'Oyun içindeki davet koduyla katılmayı, ardından kendi dünyanızı açmayı deneyin.'],
  },
  {
    id: 'raft', name: 'Raft', appId: '648800', mark: 'R', theme: 'ocean',
    tagline: 'Bir sal, birkaç arkadaş, koca bir okyanus.',
    note: 'Yeni bağlantı sistemi nedeniyle eski çalışıyor raporları yeterli değil. Güncel sürümde oda kurma ve katılma henüz doğrulanmadı.',
    source: 'https://store.steampowered.com/app/648800/Raft/',
    steps: ['Arkadaşlarınızla aynı oyun sürümünü kullanın.', 'Oyundaki dünyaya katılma ekranını kullanın.', 'Bağlantı hatası olursa hata kodunu test kaydına yazın. Eski sürüme otomatik geçiş yapılmaz.'],
  },
];
export function gameById(id) {
  const game = games.find(game => game.id === id);
  if (!game) throw new Error('Bu oyun listede bulunamadı.');
  return game;
}
