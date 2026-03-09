/**
 * AI CATCH-UP INDEXING SCRIPT
 * This script runs locally on your PC to index all existing photos in the gallery.
 * It is safer and more powerful for bulk processing (1,000+ photos).
 */

const { createClient } = require('@supabase/supabase-js');
const faceapi = require('face-api.js');
const canvas = require('canvas');
const fetch = require('node-fetch');

// 1. SUPABASE CONFIG (Change these to your real keys if different)
const SUPABASE_URL = 'https://zqkunpevlcaoybzdtdnj.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'; // Use Service Role for bulk write!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 2. Mocking the browser environment for face-api
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData, fetch });

async function initAI() {
    console.log('🤖 Loading AI models...');
    // We'll load models from a public CDN or local path
    const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
    await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    console.log('✅ AI Models loaded.');
}

async function indexGallery(hallId) {
    console.log(`📸 Fetching photos for hall: ${hallId}`);

    // 1. Get all photos from storage
    const { data: files, error } = await supabase.storage.from('event-photos').list(hallId, { limit: 10000 });
    if (error) throw error;

    console.log(`🔍 Found ${files.length} photos. Starting AI scan...`);

    for (const file of files) {
        if (file.name === '.emptyFolderPlaceholder') continue;

        const path = `${hallId}/${file.name}`;

        // Check if already indexed
        const { data: existing } = await supabase.from('face_encodings').select('id').eq('photo_path', path).maybeSingle();
        if (existing) {
            console.log(`⏩ Skipping ${file.name} (Already indexed)`);
            continue;
        }

        try {
            // 2. Download photo
            const { data: blob } = await supabase.storage.from('event-photos').download(path);
            const img = await canvas.loadImage(Buffer.from(await blob.arrayBuffer()));

            // 3. Detect Faces
            const detections = await faceapi.detectAllFaces(img).withFaceLandmarks().withFaceDescriptors();

            if (detections.length === 0) {
                console.log(`⚪ ${file.name}: No faces detected.`);
                continue;
            }

            // 4. Save Embeddings
            const uploads = detections.map(d => ({
                hall_id: hallId,
                photo_path: path,
                embedding: `[${d.descriptor.join(',')}]` // Vector format
            }));

            const { error: saveError } = await supabase.from('face_encodings').insert(uploads);
            if (saveError) throw saveError;

            console.log(`✅ ${file.name}: Indexed ${detections.length} face(s).`);
        } catch (err) {
            console.error(`❌ Error indexing ${file.name}:`, err.message);
        }
    }

    console.log('✨ Gallery Indexing Complete!');
}

// RUN SCRIPT
(async () => {
    await initAI();
    // Replace with your currentHall.id
    const HALL_ID = 'YOUR_HALL_ID_HERE';
    await indexGallery(HALL_ID);
})();
