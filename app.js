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
    
    if(viewId === 'auth-view') {
        toggleAuthForm(authMode);
    }
    
    if(viewId === 'app-layout') {
        initDashboard();
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
    const subtitle = document.getElementById('auth-subtitle');
    
    if (mode === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        subtitle.innerText = 'Welcome back! Please login.';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        subtitle.innerText = 'Create an account to start earning.';
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
        if (!res.ok) throw new Error(data.error || 'API Error');
        return data;
    } catch (err) {
        showToast(err.message, 'error');
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
        // error handled in apiCall
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

        await apiCall('/register', 'POST', payload);
        
        localStorage.removeItem('pending_ref');
        showToast('Registration successful! Please login.', 'success');
        toggleAuthForm('login');
    } catch(err) {
        // error handled
    } finally {
        btn.innerText = 'Create Account';
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
    const username = localStorage.getItem('crypto_user');
    
    document.getElementById('display-username').innerText = username;
    
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
        document.getElementById('withdraw-available').innerText = data.balance.toFixed(2);
        if(data.wallet_address) {
            document.getElementById('user-wallet-address').value = data.wallet_address;
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

// Auto-check authentication on load
window.addEventListener('DOMContentLoaded', () => {
    // Check for referral code in URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
        localStorage.setItem('pending_ref', refCode);
    }
    
    initDefaultView();
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

function selectNetwork(element) {
    document.querySelectorAll('.network-card').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    const addressInput = document.getElementById('deposit-address');
    if(element.innerText.includes('TRC20')) addressInput.value = "TWeRXYZ123ABCxyz789QWERTY";
    else if (element.innerText.includes('BEP20')) addressInput.value = "0x89ABcd12345efGhI67890JKL";
    else addressInput.value = "0xETHAddressExample90123XYZ";
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
