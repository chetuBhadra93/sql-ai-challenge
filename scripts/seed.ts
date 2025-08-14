import * as fs from 'fs';
import Database from 'better-sqlite3';

const dbPath = process.env.SQLITE_PATH || './db/app.db';

try {
  const db = new Database(dbPath);
  
  // Read and execute schema
  const schema = fs.readFileSync('./db/schema.sql', 'utf8');
  db.exec(schema);
  
  // Read and execute seed data
  const seedData = fs.readFileSync('./db/seed.sql', 'utf8');
  db.exec(seedData);
  
  console.log(`Database seeded successfully at: ${dbPath}`);
  console.log('Tables created: contacts, cases');
  
  // Verify data
  const contactCount = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };
  const caseCount = db.prepare('SELECT COUNT(*) as count FROM cases').get() as { count: number };
  
  console.log(`Contacts: ${contactCount.count}`);
  console.log(`Cases: ${caseCount.count}`);
  
  db.close();
} catch (error) {
  console.error('Error seeding database:', error);
  process.exit(1);
}