# Language and currency

The storefront supports English and German. The header language icon opens a keyboard-accessible dropdown on desktop and mobile. The selection persists in `kaptan-prefs`; unsupported saved language values fall back to English.

All catalogue amounts and payments remain EUR. There is no currency selector, conversion, geo-detection, or exchange-rate endpoint. Old `kaptan-currency` browser data is unused and cannot affect prices. English/German format the same euro amount differently.

Interface translations are in `src/lib/i18n/en.json` and `de.json`. Tests check matching keys, interpolation placeholders, static translation references (including plurals), and euro-only formatting.

The currently inspected public catalogue (two wallets), category labels, and two published journal articles have German translations in `src/lib/i18n/catalog-de.json`. Matching uses the exact English source text/paragraph to prevent showing an old translation for revised product facts. When adding or changing catalogue descriptions or articles, update that translation file in the same release. Unrecognised merchant content stays in its original language; customer names, addresses, and reviews are not rewritten. This is not an automatic translation service for future content.

French, Spanish, Dutch, and Polish are not offered until the full interface and merchant content have translations.

Verification: type checking, lint (six existing warnings), 15 tests, production build; browser checks of dropdown selection, saved German preference, euro pricing, translated product descriptions and journal text. Live payments and authenticated admin workflows were not exercised for this change.
