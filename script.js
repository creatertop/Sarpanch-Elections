const API_URL = 'https://script.google.com/macros/s/AKfycbwlAh4ouv2zS8paA_iY5v_uYPD-Gn-zPCcRgBb-dAgX5Mt9QjdVpoHeR0_o-eTfpXQsPA/exec'; 

let currentUser = null; let currentUserRole = null;
let villagersData = []; let locationTracker = null; 
window.adminMarkers = []; 

let pieChartInstance = null; let lineChartInstance = null;
let mapInstance = null; let cachedAdminData = null; let specificWardPieInstance = null;

function getSearchControlsHTML() {
    let options = '';
    for (let i = 1; i <= 18; i++) options += `<option value="${i}">Ward ${i} Database</option>`;
    return `
        <div class="flex gap-2 mb-3">
            <div class="relative flex-1">
                <i class="fa-solid fa-map text-red-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
                <select id="ward-select-input" class="w-full pl-9 pr-4 py-3 rounded-xl bg-white border border-red-200 font-bold text-red-900 appearance-none shadow-sm focus:ring-2 focus:ring-yellow-400 outline-none">${options}</select>
                <i class="fa-solid fa-chevron-down text-red-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-sm"></i>
            </div>
            <button onclick="fetchVillagers()" class="bg-red-700 text-yellow-400 px-6 py-3 rounded-xl font-bold shadow-md active:scale-95 active:bg-red-800 transition flex items-center justify-center"><i class="fa-solid fa-rotate-right"></i></button>
        </div>
        <div class="relative">
            <i class="fa-solid fa-magnifying-glass text-red-400 absolute left-3 top-1/2 -translate-y-1/2"></i>
            <input type="text" id="search-input" placeholder="Search by name, ID, house, GP num..." class="w-full pl-10 pr-4 py-3 rounded-xl bg-white border border-red-200 font-medium text-red-900 shadow-sm focus:ring-2 focus:ring-yellow-400 outline-none transition-all placeholder:text-red-300" onkeyup="renderVillagers()">
        </div>
    `;
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
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'verify_login', username: username, pin: pin }) });
        const result = await response.json();
        if (result.status === 'success') {
            document.getElementById('login-pass').value = ''; 
            login(username, result.role);
        } else alert(result.message);
    } catch (error) {
        alert("Network error.");
    } finally {
        loginBtn.innerHTML = originalText; loginBtn.disabled = false;
    }
}

function login(username, role) {
    currentUser = username; currentUserRole = role;
    document.getElementById('login-view').classList.add('hidden');
    if (role === 'Admin') {
        document.getElementById('admin-view').classList.remove('hidden');
        document.getElementById('admin-role-display').innerText = username + " (Admin)";
        document.getElementById('admin-dist-controls').innerHTML = getSearchControlsHTML();
        loadAdminDashboard();
    } else {
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('user-role-display').innerText = username;
        document.getElementById('dist-controls').innerHTML = getSearchControlsHTML();
        document.getElementById('villager-list').innerHTML = `<div class="text-center py-10"><i class="fa-solid fa-cloud-arrow-down text-red-200 text-5xl mb-3"></i><p class="text-red-500 font-medium">Select a ward and tap refresh.</p></div>`; 
        startLocationTracking(username);
    }
}

function logout() {
    currentUser = null; currentUserRole = null; villagersData = [];
    if (locationTracker) clearInterval(locationTracker); 
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('admin-view').classList.add('hidden');
    document.getElementById('login-view').classList.remove('hidden');
}

function startLocationTracking(username) {
    if (navigator.geolocation) {
        sendLocationToDB(username);
        locationTracker = setInterval(() => { sendLocationToDB(username); }, 180000); 
    }
}

function sendLocationToDB(username) {
    navigator.geolocation.getCurrentPosition(async (position) => {
        try { await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'update_location', username: username, lat: position.coords.latitude, lng: position.coords.longitude }) }); } catch (e) {}
    }, () => {}, { enableHighAccuracy: true });
}

function getStatusClasses(status, type) {
    if (type === 'visit') return status === 'Visited' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300';
    if (type === 'avail') {
        if (status === 'Available') return 'bg-green-100 text-green-700 border-green-300';
        if (status === 'Out of Town') return 'bg-slate-100 text-slate-700 border-slate-300';
        return 'bg-red-100 text-red-700 border-red-300';
    }
    if (type === 'verify') return status === 'Verified' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300';
}

function uiToggleVisit(id) {
    const el = document.getElementById(`visit-${id}`);
    const current = el.innerText.trim();
    const next = current === 'Unvisited' ? 'Visited' : 'Unvisited';
    el.innerHTML = `<i class="fa-solid fa-person-walking-arrow-right"></i> ${next}`;
    el.className = `px-2 py-2 rounded-lg font-bold text-xs shadow-sm transition-all border ${getStatusClasses(next, 'visit')}`;
}

function uiChangeAvail(id) {
    const el = document.getElementById(`avail-${id}`);
    el.className = `px-2 py-2 rounded-lg font-bold text-xs shadow-sm outline-none border ${getStatusClasses(el.value, 'avail')}`;
}

function uiToggleVerify(id) {
    const el = document.getElementById(`verify-${id}`);
    const current = el.innerText.trim();
    const next = current === 'Not Verified' ? 'Verified' : 'Not Verified';
    el.innerHTML = `<i class="fa-solid fa-shield-check"></i> ${next}`;
    el.className = `px-2 py-2 rounded-lg font-bold text-xs shadow-sm transition-all border ${getStatusClasses(next, 'verify')}`;
}

async function fetchVillagers() {
    const wardNumber = document.getElementById('ward-select-input').value;
    const listContainer = currentUserRole === 'Admin' ? document.getElementById('admin-villager-list') : document.getElementById('villager-list');
    listContainer.innerHTML = '<div class="text-center py-10"><i class="fa-solid fa-circle-notch fa-spin text-4xl text-red-600 mb-4"></i><p class="text-red-700 font-medium">Syncing database...</p></div>';

    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'get_villagers', wardNumber: wardNumber }) });
        const result = await response.json();
        if (result.status === 'success') { villagersData = result.data; renderVillagers(); } 
        else { alert(result.message); listContainer.innerHTML = ''; }
    } catch (error) { alert("Network error."); listContainer.innerHTML = ''; }
}

function renderVillagers() {
    const listContainer = currentUserRole === 'Admin' ? document.getElementById('admin-villager-list') : document.getElementById('villager-list');
    const searchQuery = document.getElementById('search-input').value.toLowerCase();
    const isAdmin = currentUserRole === 'Admin';
    listContainer.innerHTML = '';
    
    // Updated search logic applying to all parameters
    const filteredData = villagersData.filter(v => 
        (v.voterName && v.voterName.toLowerCase().includes(searchQuery)) || 
        (v.voterId && v.voterId.toLowerCase().includes(searchQuery)) ||
        (v.houseNumber && v.houseNumber.toString().toLowerCase().includes(searchQuery)) ||
        (v.gpNumber && v.gpNumber.toString().toLowerCase().includes(searchQuery)) ||
        (v.age && v.age.toString().includes(searchQuery)) ||
        (v.gender && v.gender.toLowerCase().includes(searchQuery)) ||
        (v.relativeName && v.relativeName.toLowerCase().includes(searchQuery)) ||
        (v.phone && v.phone.toString().includes(searchQuery))
    );

    if (filteredData.length === 0) { listContainer.innerHTML = `<div class="text-center py-10"><p class="text-red-500 font-medium">No records found.</p></div>`; return; }

    filteredData.forEach(v => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-[1.25rem] p-4 shadow-sm border border-red-100 flex flex-col relative overflow-hidden";
        const accentLine = `<div class="absolute left-0 top-0 bottom-0 w-1.5 ${v.verification === 'Verified' ? 'bg-green-500' : 'bg-red-500'}"></div>`;
        
        const lockAvail = (!isAdmin && v.availability !== 'Unavailable' && v.availability !== '') ? 'disabled' : '';
        const lockVerify = (!isAdmin && v.verification === 'Verified') ? 'disabled' : '';
        const lockPhone = (!isAdmin && v.phone && v.phone.trim() !== '') ? 'readonly' : '';
        const blurAvail = lockAvail ? 'opacity-70' : '';
        const blurVerify = lockVerify ? 'opacity-70 cursor-not-allowed' : '';
        
        card.innerHTML = `
            ${accentLine}
            <div class="pl-2">
                <div class="flex justify-between items-start mb-1">
                    <h3 class="font-extrabold text-red-950 text-lg leading-tight pr-2">${v.voterName}</h3>
                    <span class="shrink-0 bg-red-50 border border-red-100 text-red-700 text-[10px] font-bold px-2.5 py-1 rounded-md uppercase tracking-wider whitespace-nowrap"><i class="fa-solid fa-house text-red-400 mr-1"></i>${v.houseNumber}</span>
                </div>
                <div class="flex items-center gap-4 text-sm font-medium text-red-800 mb-2">
                    <span class="bg-red-50 px-2 py-0.5 rounded border border-red-100"><i class="fa-regular fa-id-card text-red-400 mr-1.5"></i>${v.voterId}</span>
                </div>
                <div class="border-t border-red-100 pt-2 pb-1">
                    <p class="text-sm text-red-800 font-medium"><span class="text-red-500 text-xs uppercase tracking-wider mr-1">Relative:</span> ${v.relativeName} <span class="ml-2 text-red-500 text-[10px] uppercase">(${v.age} / ${v.gender})</span></p>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <button id="visit-${v.voterId}" onclick="uiToggleVisit('${v.voterId}')" class="${getStatusClasses(v.visitStatus, 'visit')} px-2 py-2 rounded-lg font-bold text-xs shadow-sm transition-all border">
                        <i class="fa-solid fa-person-walking-arrow-right"></i> ${v.visitStatus}
                    </button>
                    <select id="avail-${v.voterId}" onchange="uiChangeAvail('${v.voterId}')" class="${getStatusClasses(v.availability, 'avail')} ${blurAvail} px-2 py-2 rounded-lg font-bold text-xs shadow-sm outline-none border" ${lockAvail}>
                        <option value="Unavailable" ${v.availability === 'Unavailable' ? 'selected' : ''}>Unavailable</option>
                        <option value="Available" ${v.availability === 'Available' ? 'selected' : ''}>Available</option>
                        <option value="Out of Town" ${v.availability === 'Out of Town' ? 'selected' : ''}>Out of Town</option>
                    </select>
                    <button id="verify-${v.voterId}" ${lockVerify ? '' : `onclick="uiToggleVerify('${v.voterId}')"`} class="${getStatusClasses(v.verification, 'verify')} ${blurVerify} px-2 py-2 rounded-lg font-bold text-xs shadow-sm transition-all border" ${lockVerify}>
                        <i class="fa-solid fa-shield-check"></i> ${v.verification}
                    </button>
                </div>

                <div class="mt-3 flex gap-2">
                    <div class="relative flex-1">
                        <i class="fa-solid fa-phone absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
                        <input type="tel" id="phone-${v.voterId}" value="${v.phone}" placeholder="Add Phone Number" class="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-yellow-400" ${lockPhone}>
                    </div>
                    <button onclick="submitVoter('${v.voterId}')" id="submit-btn-${v.voterId}" class="bg-red-800 text-yellow-400 px-4 py-2 rounded-lg font-bold shadow-sm active:bg-red-700 text-sm whitespace-nowrap transition">Submit</button>
                </div>
                ${v.updatedBy ? `<p class="text-[10px] text-slate-400 mt-2 text-right">Last updated by ${v.updatedBy}</p>` : ''}
            </div>
        `;
        listContainer.appendChild(card);
    });
}

async function submitVoter(voterId) {
    const btn = document.getElementById(`submit-btn-${voterId}`);
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>'; btn.disabled = true;

    const visit = document.getElementById(`visit-${voterId}`).innerText.trim();
    const avail = document.getElementById(`avail-${voterId}`).value;
    const verify = document.getElementById(`verify-${voterId}`).innerText.trim();
    const phone = document.getElementById(`phone-${voterId}`).value.trim();

    try {
        const response = await fetch(API_URL, {
            method: 'POST', body: JSON.stringify({ action: 'update_voter', voterId: voterId, visit: visit, avail: avail, verify: verify, phone: phone, teamName: currentUser, role: currentUserRole })
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            const targetIndex = villagersData.findIndex(v => v.voterId === voterId);
            if (targetIndex > -1) {
                villagersData[targetIndex].visitStatus = visit; villagersData[targetIndex].availability = avail;
                villagersData[targetIndex].verification = verify; villagersData[targetIndex].phone = phone;
                villagersData[targetIndex].updatedBy = currentUser;
            }
            renderVillagers();
        } else { alert(result.message); btn.innerHTML = originalHtml; btn.disabled = false; }
    } catch (error) { alert("Failed to save. Please try again."); btn.innerHTML = originalHtml; btn.disabled = false; }
}

async function loadAdminDashboard() {
    document.getElementById('admin-content').classList.add('hidden');
    document.getElementById('admin-loading').classList.remove('hidden');

    try {
        const response = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action: 'get_admin_stats' }) });
        const result = await response.json();
        if (result.status === 'success') {
            cachedAdminData = result.data;
            populateAdminWardDropdown(); renderAdminCharts(); renderSpecificWardChart(); 
        }
    } catch (error) { alert("Failed to load Admin Stats."); } 
    finally {
        document.getElementById('admin-loading').classList.add('hidden');
        document.getElementById('admin-content').classList.remove('hidden');
        if(mapInstance) setTimeout(() => { mapInstance.invalidateSize(); }, 100);
    }
}

function switchAdminTab(tab) {
    const btnTeams = document.getElementById('tab-btn-teams');
    const btnWards = document.getElementById('tab-btn-wards');
    const btnDist = document.getElementById('tab-btn-distribute');
    const contentTeams = document.getElementById('tab-content-teams');
    const contentWards = document.getElementById('tab-content-wards');
    const contentDist = document.getElementById('tab-content-distribute');
    const globalKpis = document.getElementById('global-kpis');

    [btnTeams, btnWards, btnDist].forEach(b => b.className = "flex-1 py-3 text-sm font-bold rounded-xl bg-transparent text-red-800 hover:bg-red-50 transition-all flex items-center justify-center gap-2 min-w-[30%]");
    [contentTeams, contentWards, contentDist].forEach(c => c.classList.add('hidden'));

    if (tab === 'teams') {
        btnTeams.className = "flex-1 py-3 text-sm font-bold rounded-xl bg-red-800 text-yellow-400 shadow-sm transition-all flex items-center justify-center gap-2 min-w-[30%]";
        contentTeams.classList.remove('hidden'); globalKpis.classList.remove('hidden');
        if(mapInstance) setTimeout(() => { mapInstance.invalidateSize(); }, 50);
    } else if (tab === 'wards') {
        btnWards.className = "flex-1 py-3 text-sm font-bold rounded-xl bg-red-800 text-yellow-400 shadow-sm transition-all flex items-center justify-center gap-2 min-w-[30%]";
        contentWards.classList.remove('hidden'); globalKpis.classList.remove('hidden');
    } else {
        btnDist.className = "flex-1 py-3 text-sm font-bold rounded-xl bg-red-800 text-yellow-400 shadow-sm transition-all flex items-center justify-center gap-2 min-w-[30%]";
        contentDist.classList.remove('hidden'); globalKpis.classList.add('hidden'); 
    }
}

function populateAdminWardDropdown() {
    const select = document.getElementById('admin-ward-select'); select.innerHTML = '';
    for (let i = 1; i <= 18; i++) { let opt = document.createElement('option'); opt.value = i; opt.text = `Ward ${i}`; select.appendChild(opt); }
}

function renderSpecificWardChart() {
    if (!cachedAdminData) return;
    const selectedWard = document.getElementById('admin-ward-select').value;
    const wardData = cachedAdminData.wardStats[selectedWard];
    const wardTotal = wardData ? wardData.total : 0; const wardPaid = wardData ? wardData.verified : 0; const wardPending = wardTotal - wardPaid;

    document.getElementById('aw-total').innerText = wardTotal; document.getElementById('aw-paid').innerText = wardPaid; document.getElementById('aw-pending').innerText = wardPending;
    if (specificWardPieInstance) specificWardPieInstance.destroy();
    if (wardTotal === 0) return;

    const ctx = document.getElementById('specificWardPie').getContext('2d');
    specificWardPieInstance = new Chart(ctx, {
        type: 'pie',
        data: { labels: ['Verified', 'Pending'], datasets: [{ data: [wardPaid, wardPending], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderAdminCharts() {
    const data = cachedAdminData;
    document.getElementById('stat-total').innerText = data.total; document.getElementById('stat-paid').innerText = data.given; document.getElementById('stat-pending').innerText = data.total - data.given;

    if (pieChartInstance) pieChartInstance.destroy();
    const pieCtx = document.getElementById('teamPieChart').getContext('2d');
    const teamLabels = Object.keys(data.teamStats); const teamValues = Object.values(data.teamStats);
    const colorPalette = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#06b6d4'];
    const teamColors = teamLabels.map((_, i) => colorPalette[i % colorPalette.length]);

    pieChartInstance = new Chart(pieCtx, {
        type: 'doughnut',
        data: { labels: teamLabels.length > 0 ? teamLabels : ['No Data'], datasets: [{ data: teamValues.length > 0 ? teamValues : [1], backgroundColor: teamValues.length > 0 ? teamColors : ['#e2e8f0'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    const wardLabels = []; const wardPaid = []; const wardTotal = [];
    for (let i = 1; i <= 18; i++) {
        wardLabels.push(`W${i}`); wardPaid.push(data.wardStats[i] ? data.wardStats[i].verified : 0); wardTotal.push(data.wardStats[i] ? data.wardStats[i].total : 0);
    }

    if (lineChartInstance) lineChartInstance.destroy();
    const lineCtx = document.getElementById('wardLineChart').getContext('2d');
    lineChartInstance = new Chart(lineCtx, {
        type: 'line',
        data: { labels: wardLabels, datasets: [
            { label: 'Total Target', data: wardTotal, borderColor: '#94a3b8', backgroundColor: '#94a3b8', borderDash: [5, 5], tension: 0.3 },
            { label: 'Verified Progress', data: wardPaid, borderColor: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.2)', fill: true, tension: 0.3 }
        ] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { beginAtZero: true } } }
    });

    if (!mapInstance) {
        mapInstance = L.map('admin-map', { zoomControl: false }).setView([17.0392, 81.8028], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors', maxZoom: 19 }).addTo(mapInstance);
    }
    if (window.adminMarkers) window.adminMarkers.forEach(m => mapInstance.removeLayer(m));
    window.adminMarkers = [];

    if (data.locations && data.locations.length > 0) {
        data.locations.forEach(loc => {
            if (loc.lat && loc.lng) {
                const marker = L.marker([loc.lat, loc.lng]).addTo(mapInstance).bindPopup(`<b>${loc.username}</b><br><span style="font-size:10px;color:#666;">Last sync: ${loc.time}</span>`);
                window.adminMarkers.push(marker);
            }
        });
    }
}
