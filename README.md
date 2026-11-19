# Normy i regulacje w cyberbezpieczeństwie

Polskojęzyczna aplikacja edukacyjna. Cztery ćwiczenia obejmują zarządzanie ryzykiem, piramidę cyberbezpieczeństwa, Cyber Advisora i Operację MyDr. Zachowano animacje, klikanie i przeciąganie kart, punktację, powtórki, responsywność oraz stopkę CyberSkills.

## Dwa adresy jednej aplikacji

- Sites: https://normy-regulacje-cyberbezpieczenstwo.balancedmarshmallow2.chatgpt.site
- GitHub Pages: https://schollifcb.github.io/normy-regulacje-cyberbezpieczenstwo/

GitHub Pages publikuje interfejs. Istniejący Cloudflare Worker w Sites udostępnia API treści i dostępności zadań oraz panel administratora z logowaniem ChatGPT i bazą D1. Dzięki temu aktywacja zadań i tryb testowy obowiązują pod oboma adresami. GitHub Pages wymaga dostępności tego API; nie zastępuje serwera ani nie omija blokad zadań.

Panel administratora: https://normy-regulacje-cyberbezpieczenstwo.balancedmarshmallow2.chatgpt.site/admin

Adres `admin/` w GitHub Pages kieruje do tego samego panelu. Odpowiedzi i postęp uczestnika zapisują się w sesji przeglądarki osobno dla każdego adresu. Włączenie obsługi GitHub Pages nie przenosi istniejących sesji pomiędzy domenami.

## Technologia i katalogi

HTML, CSS i moduły JavaScript, bez dodatkowych zależności npm. Wymagany Node.js 24 lub nowszy.

- `dist/` zawiera źródła interfejsu i oryginalny obraz stopki.
- `worker/` zawiera serwer, katalog ćwiczeń i dane zadań.
- `scripts/assets.mjs` jest wspólną listą zasobów obu publikacji.
- `pages.config.json` wskazuje publiczny adres istniejącego API i dozwolony origin GitHub Pages. Nie zawiera haseł ani tokenów.
- `drizzle/` zawiera zachowane migracje istniejącej bazy danych.
- `tests/` zawiera testy mechanik i obsługi obu hostingów.

## Uruchamianie sprawdzeń i budowanie

```sh
npm test
npm run build:pages
npm run build
```

Nie jest wymagane `npm install`. `build:pages` tworzy katalog `_site` z zasobami statycznymi, konfiguracją adresu API i przekierowaniem panelu. Nie kopiuje danych serwera, konfiguracji Sites ani migracji do publikowanej witryny. `build` nadal tworzy Worker Sites w `dist/server/index.js`.

## Publikacja

Workflow `.github/workflows/pages.yml` uruchamia testy i buduje stronę po zmianach na `main`. Następnie publikuje `_site` przez oficjalne akcje GitHub Pages. Źródłem publikacji w ustawieniach repozytorium powinno być **GitHub Actions**.

Nie skonfigurowano własnej domeny ani pliku CNAME. Przyszły adres `cyber.bzwierzchowski.pl` wymaga osobnej konfiguracji DNS, GitHub Pages i dozwolonego origin API.

Przy zmianie kodu API należy osobno opublikować Worker w istniejącym projekcie Sites. Workflow GitHub nie zmienia ani nie usuwa publikacji Sites. Nie przechowuj tokenów, plików `.env` ani eksportów bazy danych w repozytorium.
