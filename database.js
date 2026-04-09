const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect to SQLite database
const dbPath = path.resolve(__dirname, 'platform.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        
        // Create Users table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'user',
            wallet_address TEXT,
            balance REAL DEFAULT 0,
            active_investment REAL DEFAULT 0,
            total_earned REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating users table", err);
        });

        // Create Transactions table (Deposits/Withdrawals)
        db.run(`CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT, 
            amount REAL,
            tx_hash TEXT,
            status TEXT DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`, (err) => {
            if (err) console.error("Error creating transactions table", err);
        });

        // V2 Migrations
        db.run('ALTER TABLE users ADD COLUMN referral_code TEXT', () => {});
        db.run('ALTER TABLE users ADD COLUMN referred_by INTEGER', () => {});
        db.run('ALTER TABLE users ADD COLUMN referral_earnings REAL DEFAULT 0', () => {});

        // V3 Migrations
        db.run('ALTER TABLE users ADD COLUMN first_name TEXT', () => {});
        db.run('ALTER TABLE users ADD COLUMN last_name TEXT', () => {});
        db.run('ALTER TABLE users ADD COLUMN email TEXT', () => {});
        db.run('ALTER TABLE users ADD COLUMN mobile TEXT', () => {});
        db.run('ALTER TABLE users ADD COLUMN status TEXT DEFAULT "pending"', () => {});

        // Create Admin Master User if not exists
        const bcrypt = require('bcrypt');
        bcrypt.hash('admin123', 10, (err, hash) => {
            if(!err) {
                db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', ?, 'admin')`, [hash]);
            }
        });
    }
});

module.exports = db;
