PRAGMA journal_mode=WAL;

DROP TABLE IF EXISTS contacts;
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

DROP TABLE IF EXISTS cases;
CREATE TABLE cases (
  id INTEGER PRIMARY KEY,
  topic TEXT NOT NULL,
  created_at TEXT NOT NULL
);