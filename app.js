document.addEventListener('DOMContentLoaded', () => {
    // 1. Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.error('SW failed:', err));
    }

    // 2. UI Elements
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('capture-canvas');
    const scanBtn = document.getElementById('scan-btn');
    const loadingDiv = document.getElementById('loading');
    const resultContainer = document.getElementById('result-container');
    const closeResultsBtn = document.getElementById('close-results');
    const cardsDetectedDiv = document.getElementById('cards-detected');
    const bullCalculationDiv = document.getElementById('bull-calculation');
    const finalResultDiv = document.getElementById('final-result');
    const cameraErrorDiv = document.getElementById('camera-error');
    const retryCameraBtn = document.getElementById('retry-camera');

    // 3. Camera Initialization
    async function initCamera() {
        try {
            cameraErrorDiv.classList.add('hidden');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            video.srcObject = stream;
        } catch (err) {
            console.error('Camera access denied:', err);
            cameraErrorDiv.classList.remove('hidden');
        }
    }

    initCamera();

    retryCameraBtn.addEventListener('click', initCamera);

    // 4. Scan Button Handler
    scanBtn.addEventListener('click', async () => {
        loadingDiv.classList.remove('hidden');
        resultContainer.classList.add('hidden');
        scanBtn.disabled = true;

        try {
            // Capture frame
            const context = canvas.getContext('2d');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            // Enhancement: Draw grayscale/high contrast for better OCR?
            // For now, let's just capture standard.
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // To improve accuracy, we might want to crop to the center "scan area"
            // Since we added a visual guide, users will put cards there.
            // Let's crop to the center 80% to reduce background noise.
            const cropWidth = canvas.width * 0.9;
            const cropHeight = canvas.height * 0.4; // Approx height of scan box
            const cropX = (canvas.width - cropWidth) / 2;
            const cropY = (canvas.height - cropHeight) / 2; // Roughly center
            
            // Create a temp canvas for the cropped image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = cropWidth;
            tempCanvas.height = cropHeight;
            const tempCtx = tempCanvas.getContext('2d');
            
            // Draw only the center part
            tempCtx.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

            // Use the cropped image for OCR
            const imageData = tempCanvas.toDataURL('image/jpeg').split(',')[1];

            // Call Vision API
            const cards = await identifyCards(imageData);
            
            // Calculate Bull
            const result = calculateBull(cards);
            
            // Display Results
            displayResults(cards, result);

        } catch (error) {
            console.error('Scan failed:', error);
            // Check if it's our specific "No cards" error
            if (error.message === 'No cards detected via OCR') {
                 displayResults([], { type: 'Error', message: 'No cards detected. Please try again closer or with better lighting.' });
                 resultContainer.classList.remove('hidden'); // Ensure results are shown
            } else {
                 alert('Failed to scan: ' + error.message);
            }
        } finally {
            loadingDiv.classList.add('hidden');
            resultContainer.classList.remove('hidden');
            scanBtn.disabled = false;
        }
    });

    closeResultsBtn.addEventListener('click', () => {
        resultContainer.classList.add('hidden');
    });

    // 5. Tesseract.js Integration (Optimized)
    async function identifyCards(base64Image) {
        try {
            const imageSrc = `data:image/jpeg;base64,${base64Image}`;
            
            // Pre-process image? (Enhancement for later: use canvas to increase contrast/grayscale)

            const result = await Tesseract.recognize(
                imageSrc,
                'eng',
                {
                    logger: m => {
                        console.log(m);
                        if (m.status === 'recognizing text') {
                            const loadingText = document.querySelector('#loading p');
                            if (loadingText) loadingText.textContent = `Analyzing... ${Math.round(m.progress * 100)}%`;
                        }
                    },
                    // Improve accuracy for card text
                    // psm 6 = Assume a single uniform block of text (good for cards aligned in a row)
                    tessedit_pageseg_mode: '6',
                    // whitelist only card characters
                    tessedit_char_whitelist: '0123456789AJQK'
                }
            );

            const fullText = result.data.text;
            console.log("Recognized Text:", fullText);
            
            const detected = parseCardsFromText(fullText);
            
            // Validation: Ensure we found exactly 5 cards. If not, maybe retry or ask user.
            if (detected.length < 5) {
                console.warn(`Only found ${detected.length} cards:`, detected);
                 // If we found say 3 or 4 cards, we might want to show them and ask user to rescan or edit?
                 // For now, let's just return what we found but user will see incomplete result.
            }
            
            if (detected.length === 0) {
                 throw new Error('No cards detected via OCR');
            }

            return detected;

        } catch (error) {
            console.error('OCR Error:', error);
            throw error;
        }
    }

    function parseCardsFromText(text) {
        const validCards = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        
        // Pre-cleaning: Fix common OCR mistakes specifically for playing cards
        let cleanText = text.toUpperCase()
            .replace(/1O/g, '10') // O instead of 0
            .replace(/l/g, '1')   // l instead of 1 (though 1 isn't a card, it might be part of 10)
            .replace(/S/g, '5')   // S often mistaken for 5
            .replace(/Z/g, '2')   // Z often mistaken for 2
            .replace(/O/g, '0');  // O often mistaken for 0
            
        // 1. Look specifically for "10" first as it's the only 2-digit card
        const detected = [];
        
        // Extract all occurrences of '10' first
        const tens = cleanText.match(/10/g);
        if (tens) {
            tens.forEach(() => {
                if(detected.length < 5) detected.push('10');
            });
            cleanText = cleanText.replace(/10/g, ''); // Remove found 10s
        }

        // 2. Look for remaining single characters
        // We only care about valid card characters now
        const chars = cleanText.replace(/[^2-9AJQK]/g, '').split('');
        
        for (const char of chars) {
            if (detected.length >= 5) break;
            detected.push(char);
        }

        return detected;
    }

    // 6. Poker Bull Logic & Display
    function getCardValue(card) {
        if (['J', 'Q', 'K'].includes(card)) return 10;
        if (card === 'A') return 1;
        return parseInt(card, 10);
    }

    function calculateBull(cards) {
        if (cards.length < 5) {
            return { type: 'Error', message: `Found only ${cards.length} cards.` };
        }

        const values = cards.map(getCardValue);
        const sum = values.reduce((a, b) => a + b, 0);

        for (let i = 0; i < 5; i++) {
            for (let j = i + 1; j < 5; j++) {
                for (let k = j + 1; k < 5; k++) {
                    const subSum = values[i] + values[j] + values[k];
                    if (subSum % 10 === 0) {
                        const remainingSum = sum - subSum;
                        let bull = remainingSum % 10;
                        if (bull === 0) bull = 10;
                        
                        return {
                            type: 'Bull',
                            value: bull,
                            combo: [cards[i], cards[j], cards[k]], // Indices would be safer but cards are strings
                            remainder: cards.filter((_, idx) => ![i, j, k].includes(idx))
                        };
                    }
                }
            }
        }
        return { type: 'No Bull', value: 0 };
    }

    function displayResults(cards, result) {
        // Clear previous
        cardsDetectedDiv.innerHTML = '';
        finalResultDiv.innerHTML = '';
        bullCalculationDiv.innerHTML = '';

        // Show detected cards
        cards.forEach(card => {
            const span = document.createElement('span');
            span.className = 'card';
            span.textContent = card;
            cardsDetectedDiv.appendChild(span);
        });

        // Show Result
        if (result.type === 'Error') {
            finalResultDiv.textContent = result.message;
            finalResultDiv.style.color = 'red';
        } else if (result.type === 'No Bull') {
            finalResultDiv.textContent = 'No Bull 🐮';
            finalResultDiv.style.color = '#ccc';
            bullCalculationDiv.innerHTML = '<p>No combination sums to multiple of 10.</p>';
        } else {
            const bullText = result.value === 10 ? 'BULL BULL! 🐂' : `Bull ${result.value} 🐮`;
            finalResultDiv.textContent = bullText;
            finalResultDiv.style.color = '#FFC107'; // Accent
            
            bullCalculationDiv.innerHTML = `
                <p>Combo: ${result.combo.join('+')} = ${result.combo.reduce((a,c)=>a+getCardValue(c),0)}</p>
                <p>Points: ${result.remainder.join('+')} = ${result.remainder.reduce((a,c)=>a+getCardValue(c),0)}</p>
            `;
        }
    }
});
