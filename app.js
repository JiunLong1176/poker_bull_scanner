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
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = canvas.toDataURL('image/jpeg').split(',')[1];

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

    // 5. Tesseract.js Integration
    async function identifyCards(base64Image) {
        try {
            // Tesseract.js works with image URLs or base64
            // We need to add the prefix for base64 if it's missing, though our caller passes raw base64 usually
            // but Tesseract.recognize handles various inputs.
            // Let's ensure we pass a valid image source.
            const imageSrc = `data:image/jpeg;base64,${base64Image}`;

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
                    }
                }
            );

            const fullText = result.data.text;
            console.log("Recognized Text:", fullText);
            
            const detected = parseCardsFromText(fullText);
            
            if (detected.length < 5) {
                console.warn(`Only found ${detected.length} cards:`, detected);
            }
            
            // If completely failed to find enough cards, we might want to throw or return partial
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
        
        // Strategy: Improve noise filtering.
        // Tesseract often misinterprets random noise as single characters (like 'I' as '1', 'O' as '0', etc.)
        // We will stricter parsing.
        
        // 1. Clean the text: remove all non-alphanumeric characters except spaces
        let cleanText = text.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ');
        
        // 2. Split by whitespace to check for isolated tokens first (often cards are distinct)
        const tokens = cleanText.split(/\s+/);
        const detected = [];

        // Helper to add if valid and not over limit
        const addCard = (c) => {
            if (detected.length < 5 && validCards.includes(c)) {
                detected.push(c);
            }
        };

        // 3. Process tokens
        tokens.forEach(token => {
            if (detected.length >= 5) return;

            // Direct match (e.g., "10", "K", "A")
            if (validCards.includes(token)) {
                addCard(token);
                return;
            }

            // If token is stuck together like "10JQKA", try to split
            // But be careful of noise like "A123" which might just be garbage
            // We only split if the token is relatively short to avoid reading a whole paragraph of noise
            if (token.length > 1 && token.length < 10) {
                 // Check for '10' specifically inside the token
                 let tempToken = token;
                 while(tempToken.includes('10') && detected.length < 5) {
                     addCard('10');
                     tempToken = tempToken.replace('10', '');
                 }
                 
                 // Check remaining chars
                 for (const char of tempToken) {
                     addCard(char);
                 }
            }
        });
        
        // If we found too few, do a desperate scan of the raw string but be stricter about noise
        // (Previously we just took ANY matching char, which caused the "table scanning" issue)
        if (detected.length < 5) {
             // If we have very little confidence (mostly noise), it's better to return empty
             // than to hallucinate a hand.
             // Heuristic: If we found 0-2 cards from tokens, maybe it's just noise.
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
