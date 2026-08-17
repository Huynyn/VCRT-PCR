// Run standalone via `npm run create-accounts`, not through index.ts, so it
// needs its own .env load (see the comment on the same import in index.ts).
import 'dotenv/config';

import bcrypt from 'bcryptjs';
import { initDatabase, getDatabase } from '../database';
import { validatePasswordStrength, DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD } from '../utils/password';

// Generate simple ID
function generateId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

async function createDefaultUsers() {
  console.log('Creating default users...');

  try {
    // Wait for database to initialize
    await initDatabase();
    const db = getDatabase();

    // Check if admin user already exists
    const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

    if (!existingAdmin) {
      const adminPasswordError = validatePasswordStrength(DEFAULT_ADMIN_PASSWORD);
      if (adminPasswordError) throw new Error(`Default admin password fails policy: ${adminPasswordError}`);

      const adminPasswordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

      db.prepare(`
        INSERT INTO users (id, username, password_hash, first_name, last_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        generateId('user'),
        'admin',
        adminPasswordHash,
        'System',
        'Administrator',
        'admin',
        1
      );

      console.log(`✅ Admin user created (username: admin, password: ${DEFAULT_ADMIN_PASSWORD})`);
    } else {
      console.log('ℹ️ Admin user already exists');
    }

    // Check if regular user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('user');

    if (!existingUser) {
      const userPasswordError = validatePasswordStrength(DEFAULT_USER_PASSWORD);
      if (userPasswordError) throw new Error(`Default user password fails policy: ${userPasswordError}`);

      const userPasswordHash = await bcrypt.hash(DEFAULT_USER_PASSWORD, 10);

      db.prepare(`
        INSERT INTO users (id, username, password_hash, first_name, last_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        generateId('user'),
        'user',
        userPasswordHash,
        'Regular',
        'User',
        'user',
        1
      );

      console.log(`✅ Regular user created (username: user, password: ${DEFAULT_USER_PASSWORD})`);
    } else {
      console.log('ℹ️ Regular user already exists');
    }

    // Force save to disk before exiting
    db.saveToFile();
    console.log('💾 Database saved');

    console.log('\n🎉 Default users setup complete!');
    console.log('You can now login with:');
    console.log(`  Admin: username=admin, password=${DEFAULT_ADMIN_PASSWORD}`);
    console.log(`  User:  username=user, password=${DEFAULT_USER_PASSWORD}`);

  } catch (error) {
    console.error('❌ Error creating users:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createDefaultUsers()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Failed to create users:', error);
      process.exit(1);
    });
}

export { createDefaultUsers };