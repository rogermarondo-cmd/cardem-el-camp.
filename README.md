# CARDEM EL CAMP

Web de planificació de viatges. La pàgina estàtica de GitHub Pages continua disponible; el motor IA necessita un servidor Node.

## Servidor

1. Node.js 20 o superior. Executa `npm install` i `npm start`.
2. Configura `OPENAI_API_KEY` **només al servidor**, mai a l'HTML ni a GitHub.
3. A Render crea un **Web Service** amb el repositori, Build Command `npm install`, Start Command `npm start`. Afegeix `OPENAI_API_KEY` a Environment.
4. Obre l'URL del servidor Render per servir la web i el motor IA al mateix domini. GitHub Pages per si sol no executa Node.

`GET /api/health` informa si la clau està configurada. `POST /api/plan` genera itineraris amb IA, però **no** consulta preus reals ni accepta reserves. Els enllaços són cerques externes. Per a tarifes verificades i reserves directes cal integrar APIs de proveïdors i els seus contractes.

## Tarifes de proveïdors

A l'entorn del servei Render, configura `DUFFEL_LIVE_TOKEN` per als vols i
`BOOKING_API_TOKEN` i `BOOKING_AFFILIATE_ID` per als allotjaments. Cal comptar
amb accés de producció de cada proveïdor. `GET /api/health` indica si s'han
configurat les variables, però la connexió es comprova fent una cerca.

A Viatges a la carta, consulta tarifes de vols per codis IATA o allotjaments
de Booking.com per zona d'aeroport, dates i ocupació. El cercador d'allotjaments
mostra el preu de cerca publicable en EUR per a l'estada, que es confirma a
Booking.com amb els càrrecs que hi corresponguin. Les tarifes de vols poden
canviar o caducar. Les propostes generades pel planificador continuen sent
estimacions i no incorporen automàticament les tarifes d'aquests cercadors.
