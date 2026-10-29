/* =====================================================
   Pro Event Gallery - Management Logic
   ===================================================== */

let currentUser = null;
let currentHall = null;
let activeEvent = null;
let timerInterval = null;
let uploadedCount = 0;

// DOM Elements
const views = {
    auth: document.getElementById('authView'),
    dashboard: document.getElementById('dashboardView')
};

const dashboard = {
    hallName: document.getElementById('currentHallName'),
    statusDot: document.getElementById('activeStatus'),
    statusText: document.getElementById('activeStatusText'),
    currentUserEmail: document.getElementById('currentUserEmail'),
    noHallCard: document.getElementById('noHallCard'),
    hallContainer: document.getElementById('hallDashboardContainer'),
    userUid: document.getElementById('userUidDisplay'),
    copyUidBtn: document.getElementById('copyUidBtn'),
    createHallForm: document.getElementById('createHallForm'),
    newHallName: document.getElementById('newHallNameInput'),
    newHallSlug: document.getElementById('newHallSlugInput'),
    createHallBtn: document.getElementById('createHallBtn'),
    createHallError: document.getElementById('createHallError'),
    timer: document.getElementById('currentEventTimer'),
    eventLoadingCard: document.getElementById('eventLoadingCard'),
    noEventCard: document.getElementById('noEventCard'),
    activeEventCard: document.getElementById('activeEventCard'),
    activeTitle: document.getElementById('activeEventTitle'),
    loginForm: document.getElementById('loginForm'),
    startForm: document.getElementById('startEventForm'),
    logoutBtn: document.getElementById('logoutBtn'),
    endBtn: document.getElementById('endEventBtn'),
    purgeBtn: document.getElementById('purgeBtn'),
    reindexBtn: document.getElementById('reindexBtn'),
    copyBtn: document.getElementById('copyLinkBtn'),
    liveBtn: document.getElementById('viewLiveBtn'),
    guestLinkDisplay: document.getElementById('guestLinkDisplay'),
    uploadSection: document.getElementById('uploadSection'),
    activeUploadContainer: document.getElementById('activeUploadContainer'),
    inactiveUploadNotice: document.getElementById('inactiveUploadNotice'),
    dropZone: document.getElementById('dropZone'),
    photoInput: document.getElementById('photoInput'),
    uploadProgress: document.getElementById('uploadProgress'),
    uploadProgressBar: document.getElementById('uploadProgressBar'),
    uploadProgressText: document.getElementById('uploadProgressText'),
    uploadCount: document.getElementById('uploadCount'),
    logoSection: document.getElementById('logoSection'),
    logoInput: document.getElementById('logoInput'),
    currentLogo: document.getElementById('currentLogo'),
    noLogo: document.getElementById('noLogo'),
    removeLogoBtn: document.getElementById('removeLogoBtn'),
    logoProgressBar: document.getElementById('logoProgressBar'),
    logoProgress: document.getElementById('logoProgress')
};

// INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    console.log('Dashboard: initializing...');

    if (typeof window.authManager === 'undefined') {
        console.error('Fatal: authManager is missing. auth.js failed to load?');
        return;
    }

    window.authManager.onAuthStateChange(user => {
        if (user) {
            currentUser = user;
            showDashboard(user);
        } else {
            currentUser = null;
            showLogin();
        }
    });

    setupEventListeners();
    setupUploadListeners();
    setupLogoListeners();
    setupHallCreation();
});

function showLogin() {
    views.auth.classList.remove('hidden');
    views.dashboard.classList.add('hidden');
}

async function showDashboard(user) {
    console.log('Dashboard: loading for:', user.email);
    currentUser = user;
    views.auth.classList.add('hidden');
    views.dashboard.classList.remove('hidden');

    if (dashboard.currentUserEmail) {
        dashboard.currentUserEmail.textContent = user.email || '';
    }

    if (dashboard.userUid) {
        dashboard.userUid.textContent = user.id;
    }

    try {
        // 1. Fetch Hall Data for this user
        const { data: halls, error: hallError } = await window.sbClient
            .from('halls')
            .select('*')
            .eq('owner_id', user.id);

        if (hallError) {
            console.error('Database Error:', hallError);
            alert('Database Error: ' + hallError.message);
            showNoHallState();
            return;
        }

        if (!halls || halls.length === 0) {
            console.warn('Hall profile not found for user:', user.id);
            showNoHallState();
            return;
        }

        // Hall found: display dashboard
        currentHall = halls[0];
        showHallState();

        dashboard.hallName.textContent = currentHall.name;

        // Apply Theme
        if (currentHall.theme) {
            applyTheme(currentHall.theme);
        }

        // Apply Logo
        updateLogoUI(currentHall.logo_url);

        // Standardize Live URL building
        const baseUrl = window.location.origin + "/index.html";
        const hallParam = `hall=${currentHall.slug || currentHall.id}`;
        const liveUrl = `${baseUrl}?${hallParam}`;

        console.log('Dashboard: Guest Link Constructed ->', liveUrl);

        if (dashboard.guestLinkDisplay) {
            dashboard.guestLinkDisplay.textContent = liveUrl;
        }

        dashboard.liveBtn.href = liveUrl;
        dashboard.liveBtn.onclick = (e) => {
            e.preventDefault();
            window.open(liveUrl, '_blank');
        };

        dashboard.copyBtn.onclick = (e) => {
            if (e) e.preventDefault();
            copyToClipboard(liveUrl);
            showToast('Guest Link Copied!');
        };

        // Initialize Timing Inputs
        prefillEventTimes();

        // 2. Fetch Active Event
        fetchActiveEvent();
    } catch (e) {
        console.error('Dashboard Load Error:', e);
        showNoHallState();
    }
}

function showNoHallState() {
    if (dashboard.noHallCard) dashboard.noHallCard.classList.remove('hidden');
    if (dashboard.hallContainer) dashboard.hallContainer.classList.add('hidden');
    dashboard.hallName.textContent = 'Setup Required';
    dashboard.statusDot.className = 'w-2 h-2 rounded-full bg-yellow-500';
    dashboard.statusText.textContent = 'No Hall Linked';
    dashboard.statusText.className = 'text-xs font-medium text-yellow-500 uppercase tracking-wider';
}

function showHallState() {
    if (dashboard.noHallCard) dashboard.noHallCard.classList.add('hidden');
    if (dashboard.hallContainer) dashboard.hallContainer.classList.remove('hidden');
}

function setupHallCreation() {
    if (dashboard.copyUidBtn && dashboard.userUid) {
        dashboard.copyUidBtn.onclick = () => {
            copyToClipboard(dashboard.userUid.textContent);
            showToast('User ID Copied!');
        };
    }

    if (dashboard.createHallForm) {
        dashboard.createHallForm.onsubmit = async (e) => {
            e.preventDefault();
            if (!currentUser) return;

            const name = dashboard.newHallName.value.trim();
            let slug = dashboard.newHallSlug.value.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');

            if (!name || !slug) {
                alert('Please provide a hall name and slug.');
                return;
            }

            dashboard.createHallBtn.disabled = true;
            dashboard.createHallBtn.textContent = 'Creating Hall...';
            if (dashboard.createHallError) dashboard.createHallError.classList.add('hidden');

            try {
                const { data: newHall, error } = await window.sbClient
                    .from('halls')
                    .insert({
                        name: name,
                        slug: slug,
                        owner_id: currentUser.id,
                        theme: 'balanced'
                    })
                    .select()
                    .single();

                if (error) throw error;

                showToast(`Hall "${newHall.name}" created!`);
                currentHall = newHall;
                showDashboard(currentUser);
            } catch (err) {
                console.error('Create Hall Error:', err);
                if (dashboard.createHallError) {
                    dashboard.createHallError.textContent = err.message || 'Failed to create hall. Check Supabase RLS policies.';
                    dashboard.createHallError.classList.remove('hidden');
                } else {
                    alert('Error: ' + err.message);
                }
            } finally {
                dashboard.createHallBtn.disabled = false;
                dashboard.createHallBtn.textContent = 'Create Hall & Launch';
            }
        };
    }
}

async function fetchActiveEvent() {
    if (!currentHall || !window.sbClient) return;

    if (dashboard.eventLoadingCard) dashboard.eventLoadingCard.classList.remove('hidden');

    try {
        console.log('Dashboard: Fetching active event for hall:', currentHall.id);
        const { data: events, error } = await window.sbClient
            .from('events')
            .select('*')
            .eq('hall_id', currentHall.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (dashboard.eventLoadingCard) dashboard.eventLoadingCard.classList.add('hidden');

        if (error) {
            console.error('Dashboard: Fetch Active Event Error:', error);
            renderNoEventState();
            return;
        }

        if (events && events.length > 0) {
            activeEvent = events[0];
            console.log('Dashboard: Active event detected:', activeEvent.event_name);

            if (new Date(activeEvent.end_time) < new Date()) {
                console.log('Dashboard: Detected event is expired, deactivating...');
                await deactivateEvent(activeEvent.id);
            } else {
                renderActiveState();
                fetchPhotoCount();
            }
        } else {
            console.log('Dashboard: No active event found.');
            renderNoEventState();
        }
    } catch (e) {
        console.error('Dashboard: fetchActiveEvent exception:', e);
        if (dashboard.eventLoadingCard) dashboard.eventLoadingCard.classList.add('hidden');
        renderNoEventState();
    }
}

async function fetchPhotoCount() {
    if (!currentHall || !window.sbClient) return;
    try {
        const bucket = currentHall.storage_bucket || 'event-photos';
        const { data, error } = await window.sbClient.storage.from(bucket).list(currentHall.id, { limit: 10000 });
        if (!error && data) {
            uploadedCount = data.filter(f => f.name !== '.emptyFolderPlaceholder').length;
            if (dashboard.uploadCount) dashboard.uploadCount.textContent = `${uploadedCount} photos uploaded`;
        }
    } catch (e) {
        console.error('Photo count fetch failed:', e);
    }
}

function renderActiveState() {
    if (dashboard.eventLoadingCard) dashboard.eventLoadingCard.classList.add('hidden');
    dashboard.noEventCard.classList.add('hidden');
    dashboard.activeEventCard.classList.remove('hidden');
    dashboard.activeTitle.textContent = activeEvent.event_name;
    dashboard.statusDot.className = 'w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
    dashboard.statusText.textContent = 'Active Event';
    dashboard.statusText.className = 'text-xs font-medium text-green-500 uppercase tracking-wider';
    dashboard.timer.classList.remove('hidden');
    startTimer();

    // Enable active upload container
    if (dashboard.activeUploadContainer) dashboard.activeUploadContainer.classList.remove('hidden');
    if (dashboard.inactiveUploadNotice) dashboard.inactiveUploadNotice.classList.add('hidden');
}

function renderNoEventState() {
    if (dashboard.eventLoadingCard) dashboard.eventLoadingCard.classList.add('hidden');
    dashboard.noEventCard.classList.remove('hidden');
    dashboard.activeEventCard.classList.add('hidden');
    dashboard.statusDot.className = 'w-2 h-2 rounded-full bg-gray-500';
    dashboard.statusText.textContent = 'No Active Event';
    dashboard.statusText.className = 'text-xs font-medium text-gray-500 uppercase tracking-wider';
    dashboard.timer.classList.add('hidden');
    if (timerInterval) clearInterval(timerInterval);

    // Show inactive upload notice
    if (dashboard.activeUploadContainer) dashboard.activeUploadContainer.classList.add('hidden');
    if (dashboard.inactiveUploadNotice) dashboard.inactiveUploadNotice.classList.remove('hidden');

    prefillEventTimes();
}

function prefillEventTimes() {
    try {
        const now = new Date();
        const end = new Date(now.getTime() + 12 * 3600000);

        const toLocalISO = (date) => {
            const offset = date.getTimezoneOffset() * 60000;
            const local = new Date(date.getTime() - offset);
            return local.toISOString().slice(0, 16);
        };

        const startInput = document.getElementById('startTimeInput');
        const endInput = document.getElementById('endTimeInput');

        if (startInput && !startInput.value) {
            startInput.value = toLocalISO(now);
        }
        if (endInput && !endInput.value) {
            endInput.value = toLocalISO(end);
        }
    } catch (e) {
        console.error('Prefill failed:', e);
    }
}
window.prefillEventTimes = prefillEventTimes;

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    const update = async () => {
        if (!activeEvent) return;
        const end = new Date(activeEvent.end_time);
        const diff = end - new Date();
        if (diff <= 0) {
            clearInterval(timerInterval);
            console.log('Timer: Event expired, deactivating...');
            await deactivateEvent(activeEvent.id);
            return;
        }
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        dashboard.timer.textContent = `Ends in: ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    update();
    timerInterval = setInterval(update, 1000);
}

async function deactivateEvent(eventId) {
    if (!currentHall || !window.sbClient) return;

    try {
        console.log('Dashboard: Deactivating event session for hall:', currentHall.id);

        let query = window.sbClient
            .from('events')
            .update({ is_active: false })
            .eq('hall_id', currentHall.id);

        if (eventId) {
            query = query.eq('id', eventId);
        } else {
            query = query.eq('is_active', true);
        }

        const { error } = await query;
        if (error) throw error;

        activeEvent = null;
        renderNoEventState();
        showToast('Event ended.');
    } catch (e) {
        console.error('Dashboard: deactivateEvent Failed:', e);
        alert('Could not end session. Please refresh.');
        fetchActiveEvent();
    }
}

// Explicit purge function triggered only by button
async function purgeAllPhotos() {
    if (!currentHall || !window.sbClient) return;
    if (!confirm('CRITICAL: Permanently delete ALL photos currently in storage for this hall?')) return;

    try {
        const bucket = currentHall.storage_bucket || 'event-photos';
        console.log(`Purge: Listing files in bucket "${bucket}", hall:`, currentHall.id);
        const { data: files, error } = await window.sbClient.storage.from(bucket).list(currentHall.id, { limit: 10000 });

        if (error) throw error;

        const validFiles = (files || []).filter(f => f.name !== '.emptyFolderPlaceholder');

        if (validFiles.length > 0) {
            const paths = validFiles.map(f => `${currentHall.id}/${f.name}`);
            const { error: delError } = await window.sbClient.storage.from(bucket).remove(paths);
            if (delError) throw delError;

            showToast(`Deleted ${validFiles.length} photos.`);
            uploadedCount = 0;
            if (dashboard.uploadCount) dashboard.uploadCount.textContent = `0 photos uploaded`;
        } else {
            showToast('Storage is already empty.');
        }
    } catch (e) {
        console.error('Purge error:', e);
        alert('Purge failed: ' + e.message);
    }
}

function setupEventListeners() {
    // Login
    if (dashboard.loginForm) {
        dashboard.loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            const remember = document.getElementById('rememberMe')?.checked ?? true;
            const errorEl = document.getElementById('authError');

            try {
                const data = await window.authManager.login(email, pass, remember);
                if (data.user) showDashboard(data.user);
            } catch (err) {
                console.error('Login Error:', err);
                if (errorEl) {
                    errorEl.textContent = err.message || 'Login failed.';
                    errorEl.classList.remove('hidden');
                }
            }
        };
    }

    // Logout
    if (dashboard.logoutBtn) {
        dashboard.logoutBtn.onclick = () => window.authManager.logout();
    }

    // Start Event Form
    if (dashboard.startForm) {
        dashboard.startForm.onsubmit = async (e) => {
            e.preventDefault();

            if (!currentHall) {
                alert('Error: Hall data not loaded.');
                return;
            }

            const name = document.getElementById('eventNameInput').value.trim();
            const startVal = document.getElementById('startTimeInput').value;
            const endVal = document.getElementById('endTimeInput').value;

            if (!name || !startVal || !endVal) {
                alert('Please fill in event name, start time, and end time.');
                return;
            }

            const startTime = new Date(startVal).toISOString();
            const endTime = new Date(endVal).toISOString();

            if (new Date(endTime) <= new Date(startTime)) {
                alert('Error: End time must be after the start time.');
                return;
            }

            const submitBtn = dashboard.startForm.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Starting...';

            try {
                // 1. Deactivate other active events for this hall
                await window.sbClient
                    .from('events')
                    .update({ is_active: false })
                    .eq('hall_id', currentHall.id)
                    .eq('is_active', true);

                // 2. Insert new event
                const { data: newEvent, error } = await window.sbClient
                    .from('events')
                    .insert({
                        hall_id: currentHall.id,
                        event_name: name,
                        start_time: startTime,
                        end_time: endTime,
                        is_active: true
                    })
                    .select()
                    .single();

                if (error) throw error;

                activeEvent = newEvent;
                renderActiveState();
                showToast('Event started! Gallery is now live.');
                fetchPhotoCount();
            } catch (err) {
                console.error('Start Event Failed:', err);
                alert('Failed to start event: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Start Active Session';
            }
        };
    }

    // End Event
    if (dashboard.endBtn) {
        dashboard.endBtn.onclick = async () => {
            if (!activeEvent) return;
            if (!confirm('End this live session now? Guests will see that the event has concluded.')) return;

            dashboard.endBtn.disabled = true;
            dashboard.endBtn.textContent = 'Stopping...';

            try {
                await deactivateEvent(activeEvent.id);
            } finally {
                dashboard.endBtn.disabled = false;
                dashboard.endBtn.textContent = 'Stop Event Now';
            }
        };
    }

    // Purge Media
    if (dashboard.purgeBtn) {
        dashboard.purgeBtn.onclick = purgeAllPhotos;
    }

    // Re-index AI Search
    if (dashboard.reindexBtn) {
        dashboard.reindexBtn.onclick = () => {
            showToast('AI Search runs directly in guest browsers. No server re-indexing needed.');
        };
    }
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    if (toast && msgEl) {
        msgEl.textContent = msg;
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 3500);
    }
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
    } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
    }
}

// =====================================================
// PHOTOGRAPHER UPLOAD LOGIC
// =====================================================
function setupUploadListeners() {
    const dropZone = document.getElementById('dropZone');
    const photoInput = document.getElementById('photoInput');

    if (!dropZone || !photoInput) return;

    dropZone.onclick = () => photoInput.click();

    photoInput.onchange = (e) => {
        if (e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    };

    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.classList.add('border-wedding-gold', 'bg-wedding-gold/10');
    };

    dropZone.ondragleave = (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-wedding-gold', 'bg-wedding-gold/10');
    };

    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.classList.remove('border-wedding-gold', 'bg-wedding-gold/10');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length > 0) {
            handleFiles(files);
        }
    };
}

async function handleFiles(files) {
    if (!currentHall || !activeEvent) {
        alert('Please start an active event session before uploading photos.');
        return;
    }

    const progressDiv = document.getElementById('uploadProgress');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressText = document.getElementById('uploadProgressText');
    const countEl = document.getElementById('uploadCount');

    progressDiv.classList.remove('hidden');

    let uploaded = 0;
    const total = files.length;

    for (const file of files) {
        try {
            if (typeof imageCompression === 'undefined') {
                throw new Error('Image compression library is not available. Please refresh.');
            }

            const options = {
                maxSizeMB: 0.9,
                maxWidthOrHeight: 1920,
                useWebWorker: true,
                fileType: 'image/jpeg',
                initialQuality: 0.8
            };

            const originalSize = (file.size / 1024 / 1024).toFixed(2);
            progressText.textContent = `Compressing ${file.name} (${originalSize}MB)...`;

            let compressedFile;
            try {
                compressedFile = await imageCompression(file, options);
            } catch (compErr) {
                console.warn('Compression fallback to original:', compErr);
                compressedFile = file;
            }

            const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
            const filePath = `${currentHall.id}/${uniqueName}`;

            progressText.textContent = `Uploading ${file.name}...`;

            const bucket = currentHall.storage_bucket || 'event-photos';
            const { error } = await window.sbClient.storage
                .from(bucket)
                .upload(filePath, compressedFile, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg'
                });

            if (error) throw error;

            uploaded++;
            uploadedCount++;

            const percent = Math.round((uploaded / total) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `Progress: ${percent}%`;
        } catch (err) {
            console.error('File Upload Error:', err);
            alert(`Error uploading ${file.name}: ${err.message}`);
        }
    }

    progressDiv.classList.add('hidden');
    progressBar.style.width = '0%';
    if (countEl) countEl.textContent = `${uploadedCount} photos uploaded`;
    showToast(`${uploaded} photo${uploaded > 1 ? 's' : ''} uploaded!`);

    document.getElementById('photoInput').value = '';
}

// =====================================================
// THEME & LOGO MANAGEMENT
// =====================================================
function applyTheme(theme) {
    if (!theme) return;
    document.body.setAttribute('data-theme', theme);

    ['dark', 'balanced'].forEach(t => {
        const btn = document.getElementById(`theme${t.charAt(0).toUpperCase() + t.slice(1)}Btn`);
        if (btn) {
            if (t === theme) {
                btn.classList.add('ring-2', 'ring-wedding-gold', 'border-wedding-gold');
            } else {
                btn.classList.remove('ring-2', 'ring-wedding-gold', 'border-wedding-gold');
            }
        }
    });
}

window.setTheme = async (theme) => {
    if (!currentHall || !window.sbClient) return;

    applyTheme(theme);

    try {
        const { error } = await window.sbClient
            .from('halls')
            .update({ theme: theme })
            .eq('id', currentHall.id);

        if (error) throw error;
        currentHall.theme = theme;
        showToast(`Theme updated to ${theme}`);
    } catch (e) {
        console.error('Theme save error:', e);
        showToast('Failed to save theme.');
    }
};

function setupLogoListeners() {
    if (!dashboard.logoInput) return;

    dashboard.logoInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleLogoUpload(e.target.files[0]);
        }
    };

    if (dashboard.removeLogoBtn) {
        dashboard.removeLogoBtn.onclick = async () => {
            if (!confirm('Remove brand logo?')) return;
            try {
                const { error } = await window.sbClient
                    .from('halls')
                    .update({ logo_url: null })
                    .eq('id', currentHall.id);

                if (error) throw error;
                currentHall.logo_url = null;
                updateLogoUI(null);
                showToast('Logo removed');
            } catch (err) {
                console.error('Logo removal failed:', err);
                alert('Failed to remove logo');
            }
        };
    }
}

async function handleLogoUpload(file) {
    if (!currentHall || !window.sbClient) return;

    dashboard.logoProgress.classList.remove('hidden');
    dashboard.logoProgressBar.style.width = '20%';

    try {
        let compressed = file;
        if (typeof imageCompression !== 'undefined') {
            compressed = await imageCompression(file, {
                maxSizeMB: 0.2,
                maxWidthOrHeight: 512,
                useWebWorker: true
            });
        }
        dashboard.logoProgressBar.style.width = '50%';

        const bucket = currentHall.storage_bucket || 'event-photos';
        const ext = file.name.split('.').pop() || 'png';
        const path = `${currentHall.id}/logos/hall_${currentHall.id}_${Date.now()}.${ext}`;

        const { error: uploadError } = await window.sbClient.storage
            .from(bucket)
            .upload(path, compressed, { upsert: true });

        if (uploadError) throw uploadError;
        dashboard.logoProgressBar.style.width = '80%';

        const { data: { publicUrl } } = window.sbClient.storage
            .from(bucket)
            .getPublicUrl(path);

        const { error: dbError } = await window.sbClient
            .from('halls')
            .update({ logo_url: publicUrl })
            .eq('id', currentHall.id);

        if (dbError) throw dbError;

        currentHall.logo_url = publicUrl;
        updateLogoUI(publicUrl);
        dashboard.logoProgressBar.style.width = '100%';
        showToast('Logo updated successfully ✨');
    } catch (err) {
        console.error('Logo upload error:', err);
        alert('Logo upload failed: ' + err.message);
    } finally {
        setTimeout(() => {
            dashboard.logoProgress.classList.add('hidden');
            dashboard.logoProgressBar.style.width = '0%';
        }, 1000);
    }
}

function updateLogoUI(url) {
    if (url) {
        dashboard.currentLogo.src = url;
        dashboard.currentLogo.classList.remove('hidden');
        dashboard.noLogo.classList.add('hidden');
        dashboard.removeLogoBtn.classList.remove('hidden');
    } else {
        dashboard.currentLogo.src = '';
        dashboard.currentLogo.classList.add('hidden');
        dashboard.noLogo.classList.remove('hidden');
        dashboard.removeLogoBtn.classList.add('hidden');
    }
}
