const API_URL = 'https://script.google.com/macros/s/AKfycbxHJdJ9nO2528QZi2hJmKdc0AkzIZS86I7gZE_p33FxWMDMqmYU0KTaMlNCMN_S7tfJrg/exec';

let currentUser = null; 
let villagersData = [];
let locationTracker = null; 
window.adminMarkers = []; 

let pieChartInstance = null;
let lineChartInstance = null;
let mapInstance = null;
let cachedAdminData = null;
let specificWardPieInstance = null;

const wardSelect = document.getElementById('ward-select');
for (let i = 1; i <= 18; i++) {
    let option = document.createElement('option');
    option.value = i;
    option.text = `Ward ${i} Database`;
    wardSelect.appendChild(option);
}

async function handleLogin(event) {
    event.preventDefault(); 
    
    const username = document.getElementById('login-username').value;
    const pin = document.getElementById('login-pass').value;
    const loginBtn = event.target.querySelector('button[type="submit"]');
    
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verifying...';
    loginBtn.disabled = true;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'verify_login', username: username, pin: pin }),
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            document.getElementById('login-pass').value = ''; 
            login(username, result.role);
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert("Network error. Please check your connection.");
    } finally {
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
    }
}

function login(username, role) {
    currentUser = username;
    document.getElementById('login-view').classList.add('hidden');
    
    if (role === 'Admin') {
        document.getElementById('admin-view').classList.remove('hidden');
        loadAdminDashboard();
    } else {
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('user-role-display').innerText = username;
        document.getElementById('villager-list').innerHTML = `
            <div class="text-center py-10">
                <i class="fa-solid fa-cloud-arrow-down text-red-200 text-5xl mb-3"></i>
                <p class="text-red-500 font-medium">Select a ward and tap the refresh icon to load data.</p>
            </div>
        `; 
        
        startLocationTracking(username);
    }
}

function logout() {
    currentUser = null;
    villagersData = [];
    if (locationTracker) clearInterval(locationTracker); 
    
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('search-input').value = '';
}

function startLocationTracking(username) {
    if (navigator.geolocation) {
        sendLocationToDB(username);
        locationTracker = setInterval(() => {
            sendLocationToDB(username);
        }, 180000); // 3 minutes
    }
}

function sendLocationToDB(username) {
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
            await fetch(API_URL, {
                method: 'POST',
                body: JSON.stringify({ 
                    action: 'update_location', 
                    username: username, 
                    lat: position.coords.latitude, 
                    lng: position.coords.longitude 
                })
            });
        } catch (e) {
            console.error("Location ping failed.");
        }
    }, (error) => {
        console.warn("GPS access denied.");
    }, { enableHighAccuracy: true });
}

// ----- TEAM LOGIC -----
async function fetchVillagers() {
    const wardNumber = wardSelect.value;
    const listContainer = document.getElementById('villager-list');
    const loader = document.getElementById('loading-indicator');
    
    listContainer.innerHTML = '';
    loader.classList.remove('hidden');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'get_villagers', wardNumber: wardNumber }),
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            villagersData = result.data;
            renderVillagers();
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert("Network error.");
    } finally {
        loader.classList.add('hidden');
    }
}

function renderVillagers() {
    const listContainer = document.getElementById('villager-list');
    const searchQuery = document.getElementById('search-input').value.toLowerCase();
    
    listContainer.innerHTML = '';
    const filteredData = villagersData.filter(v => 
        v.voterName.toLowerCase().includes(searchQuery) || v.voterId.toLowerCase().includes(searchQuery)
    );

    if (filteredData.length === 0) {
        listContainer.innerHTML = `<div class="text-center py-10"><p class="text-red-500 font-medium">No records found.</p></div>`;
        return;
    }

    filteredData.forEach(v => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-[1.25rem] p-4 shadow-sm border border-red-100 flex flex-col relative overflow-hidden";
        const accentLine = `<div class="absolute left-0 top-0 bottom-0 w-1.5 ${v.status === 'Pending' ? 'bg-yellow-400' : 'bg-red-600'}"></div>`;
        
        let actionArea = '';
        if (v.status === 'Pending') {
            actionArea = `<button onclick="markAsGiven('${v.voterId}')" id="btn-${v.voterId}" class="w-full mt-3 bg-yellow-400 text-red-900 border border-yellow-500 py-3 rounded-xl font-bold shadow-sm hover:bg-yellow-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2"><i class="fa-solid fa-check-double text-red-700"></i> Mark as Paid</button>`;
        } else if (v.status === 'Processing...') {
            actionArea = `<div class="w-full mt-3 bg-orange-50 text-orange-600 py-3 rounded-xl font-bold flex items-center justify-center gap-2 border border-orange-100"><i class="fa-solid fa-circle-notch fa-spin"></i> Updating...</div>`;
        } else {
            actionArea = `<div class="w-full mt-3 bg-red-50 border border-red-200 text-red-800 py-3 rounded-xl font-bold flex items-center justify-center gap-2"><i class="fa-solid fa-circle-check text-red-600"></i> Paid by ${v.givenBy}</div>`;
        }

        card.innerHTML = `
            ${accentLine}
            <div class="pl-2">
                <div class="flex justify-between items-start mb-1">
                    <h3 class="font-extrabold text-red-950 text-lg leading-tight pr-2">${v.voterName}</h3>
                    <span class="shrink-0 bg-red-50 border border-red-100 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider whitespace-nowrap"><i class="fa-solid fa-house text-red-400 mr-1"></i>${v.houseNumber}</span>
                </div>
                <div class="flex items-center gap-4 text-sm font-medium text-red-800 mb-3">
                    <span class="bg-red-50 px-2 py-0.5 rounded border border-red-100"><i class="fa-regular fa-id-card text-red-400 mr-1.5"></i>${v.voterId}</span>
                </div>
                <div class="border-t border-red-100 pt-3">
                    <p class="text-sm text-red-800 font-medium"><span class="text-red-500 text-xs uppercase tracking-wider mr-1">Relative:</span> ${v.relativeName}</p>
                </div>
                ${actionArea}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

async function markAsGiven(voterId) {
    const btn = document.getElementById(`btn-${voterId}`);
    if (btn) btn.disabled = true;

    const targetIndex = villagersData.findIndex(v => v.voterId === voterId);
    if (targetIndex > -1) {
        villagersData[targetIndex].status = 'Processing...';
        renderVillagers();
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'mark_given', voterId: voterId, teamName: currentUser }),
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            if (targetIndex > -1) {
                villagersData[targetIndex].status = 'Given';
                villagersData[targetIndex].givenBy = currentUser;
            }
        } else {
            alert(result.message);
            if (targetIndex > -1) villagersData[targetIndex].status = 'Pending';
        }
    } catch (error) {
        alert("Update failed. Please try again.");
        if (targetIndex > -1) villagersData[targetIndex].status = 'Pending';
    }
    renderVillagers();
}

// ----- ADMIN LOGIC -----
async function loadAdminDashboard() {
    document.getElementById('admin-content').classList.add('hidden');
    document.getElementById('admin-loading').classList.remove('hidden');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'get_admin_stats' }),
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            cachedAdminData = result.data;
            populateAdminWardDropdown();
            renderAdminCharts();
            renderSpecificWardChart(); 
        }
    } catch (error) {
        alert("Failed to load Admin Stats.");
    } finally {
        document.getElementById('admin-loading').classList.add('hidden');
        document.getElementById('admin-content').classList.remove('hidden');
        
        if(mapInstance) {
            setTimeout(() => { mapInstance.invalidateSize(); }, 100);
        }
    }
}

function switchAdminTab(tab) {
    const btnTeams = document.getElementById('tab-btn-teams');
    const btnWards = document.getElementById('tab-btn-wards');
    const contentTeams = document.getElementById('tab-content-teams');
    const contentWards = document.getElementById('tab-content-wards');

    btnTeams.className = "flex-1 py-3 text-sm font-bold rounded-xl bg-transparent text-red-800 hover:bg-red-50 transition-all flex items-center justify-center gap-2";
    btnWards.className = "flex-1 py-3 text-sm font-bold rounded-xl bg-transparent text-red-800 hover:bg-red-50 transition-all flex items-center justify-center gap-2";
    contentTeams.classList.add('hidden');
    contentWards.classList.add('hidden');

    if (tab === 'teams') {
        btnTeams.className = "flex-1 py-3 text-sm font-bold rounded-xl bg-red-800 text-yellow-400 shadow-sm transition-all flex items-center justify-center gap-2";
        contentTeams.classList.remove('hidden');
        if(mapInstance) setTimeout(() => { mapInstance.invalidateSize(); }, 50);
    } else {
        btnWards.className = "flex-1 py-3 text-sm font-bold rounded-xl bg-red-800 text-yellow-400 shadow-sm transition-all flex items-center justify-center gap-2";
        contentWards.classList.remove('hidden');
    }
}

function populateAdminWardDropdown() {
    const select = document.getElementById('admin-ward-select');
    select.innerHTML = '';
    for (let i = 1; i <= 18; i++) {
        let opt = document.createElement('option');
        opt.value = i;
        opt.text = `Ward ${i}`;
        select.appendChild(opt);
    }
}

function renderSpecificWardChart() {
    if (!cachedAdminData) return;
    
    const selectedWard = document.getElementById('admin-ward-select').value;
    const wardData = cachedAdminData.wardStats[selectedWard];
    
    const wardTotal = wardData ? wardData.total : 0;
    const wardPaid = wardData ? wardData.given : 0;
    const wardPending = wardTotal - wardPaid;

    document.getElementById('aw-total').innerText = wardTotal;
    document.getElementById('aw-paid').innerText = wardPaid;
    document.getElementById('aw-pending').innerText = wardPending;

    if (specificWardPieInstance) specificWardPieInstance.destroy();
    
    if (wardTotal === 0) return;

    const ctx = document.getElementById('specificWardPie').getContext('2d');
    specificWardPieInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Paid', 'Pending'],
            datasets: [{
                data: [wardPaid, wardPending],
                backgroundColor: ['#10b981', '#ef4444'],
                borderWidth: 0
            }]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } } 
        }
    });
}

function renderAdminCharts() {
    const data = cachedAdminData;

    document.getElementById('stat-total').innerText = data.total;
    document.getElementById('stat-paid').innerText = data.given;
    document.getElementById('stat-pending').innerText = data.total - data.given;

    if (pieChartInstance) pieChartInstance.destroy();
    const pieCtx = document.getElementById('teamPieChart').getContext('2d');
    
    const teamLabels = Object.keys(data.teamStats);
    const teamValues = Object.values(data.teamStats);
    const colorPalette = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4'];
    const teamColors = teamLabels.map((_, index) => colorPalette[index % colorPalette.length]);

    pieChartInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: teamLabels.length > 0 ? teamLabels : ['No Data'],
            datasets: [{
                data: teamValues.length > 0 ? teamValues : [1],
                backgroundColor: teamValues.length > 0 ? teamColors : ['#e2e8f0'],
                borderWidth: 0
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    const wardLabels = [];
    const wardPaid = [];
    const wardTotal = [];
    for (let i = 1; i <= 18; i++) {
        wardLabels.push(`W${i}`);
        wardPaid.push(data.wardStats[i] ? data.wardStats[i].given : 0);
        wardTotal.push(data.wardStats[i] ? data.wardStats[i].total : 0);
    }

    if (lineChartInstance) lineChartInstance.destroy();
    const lineCtx = document.getElementById('wardLineChart').getContext('2d');
    lineChartInstance = new Chart(lineCtx, {
        type: 'line',
        data: {
            labels: wardLabels,
            datasets: [
                { label: 'Total Target', data: wardTotal, borderColor: '#94a3b8', backgroundColor: '#94a3b8', borderDash: [5, 5], tension: 0.3 },
                { label: 'Paid Progress', data: wardPaid, borderColor: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.2)', fill: true, tension: 0.3 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: { y: { beginAtZero: true } }
        }
    });

if (!mapInstance) {
        mapInstance = L.map('admin-map', { zoomControl: false }).setView([17.0392, 81.8028], 14);
        
        // Switched to the standard, free OpenStreetMap tile server
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(mapInstance);
    }

    if (window.adminMarkers) {
        window.adminMarkers.forEach(m => mapInstance.removeLayer(m));
    }
    window.adminMarkers = [];

    if (data.locations && data.locations.length > 0) {
        data.locations.forEach(loc => {
            if (loc.lat && loc.lng) {
                const marker = L.marker([loc.lat, loc.lng]).addTo(mapInstance)
                    .bindPopup(`<b>${loc.username}</b><br><span style="font-size:10px;color:#666;">Last sync: ${loc.time}</span>`);
                window.adminMarkers.push(marker);
            }
        });
    }
}