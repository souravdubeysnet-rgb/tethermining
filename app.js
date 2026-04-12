// Tetherminig Frontend Logic
// Integrated with Node.js SQLite Backend

const API_BASE = 'http://localhost:3000/api';

// --- View State Management ---
function switchMainView(viewId, authMode = 'login', pushHistory = true) {
    document.querySelectorAll('.view-section').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    
    const target = document.getElementById(viewId);
    if(target) {
        target.style.display = viewId === 'app-layout' ? 'flex' : 'block';
        setTimeout(() => target.classList.add('active'), 10);
    }
    
    // Automatically reset scroll to top when changing views
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if(viewId === 'auth-view') {
        toggleAuthForm(authMode);
    }
    
    if(viewId === 'app-layout') {
        initDashboard();
        loadPlatformSettings();
    }
    
    if (pushHistory) {
        history.pushState({ viewId, authMode }, "", `#${viewId}`);
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.app-pane').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));

    const targetSection = document.getElementById(`${tabId}-view`);
    if (targetSection) {
        targetSection.style.display = 'block';
        setTimeout(() => targetSection.classList.add('active'), 10);
    }
    
    if(event && event.currentTarget) {
        event.currentTarget.parentElement.classList.add('active');
    }

    // Load data based on tab
    if (tabId === 'dashboard') loadUserData();
    if (tabId === 'admin') loadAdminData();
    if (tabId === 'referrals') loadReferralData();
}

function toggleAuthForm(mode) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const otpForm = document.getElementById('otp-form');
    const subtitle = document.getElementById('auth-subtitle');
    
    if(loginForm) loginForm.style.display = 'none';
    if(registerForm) registerForm.style.display = 'none';
    if(otpForm) otpForm.style.display = 'none';

    if (mode === 'login') {
        if(loginForm) loginForm.style.display = 'block';
        if(subtitle) subtitle.innerText = 'Welcome back! Please login.';
    } else if (mode === 'register') {
        if(registerForm) registerForm.style.display = 'block';
        if(subtitle) subtitle.innerText = 'Create an account to start earning.';
    } else if (mode === 'otp') {
        if(otpForm) otpForm.style.display = 'block';
        if(subtitle) subtitle.innerText = 'Almost there! Verify your email.';
    }
}

// --- API Helpers ---
async function apiCall(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('crypto_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null
        });
        const data = await res.json();
        if (!res.ok) {
            const err = new Error(data.error || 'API Error');
            err.data = data;
            throw err;
        }
        return data;
    } catch (err) {
        if (!(err.data && err.data.needsVerification)) {
            showToast(err.message, 'error');
        }
        throw err;
    }
}
// --- Auth specific ---
async function handleLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = 'Verifying...';
    try {
        const data = await apiCall('/login', 'POST', {
            email: document.getElementById('login-username').value,
            password: document.getElementById('login-password').value
        });
        localStorage.setItem('crypto_token', data.token);
        localStorage.setItem('crypto_role', data.role);
        localStorage.setItem('crypto_user', data.name);
        showToast('Login successful!', 'success');
        switchMainView('app-layout');
    } catch(err) {
        if (err.data && err.data.needsVerification) {
            document.getElementById('otp-email').value = err.data.email;
            toggleAuthForm('otp');
            showToast('Please check your email to verify your account', 'error');
        }
    } finally {
        btn.innerText = 'Login to Dashboard';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const password = document.getElementById('reg-password').value;
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if(!passwordRegex.test(password)) {
        document.getElementById('reg-password-help').style.display = 'block';
        document.getElementById('reg-password-help').style.color = '#ff4444';
        return showToast('Password is too weak', 'error');
    }

    const btn = e.target.querySelector('button');
    btn.innerText = 'Creating...';
    try {
        const first_name = document.getElementById('reg-firstname').value;
        const last_name = document.getElementById('reg-lastname').value;
        const email = document.getElementById('reg-email').value;
        const mobile = document.getElementById('reg-mobile').value;
        const formRefCode = document.getElementById('reg-refcode').value;
        const payload = { first_name, last_name, email, mobile, password };

        const pendingRef = localStorage.getItem('pending_ref');
        if (pendingRef) payload.refCode = pendingRef;
        else if (formRefCode) payload.refCode = formRefCode;

        const res = await apiCall('/register', 'POST', payload);
        
        localStorage.removeItem('pending_ref');
        
        if (res.needsVerification) {
            document.getElementById('otp-email').value = res.email;
            showToast('OTP sent! Please check your email.', 'success');
            toggleAuthForm('otp');
        } else {
            showToast('Registration successful! Please login.', 'success');
            toggleAuthForm('login');
        }
    } catch(err) {
        // error handled
    } finally {
        btn.innerText = 'Create Account';
    }
}

async function handleVerifyOTP(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = 'Verifying...';
    try {
        const email = document.getElementById('otp-email').value;
        const otp = document.getElementById('otp-code').value;
        
        const data = await apiCall('/verify-otp', 'POST', { email, otp });
        
        localStorage.setItem('crypto_token', data.token);
        localStorage.setItem('crypto_role', data.role);
        localStorage.setItem('crypto_user', data.name);
        
        showToast('Email Verified & Logged in!', 'success');
        switchMainView('app-layout');
    } catch(err) {
        // error toast already handled in apiCall
    } finally {
        btn.innerText = 'Verify Account';
    }
}

function logout() {
    localStorage.removeItem('crypto_token');
    localStorage.removeItem('crypto_role');
    localStorage.removeItem('crypto_user');
    const adminLnk = document.getElementById('nav-admin');
    if (adminLnk) adminLnk.style.display = 'none';
    switchMainView('landing-view', 'login', true);
    showToast('Logged out securely', 'success');
}

// --- Dashboard & Data ---
function initDashboard() {
    const role = localStorage.getItem('crypto_role');
    let username = localStorage.getItem('crypto_user') || 'User';
    
    document.getElementById('display-username').innerText = username;
    
    // Capitalize first letter for Welcome banner
    const firstName = username.split(' ')[0];
    const displayFirst = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    const welcomeNameEl = document.getElementById('dash-welcome-name');
    if (welcomeNameEl) welcomeNameEl.innerText = displayFirst;
    
    if (role === 'admin') {
        const adminLnk = document.getElementById('nav-admin');
        if (adminLnk) adminLnk.style.display = 'block';
    } else {
        const adminLnk = document.getElementById('nav-admin');
        if (adminLnk) adminLnk.style.display = 'none';
        // if user tries to access admin via code, backend will block them
    }
    
    switchTab('dashboard');
}

// Data Loading Functions
async function loadReferralData() {
    try {
        const data = await apiCall('/user/referrals', 'GET');
        document.getElementById('ref-link-input').value = `${window.location.origin}/?ref=${data.code}`;
        document.getElementById('ref-count').innerText = data.referrals.length;
        document.getElementById('ref-earned').innerText = `$${data.earnings.toFixed(2)}`;
        
        const tbody = document.getElementById('ref-list-table');
        if (data.referrals.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;">No friends invited yet.</td></tr>';
        } else {
            tbody.innerHTML = '';
            data.referrals.forEach(ref => {
                tbody.innerHTML += `<tr><td>${ref.username}</td><td>${new Date(ref.created_at).toLocaleDateString()}</td></tr>`;
            });
        }
    } catch (err) {}
}

function copyRefLink() {
    const link = document.getElementById('ref-link-input');
    link.select();
    document.execCommand('copy');
    showToast('Invite link copied!', 'success');
}

async function loadUserData() {
    try {
        const data = await apiCall('/user/dashboard', 'GET');
        document.getElementById('dash-balance').innerText = data.balance.toFixed(2);
        document.getElementById('dash-investment').innerText = data.active_investment.toFixed(2);
        document.getElementById('dash-earned').innerText = data.total_earned.toFixed(2);
        const wdReady = document.getElementById('withdraw-available');
        if (wdReady) wdReady.innerText = data.balance.toFixed(2);
        
        if(data.wallet_address) {
            const wAdd = document.getElementById('user-wallet-address');
            if(wAdd) wAdd.value = data.wallet_address;
        }

        // Render Recent Transactions on Dashboard
        const txTbody = document.getElementById('dash-recent-tx');
        if (txTbody) {
            if (data.recent_transactions && data.recent_transactions.length > 0) {
                txTbody.innerHTML = '';
                data.recent_transactions.forEach(tx => {
                    const isDeposit = tx.type === 'deposit';
                    const color = isDeposit ? 'var(--primary-color)' : 'var(--danger)';
                    const sign = isDeposit ? '+' : '-';
                    let statusBadge = '';
                    if (tx.status === 'pending') statusBadge = '<span style="color:#ff9800; font-size:0.8rem;"><i class="fa-solid fa-clock"></i> Pending</span>';
                    else if (tx.status === 'approved') statusBadge = '<span style="color:var(--success); font-size:0.8rem;"><i class="fa-solid fa-check"></i> Success</span>';
                    else statusBadge = `<span style="color:var(--text-muted); font-size:0.8rem;">${tx.status}</span>`;

                    txTbody.innerHTML += `
                        <tr>
                            <td style="text-transform: capitalize; font-weight:500;">${tx.type}</td>
                            <td style="color:${color}; font-weight:600;">${sign}$${tx.amount.toFixed(2)}</td>
                            <td>${statusBadge}</td>
                        </tr>
                    `;
                });
            } else {
                txTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color:var(--text-muted);">No recent activity</td></tr>';
            }
        }

    } catch(err) {
        if(err.message.includes('Unauthorized')) logout();
    }
}

async function loadAdminData() {
    try {
        const data = await apiCall('/admin/stats', 'GET');
        document.getElementById('admin-tvl').innerText = data.tvl ? parseFloat(data.tvl).toLocaleString() : '0.00';
        document.getElementById('admin-users').innerText = data.totalUsers;
        
        const tbody = document.getElementById('admin-tx-table');
        tbody.innerHTML = '';
        
        if (data.pendingTransactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No pending transactions.</td></tr>';
            return;
        }
        
        data.pendingTransactions.forEach(tx => {
            if (tx.type === 'deposit') {
                tbody.innerHTML += `
                    <tr>
                        <td>${tx.username}</td>
                        <td style="color:var(--primary-color)">Deposit</td>
                        <td>+$${tx.amount.toFixed(2)}</td>
                        <td>${tx.tx_hash.substring(0,6)}...${tx.tx_hash.substring(tx.tx_hash.length-4)}</td>
                        <td><button class="btn-sm btn-approve" onclick="approveDeposit(${tx.id})">Approve</button></td>
                    </tr>
                `;
            } else if (tx.type === 'withdraw') {
                tbody.innerHTML += `
                    <tr>
                        <td>${tx.username}</td>
                        <td style="color:var(--danger)">Withdraw</td>
                        <td>-$${tx.amount.toFixed(2)}</td>
                        <td>To: ${(tx.wallet_address || 'N/A').substring(0,10)}...</td>
                        <td><button class="btn-sm btn-approve" onclick="approveWithdraw(${tx.id})">Approve</button></td>
                    </tr>
                `;
            }
        });
        
        // Fetch and display all users
        const udata = await apiCall('/admin/users', 'GET');
        const utbody = document.getElementById('admin-users-table');
        utbody.innerHTML = '';
        if (udata.length === 0) {
            utbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No users found.</td></tr>';
        } else {
            udata.forEach(u => {
                const date = new Date(u.created_at).toLocaleDateString();
                utbody.innerHTML += `
                    <tr>
                        <td>#${u.id}</td>
                        <td style="color: var(--primary-color); font-weight: 500;">${u.username}</td>
                        <td>$${u.balance.toFixed(2)}</td>
                        <td>$${u.active_investment.toFixed(2)}</td>
                        <td class="highlight-text">+$${u.total_earned.toFixed(2)}</td>
                        <td>${date}</td>
                        <td>
                            <button class="btn-sm btn-approve" style="margin-bottom:5px; width:100%;" onclick="openEditModal(${u.id}, ${u.balance}, ${u.active_investment}, ${u.total_earned})">Edit</button>
                            <button class="btn-sm" style="background:rgba(255,61,0,0.2); color:var(--danger); border:1px solid var(--danger); width:100%;" onclick="deleteUser(${u.id})">Delete</button>
                        </td>
                    </tr>
                `;
            });
        }
    } catch(err) {
        showToast('Admin access denied', 'error');
        switchTab('dashboard');
    }
}

async function approveDeposit(txId) {
    try {
        await apiCall(`/admin/approve-deposit/${txId}`, 'POST');
        showToast('Deposit approved successfully', 'success');
        loadAdminData();
    } catch(err) {}
}

async function approveWithdraw(txId) {
    try {
        await apiCall(`/admin/approve-withdraw/${txId}`, 'POST');
        showToast('Withdrawal approved successfully', 'success');
        loadAdminData();
    } catch(err) {}
}

async function updateAdminCredentials() {
    const username = document.getElementById('new-admin-user').value;
    const password = document.getElementById('new-admin-pass').value;
    if (!username || !password) return showToast('Please fill both fields', 'error');

    const btn = document.querySelector('#admin-view .btn-primary');
    const originalText = btn.innerText;
    btn.innerText = 'Updating...';

    try {
        await apiCall('/admin/credentials', 'POST', { username, password });
        showToast('Credentials updated! Please login again.', 'success');
        document.getElementById('new-admin-user').value = '';
        document.getElementById('new-admin-pass').value = '';
        setTimeout(() => logout(), 2000);
    } catch(err) {
        btn.innerText = originalText;
    }
}

function openEditModal(id, balance, investment, earned) {
    document.getElementById('edit-user-id').value = id;
    document.getElementById('edit-user-balance').value = balance;
    document.getElementById('edit-user-investment').value = investment;
    document.getElementById('edit-user-earned').value = earned;
    document.getElementById('edit-user-password').value = ""; // Clear password field
    document.getElementById('edit-user-modal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('edit-user-modal').classList.remove('active');
}

async function submitUserEdit() {
    const id = document.getElementById('edit-user-id').value;
    const balance = parseFloat(document.getElementById('edit-user-balance').value);
    const active_investment = parseFloat(document.getElementById('edit-user-investment').value);
    const total_earned = parseFloat(document.getElementById('edit-user-earned').value);
    const password = document.getElementById('edit-user-password').value;
    
    try {
        await apiCall(`/admin/user/${id}`, 'PUT', { balance, active_investment, total_earned, password });
        showToast('User updated successfully', 'success');
        closeEditModal();
        loadAdminData();
    } catch(err) {}
}

async function deleteUser(id) {
    if(!confirm("Are you sure you want to permanently delete this user?")) return;
    try {
        await apiCall(`/admin/user/${id}`, 'DELETE');
        showToast('User deleted successfully', 'success');
        loadAdminData();
    } catch(err) {}
}

async function saveWalletAddress() {
    const address = document.getElementById('user-wallet-address').value;
    if(!address) return showToast('Please enter an address', 'error');
    try {
        await apiCall('/user/wallet', 'POST', { wallet_address: address });
        showToast('Wallet address saved!', 'success');
    } catch(err) {}
}

async function submitWithdraw() {
    const amount = parseFloat(document.getElementById('withdraw-amount').value);
    if(!amount || amount <= 0) return showToast('Enter a valid amount', 'error');
    
    const btn = document.querySelector('#withdraw-view .btn-primary');
    btn.innerText = "Processing...";
    
    try {
        await apiCall('/user/withdraw', 'POST', { amount });
        showToast('Withdrawal requested successfully!', 'success');
        document.getElementById('withdraw-amount').value = '';
        loadUserData(); // refresh balance
        btn.innerText = "Request Withdrawal";
        switchTab('dashboard');
    } catch(err) {
        btn.innerText = "Request Withdrawal";
    }
}

async function submitDeposit() {
    const amount = parseFloat(document.getElementById('dep-amount').value);
    const txid = document.getElementById('dep-txid').value;
    
    if(!amount || !txid) return showToast('Please fill all fields', 'error');
    if(amount < 100) return showToast('Minimum deposit is 100 USDT', 'error');
    
    const btn = document.querySelector('.invest-container .btn-primary');
    btn.innerText = "Verifying...";
    
    try {
        await apiCall('/user/deposit', 'POST', { amount, tx_hash: txid });
        showToast('Deposit submitted! Pending admin approval.', 'success');
        document.getElementById('dep-amount').value = '';
        document.getElementById('dep-txid').value = '';
        
        // Reset visually
        btn.innerText = "Confirm Deposit";
        switchTab('dashboard');
    } catch(err) {
        btn.innerText = "Confirm Deposit";
    }
}

async function distributeInterest() {
    try {
        const res = await apiCall('/admin/distribute-interest', 'POST');
        showToast(res.message, 'success');
    } catch(err) {}
}

// --- UI Utilities ---
function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = type === 'success' 
        ? `<i class="fa-solid fa-circle-check"></i> ${msg}`
        : `<i class="fa-solid fa-circle-exclamation"></i> ${msg}`;
        
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'fadeIn 0.3s reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Typewriter Effect ---
const typewriterWords = ["3% Monthly", "Referral Rewards", "Reliable Yields", "Passive Income"];
let typewriterIndex = 0;
let charIndex = 0;
let isDeleting = false;

function typeWriter() {
    const textElement = document.getElementById("typewriter-text");
    if (!textElement) return;

    const currentWord = typewriterWords[typewriterIndex];
    
    if (isDeleting) {
        textElement.innerText = currentWord.substring(0, charIndex - 1);
        charIndex--;
    } else {
        textElement.innerText = currentWord.substring(0, charIndex + 1);
        charIndex++;
    }

    let typeSpeed = isDeleting ? 40 : 100;

    if (!isDeleting && charIndex === currentWord.length) {
        typeSpeed = 2000; // Pause at end of word
        isDeleting = true;
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        typewriterIndex = (typewriterIndex + 1) % typewriterWords.length;
        typeSpeed = 500; // Pause before typing new word
    }

    setTimeout(typeWriter, typeSpeed);
}

// Auto-check authentication on load
window.addEventListener('DOMContentLoaded', () => {
    // Check for referral code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
        localStorage.setItem('pending_ref', refCode);
    }
    
    initDefaultView();
    typeWriter(); // Initialize typewriter effect
});

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.viewId) {
        switchMainView(e.state.viewId, e.state.authMode, false);
    } else {
        initDefaultView();
    }
});

function initDefaultView() {
    const token = localStorage.getItem('crypto_token');
    if (token) {
        switchMainView('app-layout', 'login', false);
    } else {
        if(location.hash === '#auth-view') {
            switchMainView('auth-view', 'login', false);
        } else {
            switchMainView('landing-view', 'login', false);
        }
    }
}

function connectWallet() {
    const btn = document.getElementById('wallet-text');
    if (btn.innerText === "Connect Wallet") {
        btn.innerText = "Connecting...";
        setTimeout(() => {
            btn.innerText = "0x4A...2b9C";
            document.querySelector('.btn-connect').style.background = "linear-gradient(135deg, #00e676, #00b3ff)";
        }, 1500);
    }
}

let platformSettings = {};

async function loadPlatformSettings() {
    try {
        platformSettings = await apiCall('/settings', 'GET');
        // Update Admin UI fields if admin is logged in
        const role = localStorage.getItem('crypto_role');
        if (role === 'admin') {
            document.getElementById('admin-trc20-wallet').value = platformSettings.trc20_wallet || '';
            document.getElementById('admin-trc20-qr').value = platformSettings.trc20_qr || '';
            if (platformSettings.trc20_qr) {
                document.getElementById('admin-trc20-preview').src = platformSettings.trc20_qr;
                document.getElementById('admin-trc20-preview').style.display = 'block';
            }
            
            document.getElementById('admin-bep20-wallet').value = platformSettings.bep20_wallet || '';
            document.getElementById('admin-bep20-qr').value = platformSettings.bep20_qr || '';
            if (platformSettings.bep20_qr) {
                document.getElementById('admin-bep20-preview').src = platformSettings.bep20_qr;
                document.getElementById('admin-bep20-preview').style.display = 'block';
            }
            
            document.getElementById('admin-erc20-wallet').value = platformSettings.erc20_wallet || '';
            document.getElementById('admin-erc20-qr').value = platformSettings.erc20_qr || '';
            if (platformSettings.erc20_qr) {
                document.getElementById('admin-erc20-preview').src = platformSettings.erc20_qr;
                document.getElementById('admin-erc20-preview').style.display = 'block';
            }
        }
        
        // Setup initial network selection for user
        const activeNetwork = document.querySelector('.network-card.active');
        if (activeNetwork) selectNetwork(activeNetwork);
        
    } catch(err) {
        console.log("Failed to load settings");
    }
}

async function saveAdminPaymentSettings() {
    const updates = {
        trc20_wallet: document.getElementById('admin-trc20-wallet').value,
        trc20_qr: document.getElementById('admin-trc20-qr').value,
        bep20_wallet: document.getElementById('admin-bep20-wallet').value,
        bep20_qr: document.getElementById('admin-bep20-qr').value,
        erc20_wallet: document.getElementById('admin-erc20-wallet').value,
        erc20_qr: document.getElementById('admin-erc20-qr').value
    };
    
    try {
        const res = await apiCall('/admin/settings', 'POST', updates);
        showToast(res.message, 'success');
        loadPlatformSettings(); // Reload locally
    } catch (err) {}
}

function handleQrUpload(input, hiddenId, previewId) {
    if (input.files && input.files[0]) {
        if (input.files[0].size > 3000000) {
            showToast('Image size too large. Keep it under 3MB', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById(hiddenId).value = e.target.result;
            const preview = document.getElementById(previewId);
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function selectNetwork(element) {
    document.querySelectorAll('.network-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    const addressInput = document.getElementById('deposit-address');
    const qrImg = document.getElementById('deposit-qr');
    
    if(element.innerText.includes('TRC20')) {
        addressInput.value = platformSettings.trc20_wallet || "Loading...";
        qrImg.src = platformSettings.trc20_qr || "";
    } else if (element.innerText.includes('BEP20')) {
        addressInput.value = platformSettings.bep20_wallet || "Loading...";
        qrImg.src = platformSettings.bep20_qr || "";
    } else {
        addressInput.value = platformSettings.erc20_wallet || "Loading...";
        qrImg.src = platformSettings.erc20_qr || "";
    }
}

function copyAddress() {
    const copyText = document.getElementById("deposit-address");
    copyText.select();
    navigator.clipboard.writeText(copyText.value);
    const btn = document.querySelector('.address-copy button i');
    btn.className = "fa-solid fa-check";
    setTimeout(() => btn.className = "fa-regular fa-copy", 2000);
}

// ROI Calculator Logic
function updateCalculator(prefix = 'dash', fromInput = false) {
    const slider = document.getElementById(`${prefix}-calc-slider`);
    const input = document.getElementById(`${prefix}-calc-input`);
    
    let baseVal = parseFloat(fromInput ? input.value : slider.value);
    if (isNaN(baseVal)) baseVal = 100;
    
    if (!fromInput) input.value = baseVal;
    if (fromInput && baseVal >= 100 && baseVal <= 50000) slider.value = baseVal;
    
    const monthly = baseVal * 0.03;
    const yearly = monthly * 12;
    
    document.getElementById(`${prefix}-calc-monthly`).innerText = `+$${monthly.toFixed(2)}`;
    document.getElementById(`${prefix}-calc-yearly`).innerText = `+$${yearly.toFixed(2)}`;
}
