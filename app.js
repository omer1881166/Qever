// SUPABASE CONFIGURATION
const SUPABASE_URL = 'https://zqkunpevlcaoybzdtdnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxa3VucGV2bGNhb3liemR0ZG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNTM5NjAsImV4cCI6MjA4NTYyOTk2MH0._8-HT24JHy6EVOWtnDW3wr-mnPdW-5VbPd2BwsnXqW8';

if (typeof window.sbClient === 'undefined') {
    window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('App: Supabase Client initialized.');
}

// ===================================
// CONFIGURATION & STATE
// ===================================
const CONFIG = {
    bucketName: 'event-photos',
    pollInterval: 30000,
    supportedExtensions: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxImages: 100
};

let currentHall = null;
let activeEvent = null;
let currentImages = [];
let isLoading = false;
let pollTimer = null;
let elements = {};

// ===================================
// INITIALIZATION
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize element references after DOM is ready
    elements = {
        loadingState: document.getElementById('loadingState'),
        emptyState: document.getElementById('emptyState'),
        gallery: document.getElementById('gallery'),
        galleryGrid: document.getElementById('galleryGrid'),
        refreshBtn: document.getElementById('refreshBtn'),
        refreshIcon: document.getElementById('refreshIcon'),
        newPhotoPulse: document.getElementById('newPhotoPulse'),
        toast: document.getElementById('toast'),
        toastMessage: document.getElementById('toastMessage'),
        eventName: document.getElementById('eventName'),
        eventDate: document.getElementById('eventDate'),
        lightbox: document.getElementById('lightbox'),
        lightboxImg: document.getElementById('lightboxImage'),
        downloadBtn: document.getElementById('downloadBtn'),
        shareBtn: document.getElementById('shareBtn'),
        closeLightbox: document.getElementById('closeLightbox'),
        lightboxLogo: null, // Initialized dynamically
        findMeBtn: document.getElementById('findMeBtn'),
        selfieModal: document.getElementById('selfieModal'),
        selfieVideo: document.getElementById('selfieVideo'),
        closeSelfieBtn: document.getElementById('closeSelfieBtn'),
        captureSelfieBtn: document.getElementById('captureSelfieBtn'),
        uploadSelfieBtn: document.getElementById('uploadSelfieBtn'),
        selfieFileInput: document.getElementById('selfieFileInput'),
        aiFilterStatus: document.getElementById('aiFilterStatus'),
        clearAiFilterBtn: document.getElementById('clearAiFilterBtn')
    };

    console.log('App: Initializing...');
    initApp();
    setupEventListeners();
});

async function initApp() {
    showLoading();

    // 🛡️ AGGRESSIVE PARAMETER EXTRACTION
    const url = window.location.href;
    const search = window.location.search;
    const hash = window.location.hash;
    console.log('App: URL Debug ->', { url, search, hash });

    const urlParams = new URLSearchParams(search);
    const hashParams = new URLSearchParams(hash.replace('#', '?').replace('??', '?'));

    let detectedId = urlParams.get('hall') || urlParams.get('event') ||
        hashParams.get('hall') || hashParams.get('event');

    if (!detectedId) {
        const match = url.match(/[?&#](hall|event)=([^&#]+)/);
        if (match) detectedId = decodeURIComponent(match[2]);
    }

    if (!detectedId) {
        console.warn('App: Detection failed.');
        showEmpty('Missing hall identifier. Please scan a QR code again.');
        return;
    }

    const HALL_IDENTIFIER = detectedId.trim();

    try {
        console.log('App: Querying Database for ID:', HALL_IDENTIFIER);

        // Search by slug OR id
        let query = window.sbClient.from('halls').select('*');
        if (HALL_IDENTIFIER.includes('-') && HALL_IDENTIFIER.length > 20) {
            query = query.eq('id', HALL_IDENTIFIER);
        } else {
            query = query.eq('slug', HALL_IDENTIFIER);
        }

        const { data: hall, error: hallError } = await query.maybeSingle();

        if (hallError) throw hallError;
        if (!hall) {
            console.error('App: Hall not found in database.');
            showEmpty('Hall not found. Please check your QR code link.');
            return;
        }

        currentHall = hall;

        // Apply Theme (Default to 'balanced')
        const theme = (currentHall.theme && currentHall.theme !== 'light') ? currentHall.theme : 'balanced';
        console.log('App: Applying theme', theme);
        document.body.setAttribute('data-theme', theme);

        console.log('App: Hall found:', hall.name);

        await refreshActiveEvent();
        startPolling();
    } catch (e) {
        console.error('App: Initialization Error:', e);
        showEmpty('Connection error. Please refresh the page.');
    }
}

async function refreshActiveEvent() {
    console.log('App: Checking for active event for hall_id:', currentHall.id);
    const { data: events, error } = await window.sbClient
        .from('events')
        .select('*')
        .eq('hall_id', currentHall.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('App: Event Fetch Error:', error);
        return;
    }

    const now = new Date();
    if (events && events.length > 0) {
        // Pick the most recent active event to handle duplicates
        const event = events[0];
        console.log('App: Active event found:', event.event_name);

        if (new Date(event.end_time) > now) {
            activeEvent = event;
            updateUIHeader();
            await fetchImages();
        } else {
            console.warn('App: Event found but expired.');
            activeEvent = null;
            showEmpty(`The event "${event.event_name}" has ended.`);
            updateUIHeader('Off Air', 'Event Ended');
        }
    } else {
        console.log('App: No active events found.');
        activeEvent = null;
        showEmpty(`No active event in ${currentHall.name} right now.`);
        updateUIHeader('Off Air', 'Check back later');
    }
}

function updateUIHeader(customTitle, customDate) {
    if (elements.eventName) {
        elements.eventName.textContent = customTitle || activeEvent?.event_name || currentHall?.name;
    }
    if (elements.eventDate) {
        elements.eventDate.textContent = customDate || (activeEvent ? 'Live Now' : '');
    }
    document.title = (customTitle || activeEvent?.event_name || currentHall?.name) + ' | Live Gallery';
}

async function fetchImages() {
    if (!activeEvent || !currentHall) return;

    isLoading = true;
    try {
        const hallId = currentHall.id;
        const bucket = currentHall.storage_bucket || 'event-photos';
        console.log(`App: Listing photos in bucket "${bucket}" for hall:`, hallId);

        const { data: files, error } = await window.sbClient.storage
            .from(bucket)
            .list(hallId, {
                limit: CONFIG.maxImages,
                sortBy: { column: 'created_at', order: 'desc' }
            });

        if (error) throw error;

        // Filtering with time buffer (allow photos from 2 *hours* buffer to avoid clock mismatch)
        const startTime = new Date(activeEvent.start_time).getTime() - (2 * 60 * 60 * 1000);
        const endTime = new Date(activeEvent.end_time).getTime() + (2 * 60 * 60 * 1000);

        const validFiles = files.filter(file => {
            const createdAt = new Date(file.created_at).getTime();
            const isImage = CONFIG.supportedExtensions.includes(file.name.split('.').pop().toLowerCase());
            const isDuringEvent = createdAt >= startTime && createdAt <= endTime;

            if (!isDuringEvent && isImage) {
                console.log(`App: Filtered out ${file.name} - Created at: ${new Date(createdAt).toLocaleString()}`);
            }

            return isImage && isDuringEvent;
        });

        console.log(`App: Found ${validFiles.length} valid photos out of ${files.length} candidates.`);

        if (currentImages.length > 0 && validFiles.length > currentImages.length) {
            triggerPulse();
        }

        currentImages = validFiles;

        if (currentImages.length === 0) {
            showEmpty('Photos will appear here as they are uploaded during the event.');
        } else {
            renderGallery();
        }
    } catch (e) {
        console.error('App: Fetch Images Error:', e);
    } finally {
        isLoading = false;
        hideLoading();
    }
}

function renderGallery() {
    elements.emptyState.classList.add('hidden');
    elements.gallery.classList.remove('hidden');
    elements.galleryGrid.innerHTML = '';

    currentImages.forEach((file, index) => {
        const filePath = `${currentHall.id}/${file.name}`;
        const bucket = currentHall.storage_bucket || 'event-photos';
        const { data: { publicUrl } } = window.sbClient.storage
            .from(bucket)
            .getPublicUrl(filePath);

        const item = document.createElement('div');
        item.className = 'photo-card loaded';
        item.style.animationDelay = `${index * 0.05}s`;

        const img = document.createElement('img');
        img.src = publicUrl;
        img.alt = 'Event photo';
        img.className = 'w-full h-auto rounded-lg shadow-sm loaded cursor-pointer';
        img.loading = 'lazy';
        img.dataset.url = publicUrl;
        img.dataset.name = file.name;
        img.onclick = () => openLightbox(publicUrl, file.name);

        item.appendChild(img);

        // Add Logo Overlay (Branding)
        if (currentHall.logo_url) {
            const logo = document.createElement('img');
            logo.src = currentHall.logo_url;
            logo.className = 'logo-overlay';
            logo.alt = 'Hall Brand';
            item.appendChild(logo);
        }

        elements.galleryGrid.appendChild(item);
    });
}

function showLoading() {
    elements.loadingState.classList.remove('hidden');
    elements.emptyState.classList.add('hidden');
}

function hideLoading() {
    elements.loadingState.classList.add('hidden');
    elements.refreshIcon.classList.remove('animate-spin');
}

function showEmpty(message) {
    hideLoading();
    elements.gallery.classList.add('hidden');
    elements.emptyState.classList.remove('hidden');
    const msgEl = elements.emptyState.querySelector('p');
    if (msgEl) msgEl.textContent = message;
}

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
        const { data: event } = await window.sbClient
            .from('events')
            .select('*')
            .eq('hall_id', currentHall.id)
            .eq('is_active', true)
            .maybeSingle();

        if (!event || new Date(event.end_time) < new Date()) {
            activeEvent = null;
            showEmpty(`The event has ended. Thanks for coming!`);
            updateUIHeader('Event Ended', '');
            if (event) {
                await window.sbClient.from('events').update({ is_active: false }).eq('id', event.id);
            }
            return;
        }

        fetchImages();
    }, CONFIG.pollInterval);
}

function triggerPulse() {
    if (elements.newPhotoPulse) {
        elements.newPhotoPulse.classList.remove('hidden');
        showToast('New photos added!');
    }
}

function showToast(msg) {
    elements.toastMessage.textContent = msg;
    elements.toast.classList.remove('hidden');
    setTimeout(() => elements.toast.classList.add('hidden'), 4000);
}

function openLightbox(url, name) {
    console.log('Lightbox: Opening with URL:', url);

    if (!elements.lightbox || !elements.lightboxImg) {
        console.error('Lightbox: Elements not found!');
        return;
    }

    // Set the image source
    elements.lightboxImg.src = url;

    // Force visibility with all styles
    elements.lightbox.classList.remove('hidden');
    elements.lightbox.style.display = 'flex';
    elements.lightbox.style.zIndex = '9999';
    elements.lightbox.style.opacity = '1';
    elements.lightbox.style.visibility = 'visible';
    document.body.style.overflow = 'hidden';

    // Add Logo to Lightbox if exists
    if (currentHall.logo_url) {
        if (!elements.lightboxLogo) {
            elements.lightboxLogo = document.createElement('img');
            elements.lightboxLogo.className = 'lightbox-logo';
            elements.lightboxLogo.alt = 'Hall Brand';
            // Append to the image container (parent of lightboxImg)
            elements.lightboxImg.parentElement.appendChild(elements.lightboxLogo);
        }
        elements.lightboxLogo.src = currentHall.logo_url;
        elements.lightboxLogo.classList.remove('hidden');
    } else if (elements.lightboxLogo) {
        elements.lightboxLogo.classList.add('hidden');
    }

    console.log('Lightbox: Now visible, z-index:', elements.lightbox.style.zIndex);
}

function closeLightbox() {
    if (!elements.lightbox) return;

    elements.lightbox.style.display = 'none';
    elements.lightbox.classList.add('hidden');
    document.body.style.overflow = '';
}

function setupEventListeners() {
    elements.refreshBtn.onclick = () => {
        elements.refreshIcon.classList.add('animate-spin');
        elements.newPhotoPulse.classList.add('hidden');
        refreshActiveEvent();
    };

    if (elements.closeLightbox) elements.closeLightbox.onclick = closeLightbox;

    elements.lightbox.onclick = (e) => {
        if (e.target === elements.lightbox) closeLightbox();
    };

    elements.downloadBtn.onclick = async () => {
        try {
            showToast('Preparing your photo...');
            const blob = await createWatermarkedBlob(elements.lightboxImg.src, currentHall?.logo_url);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `photo_${Date.now()}.jpg`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Download error:', e);
            window.open(elements.lightboxImg.src, '_blank');
        }
    };

    // AI Button Listeners (Mobile compatibility: use .onclick)
    if (elements.findMeBtn) {
        elements.findMeBtn.onclick = () => {
            console.log('App: Find Me clicked');
            openSelfieModal();
        };
    }
    if (elements.closeSelfieBtn) elements.closeSelfieBtn.onclick = closeSelfieModal;
    if (elements.captureSelfieBtn) elements.captureSelfieBtn.onclick = captureSelfie;

    if (elements.uploadSelfieBtn) {
        elements.uploadSelfieBtn.onclick = () => elements.selfieFileInput.click();
    }

    if (elements.selfieFileInput) {
        elements.selfieFileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file) handleSelfieUpload(file);
        };
    }

    if (elements.clearAiFilterBtn) {
        elements.clearAiFilterBtn.onclick = () => {
            elements.aiFilterStatus.classList.add('hidden');
            renderGallery();
        };
    }

    elements.shareBtn.onclick = async () => {
        try {
            showToast('Readying your photo to share...');
            const blob = await createWatermarkedBlob(elements.lightboxImg.src, currentHall?.logo_url);

            // Try to share as a file (if supported by OS)
            const file = new File([blob], `moment_${Date.now()}.jpg`, { type: 'image/jpeg' });

            if (navigator.share && window.isSecureContext) {
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        files: [file],
                        title: activeEvent?.event_name || 'Event Moment',
                        text: `Check out this photo from ${activeEvent?.event_name || 'the event'}!`
                    });
                } else {
                    // Fallback to link sharing within native menu
                    await navigator.share({
                        title: activeEvent?.event_name || 'Event Moment',
                        url: window.location.href
                    });
                }
            } else {
                // Fallback to clipboard for insecure contexts (HTTP via IP) or unsupported browsers
                navigator.clipboard.writeText(window.location.href);
                showToast('Link copied! (Native share needs HTTPS)');
            }
        } catch (e) {
            console.warn('Share failed:', e);
            // Final fallback
            navigator.clipboard.writeText(window.location.href);
            showToast('Link copied!');
        }
    };
}

/**
 * WATERMARKING LOGIC
 * Physically merges the hall logo into the photo blob
 */
async function createWatermarkedBlob(photoUrl, logoUrl) {
    return new Promise(async (resolve, reject) => {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 1. Load the main photo
            const mainImg = new Image();
            mainImg.crossOrigin = "anonymous";
            mainImg.src = photoUrl;
            await new Promise((res) => mainImg.onload = res);

            // Set canvas size to match photo
            canvas.width = mainImg.width;
            canvas.height = mainImg.height;

            // Draw main photo
            ctx.drawImage(mainImg, 0, 0);

            // 2. Load and Draw Logo if exists
            if (logoUrl) {
                const logoImg = new Image();
                logoImg.crossOrigin = "anonymous";
                logoImg.src = logoUrl;
                await new Promise((res) => logoImg.onload = res);

                // Calculate relative size (6% of photo width - more subtle)
                const logoWidth = canvas.width * 0.06;
                const aspectRatio = logoImg.height / logoImg.width;
                const logoHeight = logoWidth * aspectRatio;

                // Position (bottom-right with padding)
                const padding = canvas.width * 0.02;
                const x = canvas.width - logoWidth - padding;
                const y = canvas.height - logoHeight - padding;

                // Apply subtle opacity for the watermark
                ctx.globalAlpha = 0.65;

                // Draw logo
                ctx.drawImage(logoImg, x, y, logoWidth, logoHeight);
                ctx.globalAlpha = 1.0;
            }

            // 3. Export as JPEG
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas toBlob failed'));
            }, 'image/jpeg', 0.95);

        } catch (err) {
            reject(err);
        }
    });
}

// =====================================================
// AI FACE SEARCH ENGINE
// =====================================================
let selfieStream = null;
let guestAIModelsLoaded = false;
const GUEST_AI_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

async function openSelfieModal() {
    console.log('App: Opening selfie modal...');

    // 1. Show modal immediately for UI feedback
    elements.selfieModal.classList.remove('hidden');
    elements.selfieModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // 2. Check for secure context / camera support
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        console.warn('App: Camera blocked - Insecure context');
        showToast('🔒 HTTPS required for camera.');
        // Add text over video area
        const videoContainer = elements.selfieVideo.parentElement;
        if (videoContainer) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'absolute inset-0 flex items-center justify-center p-6 text-center text-red-400 font-bold bg-black/60 z-10';
            errorMsg.id = 'cameraError';
            errorMsg.innerHTML = '🔒 Camera access requires an HTTPS connection.<br><br>Please use the official domain instead of an IP address.';
            videoContainer.appendChild(errorMsg);
        }
        return;
    }

    try {
        console.log('App: Requesting camera stream...');
        selfieStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 640, height: 640 }
        });
        elements.selfieVideo.srcObject = selfieStream;

        // Remove error if exists
        const oldError = document.getElementById('cameraError');
        if (oldError) oldError.remove();
    } catch (err) {
        console.error('App: Camera access error:', err);
        showToast('📱 Camera access blocked.');

        const videoContainer = elements.selfieVideo.parentElement;
        if (videoContainer) {
            const errorMsg = document.createElement('div');
            errorMsg.className = 'absolute inset-0 flex items-center justify-center p-6 text-center text-red-400 font-bold bg-black/60 z-10';
            errorMsg.id = 'cameraError';
            errorMsg.innerHTML = '📷 Camera access denied.<br><br>Please check your browser permissions.';
            videoContainer.appendChild(errorMsg);
        }
    }
}

function closeSelfieModal() {
    if (selfieStream) { selfieStream.getTracks().forEach(track => track.stop()); selfieStream = null; }
    elements.selfieModal.classList.add('hidden');
    elements.selfieModal.style.display = 'none';
}

async function captureSelfie() {
    if (!selfieStream) {
        showToast('📷 Please enable camera access first.');
        return;
    }
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = elements.selfieVideo.videoWidth;
    captureCanvas.height = elements.selfieVideo.videoHeight;
    captureCanvas.getContext('2d').drawImage(elements.selfieVideo, 0, 0);
    closeSelfieModal();

    const imageData = captureCanvas.toDataURL('image/jpeg', 0.9);
    await findPhotosByFace(imageData);
}

async function handleSelfieUpload(file) {
    if (!file) return;
    closeSelfieModal();

    showToast('⌛ Preparing your photo...');
    const reader = new FileReader();
    reader.onload = async (e) => {
        await findPhotosByFace(e.target.result);
    };
    reader.readAsDataURL(file);
}

async function findPhotosByFace(imageSource) {
    // Show searching bar
    const searchBar = document.getElementById('aiSearchingBar');
    const searchText = document.getElementById('aiSearchingText');
    const searchProgress = document.getElementById('aiSearchingProgress');
    searchBar.classList.remove('hidden');
    searchText.textContent = '✨ Loading AI engine...';
    searchProgress.style.width = '5%';

    try {
        // 1. Load AI models
        await loadGuestAIModels();
        searchText.textContent = '🔍 Detecting your face...';
        searchProgress.style.width = '10%';

        // 2. Detect face in provided image
        const img = new Image();
        img.src = imageSource;
        await new Promise(r => img.onload = r);

        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
        if (!detection) {
            searchBar.classList.add('hidden');
            showToast('😕 No face detected. Try again.');
            return;
        }

        const selfieDescriptor = detection.descriptor;

        // 3. CLIENT-SIDE MATCHING (KVKK Compliant — Zero Storage)
        if (!currentImages || currentImages.length === 0) {
            searchBar.classList.add('hidden');
            showToast('📭 No photos in the gallery yet.');
            return;
        }

        const bucket = currentHall.storage_bucket || 'event-photos';
        const totalPhotos = currentImages.length;
        const matchedPaths = [];
        const MATCH_THRESHOLD = 0.6; // L2 distance — lower = stricter

        searchText.textContent = `🔎 Scanning 0 of ${totalPhotos} photos...`;
        searchProgress.style.width = '15%';

        for (let i = 0; i < totalPhotos; i++) {
            const file = currentImages[i];
            const photoPath = `${currentHall.id}/${file.name}`;
            const { data: { publicUrl } } = window.sbClient.storage.from(bucket).getPublicUrl(photoPath);

            try {
                const galleryImg = new Image();
                galleryImg.crossOrigin = 'anonymous';
                galleryImg.src = publicUrl;
                await new Promise((resolve, reject) => {
                    galleryImg.onload = resolve;
                    galleryImg.onerror = reject;
                    setTimeout(reject, 10000); // 10s timeout per photo
                });

                const detections = await faceapi.detectAllFaces(galleryImg).withFaceLandmarks().withFaceDescriptors();

                for (const det of detections) {
                    const distance = faceapi.euclideanDistance(selfieDescriptor, det.descriptor);
                    if (distance < MATCH_THRESHOLD) {
                        matchedPaths.push(photoPath);
                        break;
                    }
                }
            } catch (photoErr) {
                console.warn(`AI: Skipped ${file.name}:`, photoErr.message);
            }

            const progress = 15 + ((i + 1) / totalPhotos) * 80;
            searchProgress.style.width = `${Math.round(progress)}%`;
            searchText.textContent = `🔎 Scanning ${i + 1} of ${totalPhotos} photos... (${matchedPaths.length} found)`;
        }

        searchProgress.style.width = '100%';

        if (matchedPaths.length === 0) {
            searchBar.classList.add('hidden');
            showToast('🤷 No matching photos found.');
            return;
        }

        searchText.textContent = `🎉 Found ${matchedPaths.length} photos of you!`;
        setTimeout(() => searchBar.classList.add('hidden'), 2000);

        renderFilteredGallery(matchedPaths);
        elements.aiFilterStatus.classList.remove('hidden');
    } catch (err) {
        console.error('AI Search Error:', err);
        searchBar.classList.add('hidden');
        showToast('⚠️ AI search failed.');
    }
}

async function loadGuestAIModels() {
    if (guestAIModelsLoaded) return;
    showToast('Loading AI engine...');
    if (typeof faceapi === 'undefined') {
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }
    await faceapi.nets.ssdMobilenetv1.loadFromUri(GUEST_AI_MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(GUEST_AI_MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(GUEST_AI_MODEL_URL);
    guestAIModelsLoaded = true;
}

function renderFilteredGallery(matchedPaths) {
    elements.galleryGrid.innerHTML = '';
    const bucket = currentHall.storage_bucket || 'event-photos';
    matchedPaths.forEach((photoPath) => {
        const { data: { publicUrl } } = window.sbClient.storage.from(bucket).getPublicUrl(photoPath);
        const item = document.createElement('div');
        item.className = 'photo-card loaded';
        const img = document.createElement('img');
        img.src = publicUrl;
        img.alt = 'Event photo';
        img.className = 'w-full h-auto rounded-lg shadow-sm loaded cursor-pointer';
        img.loading = 'lazy';
        img.onclick = () => openLightbox(publicUrl, photoPath.split('/').pop());
        item.appendChild(img);
        if (currentHall.logo_url) {
            const logo = document.createElement('img');
            logo.src = currentHall.logo_url;
            logo.className = 'logo-overlay';
            logo.alt = 'Hall Brand';
            item.appendChild(logo);
        }
        elements.galleryGrid.appendChild(item);
    });
}
