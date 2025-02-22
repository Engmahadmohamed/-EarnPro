// Admin Authentication
const ADMIN_PASSWORD = "615102410";
let currentScreen = 'dashboard';

// Initialize admin panel
document.addEventListener('DOMContentLoaded', () => {
    setupFirebaseListeners();
    setupNavigation();
    showScreen('dashboard');
});

function checkAdminAuth() {
    const storedAuth = sessionStorage.getItem("adminAuth");
    if (!storedAuth) {
        const password = prompt("Enter admin password:");
        if (password !== ADMIN_PASSWORD) {
            alert("Invalid password");
            window.location.href = "index.html";
            return false;
        }
        sessionStorage.setItem("adminAuth", "true");
    }
    return true;
}

// Set up Firebase real-time listeners
function setupFirebaseListeners() {
    // Connect to Firebase paths
    const usersRef = dbRef(db, 'users');
    const withdrawalsRef = dbRef(db, 'withdrawals');

    // Real-time users data
    dbOnValue(usersRef, (snapshot) => {
        const users = snapshot.val() || {};
        updateDashboardStats(users);
        updateUsersTable(users);
    });

    // Real-time withdrawals data
    dbOnValue(withdrawalsRef, (snapshot) => {
        const withdrawals = snapshot.val() || {};
        updateWithdrawalsTable(withdrawals);
        updatePendingWithdrawalsCount(withdrawals);
    });
}

// Navigation
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(button => {
        button.addEventListener('click', () => {
            showScreen(button.dataset.screen);
        });
    });
}

function showScreen(screenId) {
    currentScreen = screenId;
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-screen="${screenId}"]`).classList.add('active');

    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById(screenId).style.display = 'block';
}

// Update dashboard statistics
function updateDashboardStats(users) {
    const stats = {
        totalUsers: 0,
        totalAdsWatched: 0,
        totalEarnings: 0
    };

    Object.values(users).forEach(user => {
        stats.totalUsers++;
        stats.totalAdsWatched += user.adsWatched || 0;
        stats.totalEarnings += user.totalEarned || 0;
    });

    document.getElementById('totalUsers').textContent = stats.totalUsers;
    document.getElementById('totalAdsWatched').textContent = stats.totalAdsWatched;
    document.getElementById('totalEarnings').textContent = `$${stats.totalEarnings.toFixed(2)}`;
}

// Update users table
function updateUsersTable(users) {
    const tableBody = document.getElementById('usersTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    Object.entries(users).forEach(([phoneNumber, userData]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${phoneNumber}</td>
            <td>$${(userData.balance || 0).toFixed(2)}</td>
            <td>${userData.adsWatched || 0}</td>
            <td>$${(userData.totalEarned || 0).toFixed(2)}</td>
            <td>${new Date(userData.joinDate || Date.now()).toLocaleDateString()}</td>
            <td>${new Date(userData.lastAdWatch || userData.joinDate || Date.now()).toLocaleDateString()}</td>
            <td>
                <button onclick="viewUserDetails('${phoneNumber}')" class="btn btn-info">
                    <i class="fas fa-eye"></i>
                </button>
                <button onclick="toggleUserBan('${phoneNumber}', ${!userData.banned})" 
                    class="btn ${userData.banned ? 'btn-success' : 'btn-danger'}">
                    <i class="fas fa-${userData.banned ? 'user-check' : 'ban'}"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// Update withdrawals table
function updateWithdrawalsTable(withdrawals) {
    const tableBody = document.getElementById('withdrawalsTableBody');
    if (!tableBody) return;

    tableBody.innerHTML = '';
    Object.entries(withdrawals).forEach(([userId, userWithdrawals]) => {
        Object.entries(userWithdrawals).forEach(([withdrawalId, withdrawal]) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${userId}</td>
                <td>$${withdrawal.amount.toFixed(2)}</td>
                <td>${withdrawal.evcNumber}</td>
                <td>${new Date(withdrawal.timestamp).toLocaleString()}</td>
                <td><span class="status-badge ${withdrawal.status}">${withdrawal.status}</span></td>
                <td>
                    ${withdrawal.status === 'pending' ? `
                        <button onclick="handleWithdrawal('${userId}', '${withdrawalId}', 'approve')" 
                            class="btn btn-success">
                            <i class="fas fa-check"></i>
                        </button>
                        <button onclick="handleWithdrawal('${userId}', '${withdrawalId}', 'reject')" 
                            class="btn btn-danger">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                </td>
            `;
            tableBody.appendChild(row);
        });
    });
}

// User actions
window.viewUserDetails = function(phoneNumber) {
    const userRef = dbRef(db, `users/${phoneNumber}`);
    dbGet(userRef).then(snapshot => {
        const userData = snapshot.val();
        if (!userData) return;
        showUserDetailsModal(phoneNumber, userData);
    });
};

window.toggleUserBan = function(phoneNumber, ban) {
    if (confirm(`Are you sure you want to ${ban ? 'ban' : 'unban'} this user?`)) {
        const userRef = dbRef(db, `users/${phoneNumber}`);
        dbUpdate(userRef, {
            banned: ban,
            banDate: ban ? Date.now() : null
        });
    }
};

// Withdrawal actions
window.handleWithdrawal = function(userId, withdrawalId, action) {
    const withdrawalRef = dbRef(db, `withdrawals/${userId}/${withdrawalId}`);
    const userRef = dbRef(db, `users/${userId}`);

    if (action === 'approve') {
        dbUpdate(withdrawalRef, {
            status: 'completed',
            completedAt: Date.now()
        });
    } else if (action === 'reject') {
        dbGet(withdrawalRef).then(snapshot => {
            const withdrawal = snapshot.val();
            if (!withdrawal) return;

            dbGet(userRef).then(userSnapshot => {
                const userData = userSnapshot.val();
                if (!userData) return;

                // Refund the amount
                dbUpdate(userRef, {
                    balance: (userData.balance || 0) + withdrawal.amount
                });

                // Update withdrawal status
                dbUpdate(withdrawalRef, {
                    status: 'rejected',
                    rejectedAt: Date.now()
                });
            });
        });
    }
};

// Helper functions
function updatePendingWithdrawalsCount(withdrawals) {
    let pendingCount = 0;
    Object.values(withdrawals).forEach(userWithdrawals => {
        Object.values(userWithdrawals).forEach(withdrawal => {
            if (withdrawal.status === 'pending') pendingCount++;
        });
    });
    document.getElementById('pendingWithdrawals').textContent = pendingCount;
}

// Modal management
document.querySelector('.close-btn')?.addEventListener('click', () => {
    document.getElementById('userDetailsModal').style.display = 'none';
});

function showUserDetailsModal(phoneNumber, userData) {
    const modal = document.getElementById('userDetailsModal');
    const content = document.getElementById('userDetailsContent');
    
    content.innerHTML = `
        <div class="user-details">
            <p><strong>Phone Number:</strong> ${phoneNumber}</p>
            <p><strong>Balance:</strong> $${(userData.balance || 0).toFixed(2)}</p>
            <p><strong>Ads Watched:</strong> ${userData.adsWatched || 0}</p>
            <p><strong>Total Earned:</strong> $${(userData.totalEarned || 0).toFixed(2)}</p>
            <p><strong>Join Date:</strong> ${new Date(userData.joinDate || Date.now()).toLocaleString()}</p>
            <p><strong>Last Active:</strong> ${new Date(userData.lastAdWatch || userData.joinDate || Date.now()).toLocaleString()}</p>
            <p><strong>Status:</strong> ${userData.banned ? 'Banned' : 'Active'}</p>
            <p><strong>Channel Joined:</strong> ${userData.hasJoinedChannel ? 'Yes' : 'No'}</p>
            <p><strong>Contact Info:</strong> ${userData.contactInfo || 'Not provided'}</p>
        </div>
    `;
    
    modal.style.display = 'flex';
}

// Load and display all users
function loadAllUsers() {
    checkForNewUsers();
}

function getAllUsers() {
    const users = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("userData_")) {
            const username = key.replace("userData_", "");
            const userData = JSON.parse(localStorage.getItem(key));
            
            // Store in admin storage
            const adminStorage = JSON.parse(localStorage.getItem('adminStorage'));
            if (!adminStorage.users[username]) {
                adminStorage.users[username] = {
                    joinDate: userData.joinDate || new Date().toISOString(),
                    lastActive: new Date().toISOString()
                };
                localStorage.setItem('adminStorage', JSON.stringify(adminStorage));
            }
            
            users.push({ username, ...userData });
        }
    }
    return users;
}

function updateAdminStats(users) {
    const totalUsers = users.length;
    const totalWithdrawn = users.reduce((sum, user) => sum + (user.totalWithdrawn || 0), 0);
    const totalAdsWatched = users.reduce((sum, user) => sum + (user.adsWatched || 0), 0);

    document.getElementById("totalUsers").textContent = totalUsers;
    document.getElementById("totalWithdrawn").textContent = `$${totalWithdrawn.toFixed(2)}`;
    document.getElementById("totalAdsWatched").textContent = totalAdsWatched;
}

function displayUsers(users, newUsers = []) {
    const tbody = document.getElementById("usersTableBody");
    tbody.innerHTML = "";

    // Get admin storage
    const adminStorage = JSON.parse(localStorage.getItem('adminStorage'));

    users.forEach(user => {
        const tr = document.createElement("tr");
        const storedUserData = adminStorage.users[user.username];
        const joinDate = storedUserData ? formatDate(new Date(storedUserData.joinDate)) : formatDate(new Date(user.joinDate));
        
        // Check if this is a new user
        const isNewUser = newUsers.some(newUser => newUser.username === user.username);
        if (isNewUser) {
            tr.classList.add('new-user');
            tr.classList.add('new-user-animation');
            
            // Store the new user's join date
            adminStorage.users[user.username] = {
                joinDate: user.joinDate || new Date().toISOString(),
                lastSeen: new Date().toISOString()
            };
            localStorage.setItem('adminStorage', JSON.stringify(adminStorage));
        }
        
        // Create table row content
        tr.innerHTML = `
            <td>
                ${user.username}
                ${isNewUser ? '<span class="new-badge">New</span>' : ''}
                ${user.contactInfo ? `
                    <div class="contact-info">
                        <i class="fas fa-address-card"></i>
                        ${user.contactInfo}
                    </div>
                ` : ''}
            </td>
            <td>$${user.balance.toFixed(2)}</td>
            <td>$${((user.balance || 0) + (user.totalWithdrawn || 0)).toFixed(2)}</td>
            <td>${user.adsWatched || 0}</td>
            <td>${user.referrals || 0}</td>
            <td>${joinDate}</td>
            <td>
                <button onclick="viewUserDetails('${user.username}')" class="admin-btn">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Update statistics
    updateAdminStats(users);
}

// User Management Functions
let currentUsername = null; // To track which user is being managed

// Update the formatDate function to use local date format
function formatDate(date) {
    // Check if date is valid
    if (!(date instanceof Date) || isNaN(date)) {
        return 'Invalid Date';
    }

    // Get local date string
    const localDate = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    // Get local time string
    const localTime = date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });

    return `${localDate}, ${localTime}`;
}

// Add this function to get current date in local timezone
function getCurrentDate() {
    const now = new Date();
    // Adjust for local timezone
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
    return localDate;
}

function viewUserDetails(username) {
    currentUsername = username;
    const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
    const modal = document.getElementById("userDetailsModal");
    const details = document.getElementById("userDetails");
    
    if (!userData.joinDate) {
        userData.joinDate = new Date().toISOString();
        localStorage.setItem(`userData_${username}`, JSON.stringify(userData));
    }

    const joinDate = userData.joinDate ? formatDate(new Date(userData.joinDate)) : 'Unknown';
    const lastActivity = userData.lastActivityDate ? formatDate(new Date(userData.lastActivityDate)) : 'Never';
    const channelJoinDate = userData.channelJoinDate ? formatDate(new Date(userData.channelJoinDate)) : 'Not joined';
    const currentDate = formatDate(getCurrentDate());

    const userHeaderHTML = `
        <div class="user-header">
            <i class="fas fa-user-circle"></i>
            <h3>${username}</h3>
            <div class="join-date">
                <i class="far fa-calendar-alt"></i>
                Joined: ${joinDate}
                <button onclick="editJoinDate('${username}')" class="date-edit-btn">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        </div>
        
        <div class="date-controls">
            <div class="date-control-item">
                <span>Last Activity:</span>
                <span>${lastActivity}</span>
                <button onclick="updateLastActivity('${username}')" class="date-edit-btn">
                    <i class="fas fa-sync"></i>
                </button>
            </div>
            <div class="date-control-item">
                <span>Channel Join Date:</span>
                <span>${channelJoinDate}</span>
                <button onclick="editChannelJoinDate('${username}')" class="date-edit-btn">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
            <div class="date-control-item">
                <span>Account Status:</span>
                <span class="${userData.isActive ? 'active-status' : 'inactive-status'}">
                    ${userData.isActive ? 'Active' : 'Inactive'}
                </span>
                <button onclick="toggleAccountStatus('${username}')" class="date-edit-btn">
                    <i class="fas fa-power-off"></i>
                </button>
            </div>
        </div>
    `;

    const contactHTML = userData.contactInfo ? `
        <div class="contact-section">
            <h4><i class="fas fa-address-card"></i> Contact Information</h4>
            <div class="contact-value">${userData.contactInfo}</div>
        </div>
    ` : '';

    const statsHTML = `
        <div class="stats-grid">
            <div class="stat-box balance">
                <div class="stat-label">
                    <i class="fas fa-wallet"></i>
                    Balance
                </div>
                <div class="stat-value">$${userData.balance.toFixed(2)}</div>
                <div class="stat-date">
                    <i class="far fa-clock"></i>
                    Last updated: ${currentDate}
                </div>
            </div>
            
            <div class="stat-box">
                <div class="stat-label">
                    <i class="fas fa-hand-holding-usd"></i>
                    Total Withdrawn
                </div>
                <div class="stat-value ${(userData.totalWithdrawn || 0) === 0 ? 'zero-value' : ''}">
                    $${(userData.totalWithdrawn || 0).toFixed(2)}
                </div>
                <div class="stat-date">
                    <i class="far fa-clock"></i>
                    Last withdrawal: 
                    <span class="${!userData.lastWithdrawalDate ? 'status-never' : ''}">
                        ${userData.lastWithdrawalDate ? formatDate(new Date(userData.lastWithdrawalDate)) : 'Never'}
                    </span>
                </div>
            </div>
            
            <div class="stat-box">
                <div class="stat-label">
                    <i class="fas fa-play-circle"></i>
                    Ads Watched
                </div>
                <div class="stat-value ${(userData.adsWatched || 0) === 0 ? 'zero-value' : ''}">
                    ${userData.adsWatched || 0}
                </div>
                <div class="stat-date">
                    <i class="far fa-clock"></i>
                    Last ad: 
                    <span class="${!userData.lastAdDate ? 'status-never' : ''}">
                        ${userData.lastAdDate ? formatDate(new Date(userData.lastAdDate)) : 'Never'}
                    </span>
                </div>
            </div>
            
            <div class="stat-box">
                <div class="stat-label">
                    <i class="fas fa-users"></i>
                    Referrals
                </div>
                <div class="stat-value ${(userData.referrals || 0) === 0 ? 'zero-value' : ''}">
                    ${userData.referrals || 0}
                </div>
                <div class="stat-date">
                    <i class="far fa-clock"></i>
                    Last referral: 
                    <span class="${!userData.lastReferralDate ? 'status-never' : ''}">
                        ${userData.lastReferralDate ? formatDate(new Date(userData.lastReferralDate)) : 'Never'}
                    </span>
                </div>
            </div>
        </div>
    `;

    const referralHTML = `
        <div class="referral-info">
            <h4><i class="fas fa-users"></i> Referral Details</h4>
            <div class="referral-details">
                <div class="referral-item">
                    <span>Referral Code:</span>
                    <div class="code-container">
                        <code>${userData.referralCode || 'None'}</code>
                        <button onclick="copyReferralCode('${userData.referralCode}')" class="copy-btn">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
                <div class="referral-item">
                    <span>Telegram Bot Link:</span>
                    <div class="link-container">
                        <input type="text" readonly value="https://t.me/Ad_Cashbot?start=${userData.referralCode}" class="referral-link-input">
                        <button onclick="copyReferralLink('${userData.referralCode}')" class="copy-btn">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
                <div class="referral-item">
                    <span>Referred By:</span>
                    <strong>${userData.referredBy || 'None'}</strong>
                </div>
                <div class="referral-item">
                    <span>Total Referrals:</span>
                    <strong>${userData.referrals || 0}/5</strong>
                </div>
                <div class="referral-item">
                    <span>Referral Earnings:</span>
                    <strong>$${((userData.referrals || 0) * 0.05).toFixed(2)}</strong>
                </div>
            </div>
            ${userData.referredUsers && userData.referredUsers.length > 0 ? `
                <div class="referred-users">
                    <h5>Referred Users:</h5>
                    <ul>
                        ${userData.referredUsers.map(user => `<li>${user}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `;

    // Add action buttons section
    const actionButtonsHTML = `
        <div class="action-buttons">
            <div class="button-group">
                <button class="admin-btn" onclick="editBalance('${username}')">
                    <i class="fas fa-edit"></i> Edit Balance
                </button>
                <button class="admin-btn warning" onclick="resetBalance()">
                    <i class="fas fa-redo"></i> Reset Balance
                </button>
                <button class="admin-btn success" onclick="approveWithdrawal()">
                    <i class="fas fa-check"></i> Approve Withdrawal
                </button>
            </div>
            <div class="button-group">
                <button class="admin-btn" onclick="editReferrals('${username}')">
                    <i class="fas fa-users"></i> Edit Referrals
                </button>
                <button class="admin-btn warning" onclick="resetAdsWatched('${username}')">
                    <i class="fas fa-eye-slash"></i> Reset Ads
                </button>
                <button class="admin-btn danger" onclick="deleteUser()">
                    <i class="fas fa-trash"></i> Delete User
                </button>
            </div>
        </div>
    `;

    details.innerHTML = `
        ${userHeaderHTML}
        ${actionButtonsHTML}
        ${contactHTML}
        ${statsHTML}
        <div class="score-card">
            <div class="score-info">
                <div class="score-label">User Score</div>
                <div class="score-value">${calculateUserScore(userData)}/100</div>
            </div>
            <div class="score-progress">
                <div class="score-bar" style="width: ${calculateUserScore(userData)}%"></div>
            </div>
        </div>
        
        <div class="channel-status">
            <span class="status-label">Channel Joined</span>
            <span class="status-badge ${userData.hasJoinedChannel ? 'joined' : 'not-joined'}">
                <i class="fas ${userData.hasJoinedChannel ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                ${userData.hasJoinedChannel ? `Yes (${formatDate(new Date(userData.channelJoinDate || userData.joinDate))})` : 'No'}
            </span>
        </div>
        
        <div class="history-container">
            <div class="history-header">
                <i class="fas fa-history"></i>
                <h4>Transaction History</h4>
            </div>
            <div class="history-list">
                ${userData.history.map(item => {
                    const amount = item.match(/\(\$([0-9.]+)\)/);
                    const timestamp = item.match(/at ([\d:]+\s[AP]M)/);
                    const date = new Date();
                    return `
                        <div class="history-item">
                            <div class="history-time">
                                <i class="far fa-clock"></i>
                                ${formatDate(date)}
                            </div>
                            <div class="history-content">
                                ${item.replace(/\(\$([0-9.]+)\)/, 
                                    `<span class="amount-badge">+$${amount ? amount[1] : '0.00'}</span>`
                                )}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
        
        ${referralHTML}
    `;
    
    // Add copy functions
    function copyReferralCode(code) {
        navigator.clipboard.writeText(code);
        showAdminToast('Referral code copied!', 'success');
    }
    
    function copyReferralLink(code) {
        navigator.clipboard.writeText(`https://t.me/Ad_Cashbot?start=${code}`);
        showAdminToast('Telegram bot link copied!', 'success');
    }
    
    modal.style.display = "flex";
}

function closeUserModal() {
    document.getElementById("userDetailsModal").style.display = "none";
}

function banUser() {
    if (!currentUsername) return;
    
    if (confirm(`Are you sure you want to ban ${currentUsername}?`)) {
        // Remove user data
        localStorage.removeItem(`userData_${currentUsername}`);
        // Add to banned users list
        const bannedUsers = JSON.parse(localStorage.getItem('bannedUsers') || '[]');
        bannedUsers.push(currentUsername);
        localStorage.setItem('bannedUsers', JSON.stringify(bannedUsers));
        
        closeUserModal();
        loadAllUsers();
        showAdminToast('User banned successfully', 'success');
    }
}

function resetBalance() {
    if (!currentUsername) return;
    
    if (confirm(`Are you sure you want to reset ${currentUsername}'s balance?`)) {
        const userData = JSON.parse(localStorage.getItem(`userData_${currentUsername}`));
        userData.balance = 0;
        userData.history.push(`Balance reset by admin at ${new Date().toLocaleString()}`);
        localStorage.setItem(`userData_${currentUsername}`, JSON.stringify(userData));
        
        viewUserDetails(currentUsername); // Refresh modal
        loadAllUsers(); // Refresh table
        showAdminToast('Balance reset successfully', 'success');
    }
}

function editBalance(username) {
    const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
    const newBalance = prompt('Enter new balance:', userData.balance);
    
    if (newBalance !== null && !isNaN(newBalance)) {
        updateUserData(username, {
            balance: parseFloat(newBalance),
            history: [
                ...userData.history,
                `Balance edited by admin to $${newBalance} at ${new Date().toLocaleString()}`
            ]
        });
        
        viewUserDetails(username);
        loadAllUsers();
        showAdminToast('Balance updated successfully', 'success');
    }
}

function resetAdsWatched(username) {
    if (confirm('Reset ads watched count to 0?')) {
        const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
        userData.adsWatched = 0;
        userData.history.push(`Ads watched count reset by admin at ${new Date().toLocaleString()}`);
        localStorage.setItem(`userData_${username}`, JSON.stringify(userData));
        
        viewUserDetails(username);
        loadAllUsers();
        showAdminToast('Ads watched count reset', 'success');
    }
}

function editReferrals(username) {
    const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
    const newCount = prompt('Enter new referrals count:', userData.referrals || 0);
    
    if (newCount !== null && !isNaN(newCount)) {
        userData.referrals = parseInt(newCount);
        userData.history.push(`Referrals count edited by admin to ${newCount} at ${new Date().toLocaleString()}`);
        localStorage.setItem(`userData_${username}`, JSON.stringify(userData));
        
        viewUserDetails(username);
        loadAllUsers();
        showAdminToast('Referrals updated successfully', 'success');
    }
}

function approveWithdrawal() {
    if (!currentUsername) return;
    
    const userData = JSON.parse(localStorage.getItem(`userData_${currentUsername}`));
    const amount = prompt('Enter withdrawal amount to approve:', userData.balance);
    
    if (amount && !isNaN(amount) && parseFloat(amount) <= userData.balance) {
        const newBalance = userData.balance - parseFloat(amount);
        const totalWithdrawn = (userData.totalWithdrawn || 0) + parseFloat(amount);
        
        updateUserData(currentUsername, {
            balance: newBalance,
            totalWithdrawn: totalWithdrawn,
            lastWithdrawalDate: new Date().toISOString(),
            history: [
                ...userData.history,
                `Withdrawal of $${amount} approved by admin at ${new Date().toLocaleString()}`
            ]
        });
        
        viewUserDetails(currentUsername);
        loadAllUsers();
        showAdminToast('Withdrawal approved successfully', 'success');
    }
}

function deleteUser() {
    if (!currentUsername || !confirm(`Are you sure you want to delete ${currentUsername}?`)) return;
    
    localStorage.removeItem(`userData_${currentUsername}`);
    closeUserModal();
    loadAllUsers();
    showAdminToast('User deleted successfully', 'success');
}

// Admin Toast Notification
function showAdminToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    
    // Icon based on type
    const iconClass = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    }[type] || 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${iconClass}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Remove toast after delay
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// Export Data
function exportUserData() {
    const users = getAllUsers();
    const dataStr = JSON.stringify(users, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `users_export_${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Search functionality
document.getElementById("searchUser").addEventListener("input", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const users = getAllUsers();
    const filteredUsers = users.filter(user => 
        user.username.toLowerCase().includes(searchTerm) ||
        (user.contactInfo && user.contactInfo.toLowerCase().includes(searchTerm))
    );
    displayUsers(filteredUsers);
});

// Update the auto-refresh function to check every 1 second
function setupAutoRefresh() {
    // Check every 1 second
    setInterval(() => {
        checkForNewUsers();
    }, 1000); // Changed from 5000 to 1000 milliseconds
}

// Update the checkForNewUsers function
function checkForNewUsers() {
    const adminStorage = JSON.parse(localStorage.getItem('adminStorage'));
    const currentUsers = getAllUsers();
    
    // Compare with last known state to find new users
    const newUsers = currentUsers.filter(user => {
        // Check if user exists in lastKnownState
        const isNewUser = !adminStorage.lastKnownState[user.username];
        
        // Update last known state for this user
        adminStorage.lastKnownState[user.username] = {
            joinDate: user.joinDate,
            lastSeen: new Date().toISOString()
        };
        
        return isNewUser;
    });

    // Save updated adminStorage
    localStorage.setItem('adminStorage', JSON.stringify(adminStorage));

    // Display users and show notifications for new ones
    if (newUsers.length > 0) {
        displayUsers(currentUsers, newUsers);
        newUsers.forEach(user => {
            showAdminToast(`New user joined: ${user.username}`, 'success');
        });
    } else {
        displayUsers(currentUsers);
    }
}

// Add this to handle page visibility
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        loadAllUsers(); // Refresh when page becomes visible
    }
});

// Add WebSocket-like functionality using localStorage events
function setupRealtimeUpdates() {
    // Listen for any changes in localStorage
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('userData_')) {
            handleRealtimeUpdate(e.key);
        }
    });

    // Set up periodic polling as backup
    setInterval(() => {
        checkForUpdates();
    }, 1000);
}

// Handle real-time updates
function handleRealtimeUpdate(key) {
    const username = key.replace('userData_', '');
    const userData = JSON.parse(localStorage.getItem(key));
    
    // Update user in table
    updateUserRow(username, userData);
    
    // Update stats
    updateAdminStats(getAllUsers());
    
    // Update modal if open
    if (currentUsername === username) {
        viewUserDetails(username);
    }
    
    // Show notification
    showAdminToast(`User ${username} data updated`, 'info');
}

// Update specific user row without refreshing entire table
function updateUserRow(username, userData) {
    const tbody = document.getElementById("usersTableBody");
    const existingRow = [...tbody.getElementsByTagName('tr')].find(row => 
        row.cells[0].textContent.trim() === username
    );
    
    if (existingRow) {
        const joinDate = userData.joinDate ? formatDate(new Date(userData.joinDate)) : 'Unknown';
        
        existingRow.innerHTML = `
            <td>
                ${username}
                ${userData.contactInfo ? `
                    <div class="contact-info">
                        <i class="fas fa-address-card"></i>
                        ${userData.contactInfo}
                    </div>
                ` : ''}
            </td>
            <td>$${userData.balance.toFixed(2)}</td>
            <td>$${((userData.balance || 0) + (userData.totalWithdrawn || 0)).toFixed(2)}</td>
            <td>${userData.adsWatched || 0}</td>
            <td>${userData.referrals || 0}</td>
            <td>${joinDate}</td>
            <td>
                <button onclick="viewUserDetails('${username}')" class="admin-btn">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        
        // Add highlight animation
        existingRow.classList.add('row-updated');
        setTimeout(() => {
            existingRow.classList.remove('row-updated');
        }, 2000);
    } else {
        // New user - refresh the whole table
        loadAllUsers();
    }
}

// Check for any updates
function checkForUpdates() {
    const users = getAllUsers();
    const lastKnownState = JSON.parse(localStorage.getItem('lastKnownState') || '{}');
    
    users.forEach(user => {
        const lastState = lastKnownState[user.username];
        if (!lastState || JSON.stringify(user) !== JSON.stringify(lastState)) {
            handleRealtimeUpdate(`userData_${user.username}`);
        }
    });
    
    // Update last known state
    const newState = {};
    users.forEach(user => {
        newState[user.username] = user;
    });
    localStorage.setItem('lastKnownState', JSON.stringify(newState));
}

// Update the addHistoryEntry function
function addHistoryEntry(userData, message) {
    if (!userData.history) {
        userData.history = [];
    }
    userData.history.push({
        message: message,
        timestamp: getCurrentDate().toISOString()
    });
}

// Add real-time monitoring
function setupRealtimeMonitoring() {
    setInterval(() => {
        const users = getAllUsers();
        updateAdminStats(users);
        checkForNewUsers();
    }, 1000);
}

function updateUserData(username, updates) {
    const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
    const updatedData = { ...userData, ...updates };
    localStorage.setItem(`userData_${username}`, JSON.stringify(updatedData));
    return updatedData;
}

// Add this function to handle persistent storage
function initializeStorage() {
    if (!localStorage.getItem('adminStorage')) {
        localStorage.setItem('adminStorage', JSON.stringify({
            users: {},
            lastKnownState: {},
            statistics: {
                totalUsers: 0,
                totalWithdrawn: 0,
                totalAdsWatched: 0
            }
        }));
    }
}

// Add this function to calculate user score
function calculateUserScore(userData) {
    let score = 0;
    
    // Activity score (max 30)
    if (userData.adsWatched > 0) score += Math.min(userData.adsWatched * 2, 30);
    
    // Balance score (max 20)
    score += Math.min((userData.balance + (userData.totalWithdrawn || 0)) * 2, 20);
    
    // Referral score (max 20)
    score += Math.min((userData.referrals || 0) * 4, 20);
    
    // Channel membership (10)
    if (userData.hasJoinedChannel) score += 10;
    
    // Account activity (max 20)
    if (userData.lastActivityDate) {
        const daysSinceActive = (new Date() - new Date(userData.lastActivityDate)) / (1000 * 60 * 60 * 24);
        if (daysSinceActive < 1) score += 20;
        else if (daysSinceActive < 7) score += 15;
        else if (daysSinceActive < 30) score += 10;
        else score += 5;
    }
    
    return Math.round(score);
}

// Add this function to edit user join date
function editJoinDate(username) {
    const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
    const currentDate = new Date(userData.joinDate || new Date());
    const newDate = prompt('Enter new join date (YYYY-MM-DD):', currentDate.toISOString().split('T')[0]);
    
    if (newDate && !isNaN(new Date(newDate))) {
        userData.joinDate = new Date(newDate).toISOString();
        userData.history.push(`Join date edited by admin to ${formatDate(new Date(newDate))} at ${formatDate(new Date())}`);
        localStorage.setItem(`userData_${username}`, JSON.stringify(userData));
        
        viewUserDetails(username);
        showAdminToast('Join date updated successfully', 'success');
    } else {
        showAdminToast('Invalid date format', 'error');
    }
}

// Update last activity date
function updateLastActivity(username) {
    const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
    userData.lastActivityDate = new Date().toISOString();
    userData.history.push(`Last activity updated by admin at ${formatDate(new Date())}`);
    localStorage.setItem(`userData_${username}`, JSON.stringify(userData));
    
    viewUserDetails(username);
    showAdminToast('Last activity updated', 'success');
}

// Edit channel join date
function editChannelJoinDate(username) {
    const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
    const currentDate = new Date(userData.channelJoinDate || new Date());
    const newDate = prompt('Enter new channel join date (YYYY-MM-DD):', 
        currentDate.toISOString().split('T')[0]);
    
    if (newDate && !isNaN(new Date(newDate))) {
        userData.channelJoinDate = new Date(newDate).toISOString();
        userData.hasJoinedChannel = true;
        userData.history.push(`Channel join date edited by admin to ${formatDate(new Date(newDate))}`);
        localStorage.setItem(`userData_${username}`, JSON.stringify(userData));
        
        viewUserDetails(username);
        showAdminToast('Channel join date updated', 'success');
    } else {
        showAdminToast('Invalid date format', 'error');
    }
}

// Toggle account status
function toggleAccountStatus(username) {
    const userData = JSON.parse(localStorage.getItem(`userData_${username}`));
    userData.isActive = !userData.isActive;
    userData.history.push(
        `Account ${userData.isActive ? 'activated' : 'deactivated'} by admin at ${formatDate(new Date())}`
    );
    localStorage.setItem(`userData_${username}`, JSON.stringify(userData));
    
    viewUserDetails(username);
    showAdminToast(`Account ${userData.isActive ? 'activated' : 'deactivated'}`, 'success');
}

// Add these styles to admin-styles.css
const styles = `
.toast {
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 10px 20px;
    border-radius: 4px;
    color: white;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: slideIn 0.3s ease;
    z-index: 1000;
}

.toast-success { background-color: #4CAF50; }
.toast-error { background-color: #f44336; }
.toast-info { background-color: #2196F3; }

@keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
}

.btn-sm {
    padding: 2px 6px;
    font-size: 12px;
}

.user-actions {
    display: flex;
    gap: 10px;
    margin-top: 15px;
}

.badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
}

.badge-success { background-color: #4CAF50; color: white; }
.badge-danger { background-color: #f44336; color: white; }
.badge-warning { background-color: #ff9800; color: white; }
`;

// Add styles to document
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

// Add these new functions for editing user details
window.editUserField = function(phoneNumber, field, currentValue) {
    let newValue = prompt(`Enter new value for ${field}:`, currentValue);
    
    if (newValue !== null) {
        const userRef = dbRef(db, `users/${phoneNumber}`);
        
        // Convert to number for numeric fields
        if (['balance', 'adsWatched', 'totalEarned'].includes(field)) {
            newValue = parseFloat(newValue) || 0;
        }
        
        // Update the field
        const update = {};
        update[field] = newValue;
        
        dbUpdate(userRef, update).then(() => {
            // Refresh the modal
            viewUserDetails(phoneNumber);
        });
    }
};

window.toggleChannelJoin = function(phoneNumber, status) {
    const userRef = dbRef(db, `users/${phoneNumber}`);
    dbUpdate(userRef, {
        hasJoinedChannel: status,
        channelJoinDate: status ? Date.now() : null
    }).then(() => {
        // Refresh the modal
        viewUserDetails(phoneNumber);
    });
}; 