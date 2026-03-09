/* =====================================================
   Pro Event Gallery - Management Logic
   ===================================================== */

let currentHall = null;
let activeEvent = null;
let timerInterval = null;

// DOM Elements
const views = {
    auth: document.getElementById('authView'),
    dashboard: document.getElementById('dashboardView')
};

const dashboard = {
    hallName: document.getElementById('currentHallName'),
    statusDot: document.getElementById('activeStatus'),
    statusText: document.getElementById('activeStatusText'),
    timer: document.getElementById('currentEventTimer'),
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

    // Check if authManager exists (it should if auth.js loaded)
    if (typeof window.authManager === 'undefined') {
        console.error('Fatal: authManager is missing. auth.js failed to load?');
        return;
    }

    window.authManager.onAuthStateChange(user => {
        if (user) {
            showDashboard(user);
        } else {
            showLogin();
        }
    });

    setupEventListeners();
    setupLogoListeners();
});

function showLogin() {
    views.auth.classList.remove('hidden');
    views.dashboard.classList.add('hidden');
}

async function showDashboard(user) {
    console.log('Dashboard: loading for:', user.email);
    views.auth.classList.add('hidden');
    views.dashboard.classList.remove('hidden');

    try {
        // 1. Fetch Hall Data
        const { data: halls, error: hallError } = await window.sbClient
            .from('halls')
            .select('*')
            .eq('owner_id', user.id)
            .maybeSingle();

        if (hallError) {
            alert('Database Error: ' + hallError.message);
            return;
        }

        if (!halls) {
            alert('Hall profile not found! Ensure your owner_id in the "halls" table is: ' + user.id);
            return;
        }

        currentHall = halls;
        dashboard.hallName.textContent = currentHall.name;

        // Apply Theme
        if (currentHall.theme) {
            applyTheme(currentHall.theme);
        }

        // Apply Logo
        updateLogoUI(currentHall.logo_url);
        dashboard.logoSection.classList.remove('hidden');

        // Standardize URL building with Search + Hash fallback
        const baseUrl = window.location.origin + "/index.html";
        const hallParam = `hall=${currentHall.id}`;

        // Use both ? and # for extreme compatibility
        const liveUrl = `${baseUrl}?${hallParam}#${hallParam}`;

        console.log('Dashboard: Guest Link Constructed ->', liveUrl);

        const linkDisplay = document.getElementById('guestLinkDisplay');
        if (linkDisplay) {
            linkDisplay.textContent = liveUrl;
            linkDisplay.className = 'text-[11px] text-wedding-gold font-bold mt-3 break-all font-mono underline opacity-100 cursor-pointer hover:text-wedding-dark transition-all';
            linkDisplay.onclick = () => window.open(liveUrl, '_blank');
        }

        dashboard.liveBtn.onclick = (e) => {
            e.preventDefault();
            console.log('Dashboard: Opening live link ->', liveUrl);
            window.open(liveUrl, '_blank');
        };

        dashboard.copyBtn.onclick = (e) => {
            if (e) e.preventDefault();
            console.log('Dashboard: Copying link ->', liveUrl);
            copyToClipboard(liveUrl);
        };

        // Initialize Timing Inputs (Sensible Defaults)
        prefillEventTimes();

        // 2. Fetch Active Event
        fetchActiveEvent();
    } catch (e) {
        console.error('Dashboard Load Error:', e);
    }
}

async function fetchActiveEvent() {
    if (!currentHall || !window.sbClient) return;

    try {
        console.log('Dashboard: Fetching active event for hall:', currentHall.id);
        const { data: events, error } = await window.sbClient
            .from('events')
            .select('*')
            .eq('hall_id', currentHall.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false }); // Get newest first in case of duplicates

        if (error) {
            console.error('Dashboard: Fetch Active Event Error:', error);
            renderNoEventState();
            return;
        }

        if (events && events.length > 0) {
            // Use the most recent active event
            activeEvent = events[0];
            console.log('Dashboard: Active event detected:', activeEvent.event_name);

            if (new Date(activeEvent.end_time) < new Date()) {
                console.log('Dashboard: Detected event is expired, deactivating...');
                deactivateEvent(activeEvent.id);
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
        renderNoEventState();
    }
}

async function fetchPhotoCount() {
    if (!currentHall || !window.sbClient) return;
    try {
        const bucket = currentHall.storage_bucket || 'event-photos';
        const { data, error } = await window.sbClient.storage.from(bucket).list(currentHall.id, { limit: 10000 });
        if (!error && data) {
            uploadedCount = data.length;
            const countEl = document.getElementById('uploadCount');
            if (countEl) countEl.textContent = `${uploadedCount} photos uploaded`;
        }
    } catch (e) {
        console.error('Photo count fetch failed:', e);
    }
}

function renderActiveState() {
    dashboard.noEventCard.classList.add('hidden');
    dashboard.activeEventCard.classList.remove('hidden');
    dashboard.activeTitle.textContent = activeEvent.event_name;
    dashboard.statusDot.className = 'w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]';
    dashboard.statusText.textContent = 'Active Event';
    dashboard.statusText.classList.replace('text-wedding-dark/40', 'text-green-600');
    dashboard.timer.classList.remove('hidden');
    startTimer();

    // Show upload section when event is active
    showUploadSection(true);
}

function renderNoEventState() {
    dashboard.noEventCard.classList.remove('hidden');
    dashboard.activeEventCard.classList.add('hidden');
    dashboard.statusDot.className = 'w-2 h-2 rounded-full bg-gray-400';
    dashboard.statusText.textContent = 'No Active Event';
    dashboard.statusText.classList.replace('text-green-600', 'text-wedding-dark/40');
    dashboard.timer.classList.add('hidden');
    if (timerInterval) clearInterval(timerInterval);

    // Hide upload section when no event
    showUploadSection(false);

    // Auto-fill times for the NEXT event
    prefillEventTimes();
}

/**
 * Automatically sets the event Start/End times to sensible defaults
 * Start: Now
 * End: Now + 12 hours
 */
function prefillEventTimes() {
    const runPrefill = () => {
        try {
            console.log('Dashboard: Prefill attempt started...');
            const now = new Date();
            const end = new Date(now.getTime() + 12 * 3600000);

            const toLocalISO = (date) => {
                const offset = date.getTimezoneOffset() * 60000;
                const local = new Date(date.getTime() - offset);
                return local.toISOString().slice(0, 16);
            };

            const startInput = document.getElementById('startTimeInput');
            const endInput = document.getElementById('endTimeInput');

            if (startInput) {
                const val = toLocalISO(now);
                startInput.value = val;
                startInput.defaultValue = val;
            }
            if (endInput) {
                const val = toLocalISO(end);
                endInput.value = val;
                endInput.defaultValue = val;
            }
            console.log('Dashboard: Prefill sync complete.');
        } catch (e) {
            console.error('Dashboard: Prefill failed:', e);
        }
    };

    runPrefill();
    setTimeout(runPrefill, 1000);
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    const update = async () => {
        const end = new Date(activeEvent.end_time);
        const diff = end - new Date();
        if (diff <= 0) {
            clearInterval(timerInterval);
            // Event expired - auto-purge and deactivate
            console.log('Timer: Event expired, triggering auto-purge...');
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

async function deactivateEvent() {
    if (!currentHall || !window.sbClient) return;

    try {
        console.log('Dashboard: [DEACTIVATE] Hall-wide shutdown for:', currentHall.id);

        // 1. First, auto-purge all photos for this hall
        await purgeAllPhotos(true);

        // 2. Then deactivate ALL active events for this hall
        const { data, error } = await window.sbClient
            .from('events')
            .update({ is_active: false })
            .eq('hall_id', currentHall.id)
            .eq('is_active', true)
            .select();

        if (error) throw error;

        console.log(`Dashboard: [DEACTIVATE] Success. Records closed: ${data?.length || 0}`);

        activeEvent = null;
        renderNoEventState();
        showToast('Event ended and gallery stopped.');

    } catch (e) {
        console.error('Dashboard: [DEACTIVATE] Failed:', e);
        alert('Error: Could not end session. Please refresh and try again.');
        fetchActiveEvent();
    }
}

// Reusable function to purge all photos
async function purgeAllPhotos(silent = false) {
    console.log('Purge: Starting purge, currentHall:', currentHall?.slug);

    if (!currentHall || !window.sbClient) {
        console.error('Purge: Missing currentHall or sbClient!');
        return;
    }

    if (!silent && !confirm('CRITICAL: Permanently delete ALL photos in storage?')) return;

    try {
        const bucket = currentHall.storage_bucket || 'event-photos';
        console.log(`Purge: Listing files in bucket "${bucket}", hall:`, currentHall.id);
        const { data: files, error } = await window.sbClient.storage.from(bucket).list(currentHall.id);

        if (error) {
            console.error('Purge: List error:', error);
            throw error;
        }

        console.log('Purge: Found', files?.length || 0, 'files');

        if (files && files.length > 0) {
            const paths = files.map(f => `${currentHall.id}/${f.name}`);
            console.log('Purge: Deleting paths:', paths);

            const { error: delError } = await window.sbClient.storage.from(bucket).remove(paths);

            if (delError) {
                console.error('Purge: Delete error:', delError);
                throw delError;
            }

            console.log(`Purge: Successfully deleted ${files.length} photos.`);
            if (!silent) showToast(`Deleted ${files.length} photos.`);
            uploadedCount = 0;
            const countEl = document.getElementById('uploadCount');
            if (countEl) countEl.textContent = `0 photos uploaded`;
        } else {
            console.log('Purge: Storage was already empty.');
            if (!silent) showToast('Storage is empty.');
        }
    } catch (e) {
        console.error('Purge error:', e);
        if (!silent) alert('Purge failed: ' + e.message);
    }
}

function setupEventListeners() {
    // Login
    dashboard.loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const pass = document.getElementById('password').value;
        const remember = document.getElementById('rememberMe')?.checked || false;
        const errorEl = document.getElementById('authError');

        try {
            console.log('Dashboard: Attempting login...');
            const data = await window.authManager.login(email, pass, remember);
            if (data.user) showDashboard(data.user);
        } catch (err) {
            console.error('Login Error:', err);
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        }
    };

    // Logout
    dashboard.logoutBtn.onclick = () => window.authManager.logout();

    // Start Event
    dashboard.startForm.onsubmit = async (e) => {
        e.preventDefault();
        console.log('Dashboard: Start Event Form Submitted');

        if (!currentHall) {
            console.error('Dashboard: Cannot start event - currentHall is missing!');
            alert('Error: Hall data not loaded.');
            return;
        }

        const name = document.getElementById('eventNameInput').value;
        const startVal = document.getElementById('startTimeInput').value;
        const endVal = document.getElementById('endTimeInput').value;

        if (!startVal || !endVal) {
            alert('Error: Please fill in both start and end times.');
            return;
        }

        const startTime = new Date(startVal).toISOString();
        const endTime = new Date(endVal).toISOString();

        if (new Date(endTime) <= new Date(startTime)) {
            alert('Error: End time must be after the start time.');
            return;
        }

        dashboard.startForm.querySelector('button').disabled = true;
        dashboard.startForm.querySelector('button').textContent = 'Starting...';

        try {
            // 🛡️ 1. Deactivate ALL other active events for this hall first (Safety Step)
            console.log('Dashboard: Deactivating any existing active events...');
            await window.sbClient
                .from('events')
                .update({ is_active: false })
                .eq('hall_id', currentHall.id)
                .eq('is_active', true);

            // 🚀 2. Insert New Event and get it back immediately
            console.log('Dashboard: Inserting new event for hall_id:', currentHall.id);
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

            console.log('Dashboard: Event created and retrieved:', newEvent.event_name);

            // 🎯 3. Immediate UI Sync
            activeEvent = newEvent;
            renderActiveState();
            showToast('Event started successfully! Gallery is now live.');

            // Bonus: Trigger photo count update
            fetchPhotoCount();

        } catch (err) {
            console.error('Dashboard: Start Session Failed:', err);
            alert('Error: ' + err.message);
        } finally {
            dashboard.startForm.querySelector('button').disabled = false;
            dashboard.startForm.querySelector('button').textContent = 'Start Active Session';
        }
    };

    // End Event
    dashboard.endBtn.onclick = async () => {
        if (!activeEvent) return;
        if (!confirm('CRITICAL: End this live session? Guests will no longer see photos.')) return;

        const originalText = dashboard.endBtn.textContent;
        dashboard.endBtn.disabled = true;
        dashboard.endBtn.textContent = 'Stopping Gallery...';

        try {
            await deactivateEvent();
        } finally {
            dashboard.endBtn.disabled = false;
            dashboard.endBtn.textContent = originalText;
        }
    };

    // Purge Media
    dashboard.purgeBtn.onclick = async () => {
        if (!confirm('CRITICAL: Permanently delete ALL photos in storage?')) return;
        try {
            const bucket = currentHall.storage_bucket || 'event-photos';
            const { data: files, error } = await window.sbClient.storage.from(bucket).list(currentHall.id, { limit: 10000 });
            if (error) throw error;
            if (files.length > 0) {
                const paths = files.map(f => `${currentHall.id}/${f.name}`);
                const { error: delError } = await window.sbClient.storage.from(bucket).remove(paths);
                if (delError) throw delError;
                showToast(`Deleted ${files.length} photos.`);
                uploadedCount = 0;
                document.getElementById('uploadCount').textContent = `0 photos uploaded`;
            } else {
                showToast('Storage is empty.');
            }
        } catch (e) {
            alert(e.message);
        }
    };

    // Re-index All for AI
    if (dashboard.reindexBtn) dashboard.reindexBtn.onclick = async () => {
        if (!confirm('This will scan ALL existing photos for faces. This may take a minute. Continue?')) return;

        const originalText = dashboard.reindexBtn.textContent;
        dashboard.reindexBtn.disabled = true;
        dashboard.reindexBtn.textContent = '🚀 Indexing...';

        try {
            const bucket = currentHall.storage_bucket || 'event-photos';
            const { data: files, error } = await window.sbClient.storage.from(bucket).list(currentHall.id, { limit: 10000 });

            if (error) throw error;
            if (files.length === 0) {
                showToast('No photos to index.');
                return;
            }

            let indexedCount = 0;
            showToast(`Starting AI scan of ${files.length} photos...`);

            for (const file of files) {
                if (file.name === '.emptyFolderPlaceholder') continue;
                await indexFacesInBackground(`${currentHall.id}/${file.name}`);
                indexedCount++;
            }

            showToast(`✨ AI Scan Complete! Processed ${indexedCount} photos.`);
        } catch (err) {
            console.error('Re-index Error:', err);
            alert('Re-index failed: ' + err.message);
        } finally {
            dashboard.reindexBtn.disabled = false;
            dashboard.reindexBtn.textContent = originalText;
        }
    };
}

function showToast(msg) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMessage').textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
    showToast('Guest Link Copied!');
}

// =====================================================
// PHOTOGRAPHER UPLOAD LOGIC
// =====================================================
let uploadedCount = 0;

function setupUploadListeners() {
    const dropZone = document.getElementById('dropZone');
    const photoInput = document.getElementById('photoInput');
    const uploadSection = document.getElementById('uploadSection');

    if (!dropZone || !photoInput) return;

    // Click to select files
    dropZone.onclick = () => photoInput.click();

    // File input change
    photoInput.onchange = (e) => {
        if (e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    };

    // Drag and drop
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

function showUploadSection(show) {
    const section = document.getElementById('uploadSection');
    if (section) {
        section.classList.toggle('hidden', !show);
    }
}

async function handleFiles(files) {
    if (!currentHall || !activeEvent) {
        showToast('Start an event first!');
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
            // Check if compression library is loaded
            if (typeof imageCompression === 'undefined') {
                console.error('Dashboard: Compression library not loaded!');
                throw new Error('Image compression library is missing. Please refresh the page.');
            }

            // Updated compression options
            const options = {
                maxSizeMB: 0.9, // Target under 1MB
                maxWidthOrHeight: 1920,
                useWebWorker: true,
                fileType: 'image/jpeg', // Force JPEG for best compression
                initialQuality: 0.8
            };

            const originalSize = (file.size / 1024 / 1024).toFixed(2);
            progressText.textContent = `Compressing ${file.name} (${originalSize}MB)...`;
            console.log(`Dashboard: Starting compression for ${file.name} (${originalSize}MB)`);

            let compressedFile;
            try {
                compressedFile = await imageCompression(file, options);
                const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
                console.log(`Dashboard: Compression successful. New size: ${compressedSize}MB`);

                // FINAL SAFETY CHECK: If it's still over 50MB (Supabase limit), we CANNOT upload
                if (compressedFile.size > 50 * 1024 * 1024) {
                    throw new Error(`File is too large even after compression (${compressedSize}MB). Max allowed is 50MB.`);
                }
            } catch (compError) {
                console.error('Dashboard: Compression failed:', compError);
                throw new Error(`Failed to compress ${file.name}. It might be a RAW file or corrupted.`);
            }

            // Generate unique filename
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
            const filePath = `${currentHall.id}/${uniqueName}`;

            progressText.textContent = `Uploading ${file.name}...`;
            console.log('Dashboard: Uploading compressed file to:', filePath);

            const bucket = currentHall.storage_bucket || 'event-photos';
            const { data, error } = await window.sbClient.storage
                .from(bucket)
                .upload(filePath, compressedFile, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'image/jpeg'
                });

            if (error) {
                console.error('Upload error:', error);
                throw new Error(`Supabase Error: ${error.message}`);
            } else {
                console.log('Dashboard: Upload success:', data);
                uploaded++;
                uploadedCount++;

            }

            // Update progress
            const percent = Math.round((uploaded / total) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `Progress: ${percent}%`;

        } catch (err) {
            console.error('Process failed:', err);
            alert(`Error processing ${file.name}:\n\n${err.message}`);
            // Don't continue for this specific file but continue the loop
        }
    }

    // Done
    progressDiv.classList.add('hidden');
    progressBar.style.width = '0%';
    countEl.textContent = `${uploadedCount} photos uploaded`;
    showToast(`${uploaded} photo${uploaded > 1 ? 's' : ''} uploaded!`);

    // Clear input
    document.getElementById('photoInput').value = '';
}

// Initialize upload listeners after DOM ready
document.addEventListener('DOMContentLoaded', setupUploadListeners);

/**
 * THEME MANAGEMENT
 */
function applyTheme(theme) {
    if (!theme) return;
    console.log('Theme: Applying', theme);
    document.body.setAttribute('data-theme', theme);

    // Highlight buttons
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

    // 1. Instant Preview
    applyTheme(theme);

    try {
        // 2. Persist to DB
        const { error } = await window.sbClient
            .from('halls')
            .update({ theme: theme })
            .eq('id', currentHall.id);

        if (error) throw error;
        currentHall.theme = theme;
        showToast(`Theme updated to ${theme}`);
    } catch (e) {
        console.error('Theme: Save failed', e);
        showToast('Failed to save theme preference.');
    }
};

/**
 * LOGO / BRANDING MANAGEMENT
 */
function setupLogoListeners() {
    if (!dashboard.logoInput) return;
    dashboard.logoInput.onchange = (e) => {
        if (e.target.files && e.target.files[0]) {
            handleLogoUpload(e.target.files[0]);
        }
    };

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

async function handleLogoUpload(file) {
    if (!currentHall || !window.sbClient) return;

    dashboard.logoProgress.classList.remove('hidden');
    dashboard.logoProgressBar.style.width = '0%';

    try {
        // 1. Simple compression for logo (max 512px)
        const options = {
            maxSizeMB: 0.2,
            maxWidthOrHeight: 512,
            useWebWorker: true
        };
        const compressed = await imageCompression(file, options);
        dashboard.logoProgressBar.style.width = '30%';

        // 2. Upload to storage
        const bucket = currentHall.storage_bucket || 'event-photos';
        const ext = file.name.split('.').pop();
        const path = `${currentHall.id}/logos/hall_${currentHall.id}_${Date.now()}.${ext}`;

        const { error: uploadError } = await window.sbClient.storage
            .from(bucket)
            .upload(path, compressed);

        if (uploadError) throw uploadError;
        dashboard.logoProgressBar.style.width = '70%';

        // 3. Get Public URL
        const { data: { publicUrl } } = window.sbClient.storage
            .from(bucket)
            .getPublicUrl(path);

        // 4. Update DB
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
        console.error('Logo upload failed:', err);
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

// 🤖 AI: Face matching is now handled client-side in the guest app (app.js)
// No face data is stored on the server (KVKK compliance)
