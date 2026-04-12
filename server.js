require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jwt-simple');
const rateLimit = require('express-rate-limit'); // Added express-rate-limit
const nodemailer = require('nodemailer');
const db = require('./database');
const path = require('path');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    }
});

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'crypto_yield_super_secret_key_123!';

// Rate Limiter for Auth endpoints (Max 5 requests per 15 mins)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, 
    message: { error: 'Too many requests from this IP, please try again after 15 minutes.' }
});

app.use(cors());
app.use(express.json());

// Serve the frontend without caching (so user always sees latest changes)
app.use(express.static(path.join(__dirname), {
    etag: false,
    maxAge: 0,
    setHeaders: (res, path) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }
}));

// ===== AUTH API =====
// Register user
app.post('/api/register', authLimiter, async (req, res) => {
    const { first_name, last_name, email, mobile, password, refCode } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });

    // Enforce email as username backward compat
    const username = email;

    // Strong Password Validation
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        return res.status(400).json({ error: 'Weak password. Must contain 8+ characters, uppercase, lowercase, number, and special character.' });
    }

    db.get(`SELECT id FROM users WHERE email = ? COLLATE NOCASE OR username = ? COLLATE NOCASE`, [email, username], (err, existingUser) => {
        if (existingUser) return res.status(400).json({ error: 'Email already registered' });

        bcrypt.hash(password, 10, (err, hash) => {
            if(err) return res.status(500).json({ error: 'Server error' });
        
        const newRefCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpires = new Date(Date.now() + 10 * 60000).toISOString(); // 10 mins
        
        const insertUser = (referrerId) => {
            db.run(`INSERT INTO users (username, first_name, last_name, email, mobile, password, referral_code, referred_by, status, otp_code, otp_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`, 
                [username, first_name, last_name, email, mobile, hash, newRefCode, referrerId, otpCode, otpExpires], function(err) {
                if (err) return res.status(400).json({ error: 'Email already registered' });
                
                // Send Email out of band
                transporter.sendMail({
                    from: `"Tetherminig" <${process.env.SMTP_EMAIL}>`,
                    to: email,
                    subject: 'Tetherminig - Verify Your Account',
                    html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                        <h2 style="color: #00b3ff;">Welcome to Tetherminig!</h2>
                        <p>Thank you for registering. Please use the following code to verify your email address:</p>
                        <div style="background: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; letter-spacing: 5px; font-weight: bold; border-radius: 8px;">${otpCode}</div>
                        <p>This code will expire in 10 minutes.</p>
                        <p>If you did not request this, please ignore this email.</p>
                    </div>`
                }).catch(console.error);

                res.json({ message: 'OTP sent to your email', needsVerification: true, email: email, userId: this.lastID });
            });
        };

        if (refCode) {
            db.get(`SELECT id FROM users WHERE referral_code = ?`, [refCode], (err, referrer) => {
                insertUser(referrer ? referrer.id : null);
            });
        } else {
            insertUser(null);
        }
    }); // End bcrypt.hash
    }); // End db.get email check
});

// Login user
app.post('/api/login', authLimiter, (req, res) => {
    const { email, password } = req.body;

    db.get(`SELECT * FROM users WHERE email = ? OR username = ?`, [email, email], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Invalid email or password' });

        if (user.status === 'pending') {
            return res.status(403).json({ error: 'Please verify your email first', needsVerification: true, email: user.email });
        }

        bcrypt.compare(password, user.password, (err, result) => {
            if (err || !result) return res.status(401).json({ error: 'Invalid username or password' });
            
            const token = jwt.encode({ id: user.id, role: user.role }, JWT_SECRET);
            res.json({ message: 'Login successful', token, role: user.role, name: user.first_name ? `${user.first_name} ${user.last_name}` : user.username, profile: { balance: user.balance, investment: user.active_investment } });
        });
    });
});

// Verify OTP
app.post('/api/verify-otp', authLimiter, (req, res) => {
    const { email, otp } = req.body;
    db.get(`SELECT * FROM users WHERE email = ? OR username = ?`, [email, email], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        
        if (user.status !== 'pending') return res.status(400).json({ error: 'Already verified. You can login.' });
        
        if (user.otp_code !== otp) return res.status(400).json({ error: 'Invalid OTP code' });
        
        if (new Date(user.otp_expires) < new Date()) {
            return res.status(400).json({ error: 'OTP has expired. Please contact support.' });
        }
        
        db.run(`UPDATE users SET status = 'active', otp_code = NULL, otp_expires = NULL WHERE id = ?`, [user.id], function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            
            const token = jwt.encode({ id: user.id, role: user.role }, JWT_SECRET);
            res.json({ message: 'Email verified successfully! You are now logged in.', token, role: user.role, name: user.first_name ? `${user.first_name} ${user.last_name}` : user.username, profile: { balance: user.balance, investment: user.active_investment } });
        });
    });
});


// Middleware to protect routes
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const decoded = jwt.decode(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Middleware for Admin only
const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
};

// ===== USER API =====
// Get user dashboard data
app.get('/api/user/dashboard', authMiddleware, (req, res) => {
    db.get(`SELECT balance, active_investment, total_earned, wallet_address FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        
        db.all(`SELECT type, amount, status FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`, [req.user.id], (err, txs) => {
            user.recent_transactions = txs || [];
            res.json(user);
        });
    });
});

// Submit a Deposit transaction
app.post('/api/user/deposit', authMiddleware, (req, res) => {
    const { amount, tx_hash } = req.body;
    if (!amount || !tx_hash) return res.status(400).json({ error: 'Amount and Tx Hash required' });

    db.run(`INSERT INTO transactions (user_id, type, amount, tx_hash) VALUES (?, 'deposit', ?, ?)`, 
        [req.user.id, amount, tx_hash], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Deposit submitted, pending admin verification', txId: this.lastID });
    });
});

// Save Wallet Address
app.post('/api/user/wallet', authMiddleware, (req, res) => {
    const { wallet_address } = req.body;
    if (!wallet_address) return res.status(400).json({ error: 'Wallet address required' });
    db.run(`UPDATE users SET wallet_address = ? WHERE id = ?`, [wallet_address, req.user.id], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'Wallet address saved securely.' });
    });
});

// Submit a Withdraw request
app.post('/api/user/withdraw', authMiddleware, (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    db.get(`SELECT balance, wallet_address FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        if (!user.wallet_address) return res.status(400).json({ error: 'Please set your wallet address first (in Settings/Withdraw)' });
        if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

        db.serialize(() => {
            db.run(`UPDATE users SET balance = balance - ? WHERE id = ?`, [amount, req.user.id]);
            db.run(`INSERT INTO transactions (user_id, type, amount, tx_hash) VALUES (?, 'withdraw', ?, 'Pending Send')`, 
                [req.user.id, amount], function(err) {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json({ message: 'Withdrawal requested, pending admin processing', txId: this.lastID });
            });
        });
    });
});

// Get User Referrals Area
app.get('/api/user/referrals', authMiddleware, (req, res) => {
    db.get(`SELECT referral_code, referral_earnings FROM users WHERE id = ?`, [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: 'User not found' });
        db.all(`SELECT username, created_at FROM users WHERE referred_by = ? ORDER BY created_at DESC`, [req.user.id], (err, referrals) => {
            res.json({
                code: user.referral_code,
                earnings: user.referral_earnings || 0,
                referrals: referrals || []
            });
        });
    });
});

// ===== ADMIN API =====
// Get platform settings
app.get('/api/settings', authMiddleware, (req, res) => {
    db.all(`SELECT setting_key, setting_value FROM settings`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        const settings = {};
        rows.forEach(r => { settings[r.setting_key] = r.setting_value });
        res.json(settings);
    });
});

// Update platform settings
app.post('/api/admin/settings', authMiddleware, adminMiddleware, (req, res) => {
    const updates = req.body; // Expecting { trc20_wallet: '...', trc20_qr: '...' }
    db.serialize(() => {
        for (const [key, value] of Object.entries(updates)) {
            db.run(`INSERT OR REPLACE INTO settings (setting_key, setting_value) VALUES (?, ?)`, [key, value]);
        }
    });
    res.json({ message: 'Settings updated successfully!' });
});

// Get platform stats
app.get('/api/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    db.get(`SELECT SUM(active_investment) as tvl, COUNT(*) as totalUsers FROM users WHERE role = 'user'`, [], (err, stats) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        
        db.all(`SELECT t.*, u.username, u.wallet_address FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.status = 'pending'`, [], (err, pendingTxs) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({
                tvl: stats.tvl || 0,
                totalUsers: stats.totalUsers || 0,
                pendingTransactions: pendingTxs
            });
        });
    });
});

// Get all users for Master Admin
app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    db.all(`SELECT id, username, wallet_address, balance, active_investment, total_earned, created_at FROM users WHERE role = 'user' ORDER BY created_at DESC`, [], (err, users) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(users);
    });
});

// Approve Deposit
app.post('/api/admin/approve-deposit/:txId', authMiddleware, adminMiddleware, (req, res) => {
    const txId = req.params.txId;
    
    db.get(`SELECT * FROM transactions WHERE id = ? AND status = 'pending'`, [txId], (err, tx) => {
        if (err || !tx) return res.status(404).json({ error: 'Transaction not found or already processed' });
        
        db.get(`SELECT referred_by FROM users WHERE id = ?`, [tx.user_id], (err, user) => {
            db.serialize(() => {
                db.run(`UPDATE transactions SET status = 'approved' WHERE id = ?`, [txId]);
                // Automatically add deposit to active investment portfolio
                db.run(`UPDATE users SET balance = balance + ?, active_investment = active_investment + ? WHERE id = ?`, [tx.amount, tx.amount, tx.user_id]);
                
                // Add 5% referral bonus if they were referred
                if (user && user.referred_by) {
                    const bonus = tx.amount * 0.05;
                    db.run(`UPDATE users SET balance = balance + ?, referral_earnings = referral_earnings + ? WHERE id = ?`, [bonus, bonus, user.referred_by]);
                }
                
                res.json({ message: 'Deposit approved, balance updated, and referrals credited' });
            });
        });
    });
});

// Approve Withdraw
app.post('/api/admin/approve-withdraw/:txId', authMiddleware, adminMiddleware, (req, res) => {
    const txId = req.params.txId;
    db.get(`SELECT * FROM transactions WHERE id = ? AND status = 'pending' AND type = 'withdraw'`, [txId], (err, tx) => {
        if (err || !tx) return res.status(404).json({ error: 'Transaction not found' });
        db.run(`UPDATE transactions SET status = 'approved', tx_hash = 'Sent on Blockchain' WHERE id = ?`, [txId]);
        res.json({ message: 'Withdrawal approved' });
    });
});

// Admin Update User
app.put('/api/admin/user/:id', authMiddleware, adminMiddleware, (req, res) => {
    const userId = req.params.id;
    const { balance, active_investment, total_earned, password } = req.body;
    
    // Helper function to execute update
    const executeUpdate = (hash) => {
        let query = `UPDATE users SET balance = ?, active_investment = ?, total_earned = ?`;
        let params = [balance, active_investment, total_earned];
        
        if (hash) {
            query += `, password = ?`;
            params.push(hash);
        }
        
        query += ` WHERE id = ?`;
        params.push(userId);
        
        db.run(query, params, function(err) {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'User updated successfully' });
        });
    };

    // Hash new password if provided, otherwise update other fields normally
    if (password && password.trim() !== "") {
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Password hashing error' });
            executeUpdate(hash);
        });
    } else {
        executeUpdate(null);
    }
});

// Admin Delete User
app.delete('/api/admin/user/:id', authMiddleware, adminMiddleware, (req, res) => {
    const userId = req.params.id;
    db.run(`DELETE FROM users WHERE id = ?`, [userId], function(err) {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ message: 'User deleted successfully' });
    });
});

// Change Admin Credentials
app.post('/api/admin/credentials', authMiddleware, adminMiddleware, async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing new credentials' });

    bcrypt.hash(password, 10, (err, hash) => {
        if(err) return res.status(500).json({ error: 'Server error' });
        
        db.run(`UPDATE users SET username = ?, password = ? WHERE id = ?`, [username, hash, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: 'Database error or username taken' });
            res.json({ message: 'Master credentials updated successfully.' });
        });
    });
});

// Calculate Monthly 3% Interest (Simulated Cron Job)
app.post('/api/admin/distribute-interest', authMiddleware, adminMiddleware, (req, res) => {
    // In a real app this would be an automated node-cron job
    db.serialize(() => {
        // Add 3% of active_investment to balance and total_earned
        db.run(`UPDATE users SET 
            balance = balance + (active_investment * 0.03),
            total_earned = total_earned + (active_investment * 0.03)
            WHERE active_investment > 0 AND role = 'user'`, function(err) {
                if (err) return res.status(500).json({ error: 'Error calculating interest' });
                res.json({ message: `Distributed 3% interest to ${this.changes} users.` });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
