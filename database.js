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

        // V4 Migrations
        db.run('ALTER TABLE users ADD COLUMN otp_code TEXT', () => {});
        db.run('ALTER TABLE users ADD COLUMN otp_expires DATETIME', () => {});
        // Create Admin Master User if not exists
        const bcrypt = require('bcrypt');
        bcrypt.hash('admin123', 10, (err, hash) => {
            if(!err) {
                db.run(`INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', ?, 'admin')`, [hash], () => {
                    // Make sure admin is never stuck in pending state
                    db.run(`UPDATE users SET status = 'active' WHERE role = 'admin'`, () => {});
                });
            }
        });

        // V5 Migrations: Global Site Settings (Payment Wallets, QR Codes)
        db.run(`CREATE TABLE IF NOT EXISTS settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT
        )`, (err) => {
            if (!err) {
                const defaults = {
                    'trc20_wallet': 'TWeRXYZ123ABCxyz789QWERTY_DEFAULT',
                    'trc20_qr': 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=TWeRXYZ_TRC20&bgcolor=121212&color=00ffcc',
                    'bep20_wallet': '0x89ABcd12345efGhI67890JKL_DEFAULT',
                    'bep20_qr': 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=0x89AB_BEP20&bgcolor=121212&color=00ffcc',
                    'erc20_wallet': '0xETHAddressExample90123XYZ_DEFAULT',
                    'erc20_qr': 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=0xETH_ERC20&bgcolor=121212&color=00ffcc'
                };
                for (const [key, val] of Object.entries(defaults)) {
                    db.run(`INSERT OR IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)`, [key, val]);
                }
            }
        });
    }
});

module.exports = db;
