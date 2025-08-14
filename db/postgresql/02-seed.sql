-- Seed data for PostgreSQL database
-- Executed automatically after schema creation

-- Insert 127 contacts with varied created_at dates
INSERT INTO contacts (first_name, last_name, created_at) 
SELECT 
    'First' || generate_series,
    'Last' || generate_series,
    CASE 
        WHEN generate_series % 3 = 0 THEN '2023-06-01'::timestamp with time zone
        WHEN generate_series % 3 = 1 THEN '2024-06-01'::timestamp with time zone
        ELSE '2025-06-01'::timestamp with time zone
    END
FROM generate_series(1, 127);

-- Insert varied cases with different topics and dates
INSERT INTO cases (topic, created_at) VALUES
    ('Need help with onboarding', '2023-05-10'::timestamp with time zone),
    ('Help: account locked', '2024-11-20'::timestamp with time zone),
    ('General question about features', '2022-01-01'::timestamp with time zone),
    ('Billing support required', '2026-02-02'::timestamp with time zone),
    ('Password reset assistance', '2023-08-15'::timestamp with time zone),
    ('Technical issue with login', '2024-03-22'::timestamp with time zone),
    ('Feature request for dashboard', '2024-09-10'::timestamp with time zone),
    ('Help with data export', '2023-12-05'::timestamp with time zone),
    ('Integration support needed', '2024-07-18'::timestamp with time zone),
    ('Account upgrade inquiry', '2025-01-30'::timestamp with time zone);

-- Update some records to have recent updated_at timestamps
UPDATE contacts 
SET first_name = 'Updated' || id, 
    updated_at = NOW() - INTERVAL '1 day'
WHERE id IN (1, 25, 50, 75, 100);

UPDATE cases 
SET topic = topic || ' (Updated)', 
    updated_at = NOW() - INTERVAL '2 hours'
WHERE id IN (1, 3, 5);

-- Create some test data with specific patterns for better NL2SQL testing
INSERT INTO contacts (first_name, last_name, created_at) VALUES
    ('John', 'Smith', '2024-01-15'::timestamp with time zone),
    ('Jane', 'Doe', '2024-02-20'::timestamp with time zone),
    ('Bob', 'Johnson', '2024-03-10'::timestamp with time zone),
    ('Alice', 'Williams', '2024-04-05'::timestamp with time zone),
    ('Charlie', 'Brown', '2024-05-12'::timestamp with time zone);

INSERT INTO cases (topic, created_at) VALUES
    ('Urgent: System down', '2024-08-01'::timestamp with time zone),
    ('Question about pricing', '2024-08-05'::timestamp with time zone),
    ('Help needed with setup', '2024-08-10'::timestamp with time zone);