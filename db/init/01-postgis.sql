-- Aktifkan PostGIS saat volume database pertama kali dibuat.
-- Migrasi juga memastikan extension ini ada, sehingga DB lama tetap aman.
CREATE EXTENSION IF NOT EXISTS postgis;
