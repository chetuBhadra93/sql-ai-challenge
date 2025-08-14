-- Generate 127 contacts with created_at spanning 2023..2025
WITH RECURSIVE seq(n) AS (
  SELECT 1
  UNION ALL
  SELECT n+1 FROM seq WHERE n < 127
)
INSERT INTO contacts (id, first_name, last_name, created_at)
SELECT
  n,
  'First'||n,
  'Last'||n,
  CASE
    WHEN n % 3 = 0 THEN '2023-06-01'
    WHEN n % 3 = 1 THEN '2024-06-01'
    ELSE '2025-06-01'
  END
FROM seq;

-- Ensure at least 2 "help" cases between 2023 and 2025
INSERT INTO cases (id, topic, created_at) VALUES
  (1, 'Need help with onboarding', '2023-05-10'),
  (2, 'Help: account locked',       '2024-11-20'),
  (3, 'General question',           '2022-01-01'),
  (4, 'Billing support',            '2026-02-02');