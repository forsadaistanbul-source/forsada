# CafeCadde Family ana giriş — WordPress / WPBakery kurulumu

Bu klasör, sayfayı WPBakery Page Builder ile WordPress'e aktarmak için gereken her şeyi içerir.

| Dosya | Ne işe yarar |
|---|---|
| `cafecadde-family-assets.zip` | Fotoğraflar, logolar ve fontlar (`cafecadde-family/` klasörü) |
| `raw-html.html` | WPBakery **Raw HTML** öğesine yapıştırılacak kod (CSS + HTML + JS tek parça) |
| `wpbakery-shortcode.txt` | Aynı kodun, tam genişlik satır ayarıyla birlikte hazır WPBakery kısa kodu |
| `onizleme.html` | Yerelde denemek için tam sayfa (klasörü bir web sunucusunda açın) |

## 1. Görselleri ve fontları sunucuya yükleyin

Kod, dosyaları doğrudan `wp-content/uploads/` altındaki üç klasörde arar:

```
/wp-content/uploads/img/
/wp-content/uploads/logo/
/wp-content/uploads/fonts/
```

1. `cafecadde-family-assets.zip` dosyasını açın; içinden `cafecadde-family` klasörü çıkar.
2. Bu klasörün **içindeki** `img`, `logo` ve `fonts` klasörlerini hosting panelinizin
   **Dosya Yöneticisi** veya **FTP** ile sunucudaki `wp-content/uploads/` klasörüne yükleyin.
3. Kontrol: tarayıcıda
   `https://www.cafecadde.com.tr/wp-content/uploads/logo/family.webp`
   adresi logoyu göstermeli.

> Dosyaları **Medya Kütüphanesi** üzerinden yüklemeyin: WordPress onları yıl/ay klasörlerine koyar
> ve adlarını değiştirebilir. Farklı bir klasör kullanmak isterseniz aşağıdaki
> "Varlık yolunu değiştirmek" bölümüne bakın.

## 2. Sayfayı oluşturun

1. **Sayfalar → Yeni Ekle**. Sayfa şablonu olarak temanızın **tam genişlik / başlıksız (no header, no footer)**
   şablonunu seçin (Salient'te: Page Header ayarlarını boş bırakın, gerekiyorsa "Hide header / footer").
2. İki yoldan birini kullanın:

> **Yalnızca bir yöntemi kullanın.** A ve B birlikte eklenirse sayfa iki kez görünür.
> Sayfada iki kopya varsa backend editörde fazla olan satırı silin.

**A) Hazır kısa kod (önerilen)**
1. WPBakery arka uç düzenleyicisinde **Classic Mode**'a geçin (Metin sekmesi).
2. `wpbakery-shortcode.txt` içeriğinin tamamını yapıştırın.
3. **Backend Editor**'e dönün: tam genişlikli bir satır ve içinde bir Raw HTML öğesi göreceksiniz.

**B) Elle**
1. Yeni bir satır ekleyin. Satır ayarlarında **Row stretch → Stretch row and content (no paddings)** seçin.
2. Satıra **Raw HTML** öğesi ekleyin.
3. `raw-html.html` dosyasının tamamını öğenin içine yapıştırın.

3. **Yayınla / Güncelle**. Ana sayfa yapmak için: **Ayarlar → Okuma → Ana sayfa: bu sayfa**.

## 3. Önbellek ve optimizasyon eklentileri

- Sayfayı yayınladıktan sonra önbelleği temizleyin (WP Rocket, LiteSpeed, W3 Total Cache vb.).
- JS geciktirme / birleştirme eklentisi varsa bu sayfanın satır içi betiğini hariç tutun
  (WP Rocket: *Delay JavaScript execution → Excluded JavaScript Files* alanına `ccf-root` yazın).
  Aksi hâlde kartlar ilk etkileşime kadar açılmayabilir.

## Varlık yolunu değiştirmek

Dosyaları başka bir klasöre veya CDN'e koyarsanız, kodu yeni yolla yeniden üretin
(proje klasöründe):

```bash
ASSET_BASE=/wp-content/uploads/cafecadde-family/ npm run build:wp
```

Ya da `raw-html.html` içinde `/wp-content/uploads/` ifadesini metin düzenleyicide
yeni yolla toplu olarak değiştirin (bu durumda B yöntemini kullanın; kısa kod kodlanmış olduğu için
elle değiştirilemez).

## Tema ile uyum

- Salient gibi temalar WPBakery'nin "Stretch row" ayarını kendi sütun boşluklarıyla uygulamayabilir.
  Kod bunu kendisi düzeltir: hangi sütunun içinde olursa olsun ekran genişliğini ölçer ve tam
  genişliğe yayılır. Sayfanın üstünde/altında beyaz boşluk kalırsa satır ayarlarında üst/alt
  boşluğu (padding/margin) 0 yapın.
- Tüm sınıflar, kimlikler ve animasyonlar `ccf-` önekiyle yazılmıştır; CSS yalnızca `.ccf-root`
  içinde geçerlidir. Temanın geri kalanını etkilemez.
- Sayfa kendi koyu zeminini ve fontlarını (Bodoni Moda, Manrope; Türkçe karakter alt kümeleriyle) getirir.
- Hikâye bölümündeki logonun ekranda "yapışık" kalması CSS `position: sticky` ile yapılır. Tema,
  sayfa içeriğini saran bir öğeye `overflow: hidden` veriyorsa logo yapışmak yerine sayfayla birlikte
  kayar; sayfa yine düzgün çalışır.
