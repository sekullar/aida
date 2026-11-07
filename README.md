<p align="center">
  <img src="assets/logo.svg" width="128" alt="AIDA logo">
</p>

<h1 align="center">AIDA</h1>
<p align="center"><b>Artificial Intelligence Debate Arena</b></p>
<p align="center">Seat ChatGPT, Gemini, Claude, DeepSeek, Kimi, Grok, Qwen and Le Chat around one round table and let them discuss, agree or argue — with no API keys.</p>

<p align="center"><a href="#english">English</a> · <a href="#türkçe">Türkçe</a></p>

<p align="center">
  <img src="docs/screenshot.png" width="820" alt="AIDA round table with eight AI seats">
</p>

---

## English

### What is AIDA?

AIDA is a desktop app that turns the free web chats of several AI assistants into a single round-table conversation. You invite AIs from the settings menu, each one opens in its own Chrome window with a fresh chat, and AIDA types the messages and reads the replies for you. You do not need any API keys: AIDA uses the accounts you are already signed in to in Chrome.

### Features

- **8 seats:** ChatGPT, Gemini, Claude, DeepSeek, Kimi, Grok, Qwen and Le Chat. Invite as many as you like.
- **Turn-based table:** turns follow a fixed order. When it is one AI's turn, every other AI also receives the message in "listen" mode and replies only `-muted-`, so every participant knows the whole conversation.
- **Autopilot:** the AIs keep talking to each other until you press Stop. They may agree or disagree, and the conversation ends by itself when every speaker asks to finish (`[[BITIR]]`).
- **Usage limits:** when a site says its message limit is reached, that seat is greyed out and skipped and the others are told.
- **Sign-in and verification notices:** if a site needs you to log in or pass a "verify you are human" check, the table says so.
- **Works with minimized windows:** the Chrome windows can be minimized or left behind other windows while the debate continues (see [Minimized windows](#minimized-windows)).
- **Debug log:** every message to and from the extension is written to `debug.log`.

### Supported sites

| Seat | Site |
|---|---|
| ChatGPT | chatgpt.com |
| Gemini | gemini.google.com |
| Claude | claude.ai (free plan works) |
| DeepSeek | chat.deepseek.com |
| Kimi | www.kimi.ai |
| Grok | grok.com |
| Qwen | chat.qwen.ai |
| Le Chat | chat.mistral.ai |

### How it works

```
AIDA (Electron)  ⇄  WebSocket 127.0.0.1:47821  ⇄  AIDA Bridge (Chrome extension)  ⇄  AI tabs
```

- `main.js`, `src/engine.js`: the Electron app and the debate engine (turn order, listening, autopilot, limits).
- `extension/background.js`: the extension's service worker. It opens the AI windows and relays messages between the app and the tabs.
- `extension/content.js`: runs on each AI site. It types the message, presses send, waits for the answer and reads it. Each site's selectors are in the `SITES` table.
- `extension/page.js`: keeps the sites running when their windows are minimized.

The WebSocket server only listens on `127.0.0.1` and only accepts connections from Chrome extensions.

### Requirements

- Node.js 18 or newer
- Google Chrome 111 or newer
- Accounts on the AI sites you want to invite, signed in on Chrome

AIDA was developed and tested on Windows 11.

### Installation

**Installer (recommended):** download `AIDA.Setup.<version>.exe` from the [latest release](../../releases/latest) and run it, or install AIDA from **[Sentinel Hub](https://github.com/sekullar/sentinel-hub)**, which also keeps it up to date. The installer is not code-signed, so Windows SmartScreen may ask you to confirm ("More info" → "Run anyway").

Then load the Chrome extension:

1. In AIDA, open Settings and click **Uzantı klasörünü aç** (open extension folder). With the installer this is `%APPDATA%\AIDA\extension`; AIDA keeps that folder in sync with its own version.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose that folder.

When the extension connects, the badge at the top right turns to "Uzantı bağlı" (extension connected).

**From source:**

```bash
git clone https://github.com/sekullar/aida.git
cd aida
npm install
npm start
```

In this case load the project's `extension` folder in Chrome.

### Versions and updates

- The app, the Chrome extension and the GitHub Release tag always carry the same version.
- **App updates:** Sentinel Hub compares the installed version with the latest Release and shows an Update button. AIDA itself also checks GitHub on startup and shows a "Yeni sürüm" (new version) badge when one is out.
- **Extension updates:** the extension reports its version when it connects. If it differs from the version that came with the app, the badge turns red ("Uzantı güncel değil") and Settings shows how to reload it. Chrome does not reload unpacked extensions by itself, so after every update press the reload button on AIDA Bridge in `chrome://extensions`.
- If more than one copy of AIDA Bridge is loaded, AIDA uses the one with the right version and ignores the rest; remove the extra copies.

### Building

```bash
npm run dist        # installer in release/ (needs admin or Developer Mode on Windows)
npm run dist:local  # same installer without admin rights
```

Releases are built by GitHub Actions: pushing a tag such as `v0.4.0` runs the tests, checks that the tag, `package.json` and `extension/manifest.json` versions match, builds the installer and publishes it.

### Usage

1. Click the settings button (top right) and invite the AIs you want at the table. Each one opens in a new Chrome window with a new chat. Sign in there if needed.
2. Wait until every seat shows "hazır" (ready).
3. Type a message and press Enter. The AIs answer one by one in the order shown at the table.
4. Turn on **Otopilot** to let them keep talking among themselves, and press **Durdur** (Stop) to end it.
5. **Yeni oturum** (New session) clears the conversation and reopens every AI with a new chat.

Settings: maximum answer length (words), timeout per answer (seconds) and the autopilot round limit (0 = unlimited).

> The app interface and the instructions sent to the AIs are currently in Turkish. The AIs are told to reply in the language you write in.

### Minimized windows

Chrome slows down pages whose window is minimized or covered: timers fire once per second (once per minute after five minutes) and nothing is drawn. `extension/page.js` tells the AI pages they are visible and runs their pending timers on the extension's 250 ms beat, so answers keep arriving.

Chrome's **Memory Saver** can still put inactive tabs to sleep. Open `chrome://settings/performance` and add the AI sites to **Always keep these sites active**.

### Troubleshooting

- **A seat stays on "bağlanıyor" (connecting):** the extension is probably outdated. Open `chrome://extensions`, press the reload button on AIDA Bridge, and make sure there is only one copy of it. Then dismiss and re-invite the AI.
- **"Mesaj gönderilemedi" (could not send):** the site's interface may have changed. Update that site's entry in the `SITES` table in `extension/content.js`.
- **After every extension update:** reload AIDA Bridge in `chrome://extensions` and refresh the AI windows.
- Check `debug.log` (project folder, or `%APPDATA%\AIDA` with the installer) to see exactly where a message got stuck.

### Tests

```bash
npm test
```

Runs the engine tests (turn order, listening, limits, autopilot), the minimized-window tests for `page.js` and the version-control tests.

### Disclaimer

AIDA automates the official web interfaces in your own signed-in browser. Each service's terms of use and message limits still apply, and you are responsible for how you use them. The sites change their interfaces from time to time, which can break the selectors until they are updated.

---

## Türkçe

### AIDA nedir?

AIDA, birçok yapay zeka asistanının ücretsiz web sohbetlerini tek bir yuvarlak masa sohbetine dönüştüren bir masaüstü uygulamasıdır. Ayarlardan yapay zekaları masaya davet edersin, her biri Chrome'da kendi penceresinde yeni bir sohbetle açılır. Mesajları AIDA yazar, cevapları AIDA okur. API anahtarı gerekmez: AIDA, Chrome'da zaten giriş yapmış olduğun hesapları kullanır.

### Özellikler

- **8 koltuk:** ChatGPT, Gemini, Claude, DeepSeek, Kimi, Grok, Qwen ve Le Chat. İstediğin kadarını davet edebilirsin.
- **Sıralı masa:** söz sabit bir sırayla döner. Sıra bir yapay zekadayken diğerleri de mesajı "dinle" modunda alır ve yalnızca `-muted-` cevabını verir. Böylece herkes konuşmanın tamamından haberdar olur.
- **Otopilot:** sen durdurana kadar yapay zekalar kendi aralarında konuşur. Hem fikir olabilir ya da tartışabilirler. Konuşan herkes bitirmek isterse (`[[BITIR]]`) sohbet kendiliğinden biter.
- **Kullanım limiti:** bir site mesaj limitinin dolduğunu söylerse o koltuk griye döner ve atlanır, diğerlerine bildirilir.
- **Giriş ve doğrulama uyarıları:** bir site giriş ya da "insan olduğunu doğrula" kontrolü isterse masada yazar.
- **Küçültülmüş pencerelerle çalışır:** Chrome pencereleri küçültülse ya da başka pencerelerin arkasında kalsa da tartışma sürer (bkz. [Küçültülmüş pencereler](#küçültülmüş-pencereler)).
- **Hata günlüğü:** uzantıyla giden gelen her mesaj `debug.log` dosyasına yazılır.

### Desteklenen siteler

| Koltuk | Site |
|---|---|
| ChatGPT | chatgpt.com |
| Gemini | gemini.google.com |
| Claude | claude.ai (ücretsiz plan yeterli) |
| DeepSeek | chat.deepseek.com |
| Kimi | www.kimi.ai |
| Grok | grok.com |
| Qwen | chat.qwen.ai |
| Le Chat | chat.mistral.ai |

### Nasıl çalışır?

```
AIDA (Electron)  ⇄  WebSocket 127.0.0.1:47821  ⇄  AIDA Bridge (Chrome uzantısı)  ⇄  Yapay zeka sekmeleri
```

- `main.js`, `src/engine.js`: Electron uygulaması ve tartışma motoru (söz sırası, dinleme, otopilot, limitler).
- `extension/background.js`: uzantının arka plan betiği. Yapay zeka pencerelerini açar, uygulama ile sekmeler arasında mesaj taşır.
- `extension/content.js`: her yapay zeka sitesinde çalışır. Mesajı yazar, gönder düğmesine basar, cevabı bekler ve okur. Her sitenin seçicileri `SITES` tablosundadır.
- `extension/page.js`: pencereler küçültülünce sitelerin çalışmaya devam etmesini sağlar.

WebSocket sunucusu yalnızca `127.0.0.1` üzerinde dinler ve yalnızca Chrome uzantılarından gelen bağlantıları kabul eder.

### Gereksinimler

- Node.js 18 veya üstü
- Google Chrome 111 veya üstü
- Davet etmek istediğin yapay zeka sitelerinde Chrome'da giriş yapılmış hesaplar

AIDA, Windows 11 üzerinde geliştirildi ve denendi.

### Kurulum

**Kurulum dosyası (önerilen):** [son sürümden](../../releases/latest) `AIDA.Setup.<sürüm>.exe` dosyasını indirip çalıştır ya da AIDA'yı **[Sentinel Hub](https://github.com/sekullar/sentinel-hub)** üzerinden kur; Hub onu güncel de tutar. Kurulum dosyası kod imzalı değildir; Windows SmartScreen onay isteyebilir ("Daha fazla bilgi" → "Yine de çalıştır").

Ardından Chrome uzantısını yükle:

1. AIDA'da Ayarlar'ı aç ve **Uzantı klasörünü aç**'a tıkla. Kurulum dosyasıyla bu klasör `%APPDATA%\AIDA\extension` olur; AIDA bu klasörü kendi sürümüyle eşit tutar.
2. `chrome://extensions` sayfasını aç, sağ üstten **Geliştirici modu**nu aç.
3. **Paketlenmemiş öğe yükle**'ye tıkla ve o klasörü seç.

Uzantı bağlanınca sağ üstteki rozet "Uzantı bağlı" olur.

**Kaynak koddan:**

```bash
git clone https://github.com/sekullar/aida.git
cd aida
npm install
npm start
```

Bu durumda Chrome'a projedeki `extension` klasörünü yükle.

### Sürümler ve güncellemeler

- Uygulama, Chrome uzantısı ve GitHub Release etiketi her zaman aynı sürümü taşır.
- **Uygulama güncellemesi:** Sentinel Hub kurulu sürümü son Release ile karşılaştırır ve Güncelle düğmesini gösterir. AIDA da açılışta GitHub'ı kontrol eder, yeni sürüm çıktıysa "Yeni sürüm" rozeti gösterir.
- **Uzantı güncellemesi:** uzantı bağlanınca sürümünü bildirir. Uygulamayla gelen sürümden farklıysa rozet kırmızıya döner ("Uzantı güncel değil") ve Ayarlar'da nasıl yenileneceği yazar. Chrome paketlenmemiş uzantıları kendiliğinden yenilemez; her güncellemeden sonra `chrome://extensions` sayfasında AIDA Bridge'in yenile düğmesine bas.
- Birden fazla AIDA Bridge kopyası yüklüyse AIDA doğru sürümdekini kullanır, diğerlerini yok sayar; fazla kopyaları kaldır.

### Derleme

```bash
npm run dist        # release/ içinde kurulum dosyası (Windows'ta yönetici veya Geliştirici Modu gerekir)
npm run dist:local  # aynı kurulum dosyası, yönetici hakkı olmadan
```

Release'ler GitHub Actions ile üretilir: `v0.4.0` gibi bir etiket push'lanınca testler çalışır, etiket, `package.json` ve `extension/manifest.json` sürümlerinin aynı olduğu denetlenir, kurulum dosyası derlenip yayınlanır.

### Kullanım

1. Sağ üstteki ayarlar düğmesine tıkla ve masada istediğin yapay zekaları davet et. Her biri Chrome'da yeni bir pencerede, yeni bir sohbetle açılır. Gerekirse orada giriş yap.
2. Tüm koltuklar "hazır" olana kadar bekle.
3. Bir mesaj yazıp Enter'a bas. Yapay zekalar masada görünen sırayla tek tek cevap verir.
4. Kendi aralarında konuşmaya devam etmeleri için **Otopilot**'u aç, bitirmek için **Durdur**'a bas.
5. **Yeni oturum** konuşmayı temizler ve tüm yapay zekaları yeni sohbetle yeniden açar.

Ayarlar: en fazla cevap uzunluğu (kelime), cevap başına zaman aşımı (saniye) ve otopilot tur sınırı (0 = sınırsız).

### Küçültülmüş pencereler

Chrome, penceresi küçültülen ya da üstü kapanan sayfaları yavaşlatır: zamanlayıcılar saniyede bire (beş dakika sonra dakikada bire) düşer ve ekran çizimi durur. `extension/page.js` yapay zeka sayfalarına görünür olduklarını söyler ve bekleyen zamanlayıcılarını uzantının 250 ms'lik ritmiyle çalıştırır, böylece cevaplar gelmeye devam eder.

Chrome'un **Bellek Tasarrufu** özelliği yine de etkin olmayan sekmeleri uyutabilir. `chrome://settings/performance` sayfasını açıp yapay zeka sitelerini **Bu siteleri her zaman etkin tut** listesine ekle.

### Sorun giderme

- **Bir koltuk "bağlanıyor"da kalıyor:** uzantı büyük ihtimalle eski sürümde. `chrome://extensions` sayfasında AIDA Bridge'in yenile düğmesine bas ve yalnızca bir kopyasının yüklü olduğundan emin ol. Sonra o yapay zekayı masadan çıkarıp yeniden davet et.
- **"Mesaj gönderilemedi":** sitenin arayüzü değişmiş olabilir. `extension/content.js` içindeki `SITES` tablosunda o sitenin seçicilerini güncelle.
- **Her uzantı güncellemesinden sonra:** `chrome://extensions` sayfasında AIDA Bridge'i yenile ve yapay zeka pencerelerini yenile.
- Bir mesajın tam olarak nerede takıldığını görmek için `debug.log` dosyasına bak (proje klasöründe, kurulum dosyasıyla `%APPDATA%\AIDA` altında).

### Testler

```bash
npm test
```

Motor testlerini (söz sırası, dinleme, limitler, otopilot), `page.js` için küçültülmüş pencere testlerini ve sürüm kontrolü testlerini çalıştırır.

### Sorumluluk notu

AIDA, resmi web arayüzlerini kendi giriş yapılmış tarayıcında otomatikleştirir. Her hizmetin kullanım koşulları ve mesaj limitleri geçerliliğini korur, kullanım sorumluluğu sana aittir. Siteler arayüzlerini zaman zaman değiştirir; bu durumda seçiciler güncellenene kadar ilgili koltuk çalışmayabilir.
