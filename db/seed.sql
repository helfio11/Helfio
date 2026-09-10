INSERT INTO categories (slug, icon, sort_order, show_in_navigation, show_on_homepage)
VALUES
  ('reinigung-haushalt', '⌂', 10, true, true), ('handwerk-bau', '⚒', 20, true, true),
  ('garten-aussenbereich', '◆', 30, true, true), ('umzug-transport', '▰', 40, true, true),
  ('auto-fahrzeuge', '▱', 50, true, true), ('it-technik', '▣', 60, true, true),
  ('betreuung-pflege', '♥', 70, true, true), ('beauty-wellness', '✿', 80, true, true),
  ('nachhilfe-unterricht', '◆', 90, true, true), ('events-fotografie', '●', 100, true, true),
  ('entrumpelung-entsorgung', '▥', 110, true, true), ('weitere-dienstleistungen', '•••', 120, true, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO category_translations (category_id, locale, name, description)
SELECT id, seed.locale, seed.name, seed.description
FROM (VALUES
  ('reinigung-haushalt', 'de', 'Reinigung & Haushalt', 'Reinigung und Haushalt'),
  ('handwerk-bau', 'de', 'Handwerk & Bau', 'Handwerk und Bau'),
  ('garten-aussenbereich', 'de', 'Garten & Außenbereich', 'Garten und Außenbereich'),
  ('umzug-transport', 'de', 'Umzug & Transport', 'Umzug und Transport'),
  ('auto-fahrzeuge', 'de', 'Auto & Fahrzeuge', 'Auto und Fahrzeuge'),
  ('it-technik', 'de', 'IT & Technik', 'IT und Technik'),
  ('betreuung-pflege', 'de', 'Betreuung & Pflege', 'Betreuung und Pflege'),
  ('beauty-wellness', 'de', 'Beauty & Wellness', 'Beauty und Wellness'),
  ('nachhilfe-unterricht', 'de', 'Nachhilfe & Unterricht', 'Nachhilfe und Unterricht'),
  ('events-fotografie', 'de', 'Events & Fotografie', 'Events und Fotografie'),
  ('entrumpelung-entsorgung', 'de', 'Entrümpelung & Entsorgung', 'Entrümpelung und Entsorgung'),
  ('weitere-dienstleistungen', 'de', 'Weitere Dienstleistungen', 'Weitere Dienstleistungen'),
  ('reinigung-haushalt', 'sq', 'Pastrimi & Shtëpia', 'Pastrimi dhe shtëpia'),
  ('handwerk-bau', 'sq', 'Punime & Ndërtim', 'Pastrimi dhe ndërtimi'),
  ('garten-aussenbereich', 'sq', 'Kopsht & Hapësira jashtme', 'Kopsht dhe hapësira jashtme'),
  ('umzug-transport', 'sq', 'Transport & Zhvendosje', 'Transport dhe zhvendosje'),
  ('auto-fahrzeuge', 'sq', 'Auto & Automjete', 'Auto dhe automjete'),
  ('it-technik', 'sq', 'IT & Teknologji', 'IT dhe teknologji'),
  ('betreuung-pflege', 'sq', 'Kujdes & Përkujdesje', 'Kujdes dhe përkujdesje'),
  ('beauty-wellness', 'sq', 'Bukuri & Mirëqenie', 'Bukuri dhe mirëqenie'),
  ('nachhilfe-unterricht', 'sq', 'Mësimdhënie & Kurse', 'Mësimdhënie dhe kurse'),
  ('events-fotografie', 'sq', 'Evente & Fotografi', 'Evente dhe fotografi'),
  ('entrumpelung-entsorgung', 'sq', 'Pastrime & Hedhje mbeturinash', 'Pastrime dhe hedhje mbeturinash'),
  ('weitere-dienstleistungen', 'sq', 'Shërbime të tjera', 'Shërbime të tjera')
) AS seed(slug, locale, name, description) JOIN categories USING (slug)
ON CONFLICT (category_id, locale) DO NOTHING;

INSERT INTO category_translations (category_id, locale, name, description)
SELECT id, seed.locale, seed.name, seed.description
FROM (VALUES
  ('reinigung-haushalt', 'en', 'Cleaning & Household', 'Cleaning and household services'),
  ('handwerk-bau', 'en', 'Trades & Construction', 'Trades and construction services'),
  ('garten-aussenbereich', 'en', 'Garden & Outdoor', 'Garden and outdoor services'),
  ('umzug-transport', 'en', 'Moving & Transport', 'Moving and transport services'),
  ('auto-fahrzeuge', 'en', 'Cars & Vehicles', 'Car and vehicle services'),
  ('it-technik', 'en', 'IT & Technology', 'IT and technology services'),
  ('betreuung-pflege', 'en', 'Care & Support', 'Care and support services'),
  ('beauty-wellness', 'en', 'Beauty & Wellness', 'Beauty and wellness services'),
  ('nachhilfe-unterricht', 'en', 'Tutoring & Lessons', 'Tutoring and lessons'),
  ('events-fotografie', 'en', 'Events & Photography', 'Events and photography services'),
  ('entrumpelung-entsorgung', 'en', 'Clearance & Disposal', 'Clearance and disposal services'),
  ('weitere-dienstleistungen', 'en', 'Other Services', 'Other services'),
  ('reinigung-haushalt', 'tr', 'Temizlik ve Ev', 'Temizlik ve ev hizmetleri'),
  ('handwerk-bau', 'tr', 'Zanaat ve Insaat', 'Zanaat ve insaat hizmetleri'),
  ('garten-aussenbereich', 'tr', 'Bahce ve Dis Mekan', 'Bahce ve dis mekan hizmetleri'),
  ('umzug-transport', 'tr', 'Tasinma ve Nakliye', 'Tasinma ve nakliye hizmetleri'),
  ('auto-fahrzeuge', 'tr', 'Araclar ve Tasitlar', 'Arac ve tasit hizmetleri'),
  ('it-technik', 'tr', 'BT ve Teknoloji', 'BT ve teknoloji hizmetleri'),
  ('betreuung-pflege', 'tr', 'Bakim ve Destek', 'Bakim ve destek hizmetleri'),
  ('beauty-wellness', 'tr', 'Guzellik ve Wellness', 'Guzellik ve wellness hizmetleri'),
  ('nachhilfe-unterricht', 'tr', 'Ozel Ders ve Egitim', 'Ozel ders ve egitim'),
  ('events-fotografie', 'tr', 'Etkinlik ve Fotograf', 'Etkinlik ve fotograf hizmetleri'),
  ('entrumpelung-entsorgung', 'tr', 'Bosaltma ve Bertaraf', 'Bosaltma ve bertaraf hizmetleri'),
  ('weitere-dienstleistungen', 'tr', 'Diger Hizmetler', 'Diger hizmetler')
) AS seed(slug, locale, name, description) JOIN categories USING (slug)
ON CONFLICT (category_id, locale) DO NOTHING;