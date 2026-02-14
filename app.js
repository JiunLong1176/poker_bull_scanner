document.addEventListener('DOMContentLoaded', () => {
    // 1. Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.error('SW failed:', err));
    }

    // 2. UI Elements
    // Views
    const scannerView = document.getElementById('scanner-view');
    const manualView = document.getElementById('manual-view');
    const modeScanBtn = document.getElementById('mode-scan');
    const modeManualBtn = document.getElementById('mode-manual');

    // Scanner Elements
    const video = document.getElementById('camera-stream');
    const canvas = document.getElementById('capture-canvas');
    const scanBtn = document.getElementById('scan-btn');
    const uploadBtn = document.getElementById('upload-btn'); // New
    const fileUpload = document.getElementById('file-upload'); // New
    const cameraErrorDiv = document.getElementById('camera-error');
    const retryCameraBtn = document.getElementById('retry-camera');

    // Manual Elements
    const cardSlots = document.querySelectorAll('.card-slot');
    // Removed duplicate declaration of keyBtns and clearBtn here to avoid conflict
    // They are selected inside the logic blocks or via specific selectors
    const manualSubmitBtn = document.getElementById('manual-submit-btn');

    // Shared Elements
    const loadingDiv = document.getElementById('loading');
    const resultContainer = document.getElementById('result-container');
    const closeResultsBtn = document.getElementById('close-results');
    const cardsDetectedDiv = document.getElementById('cards-detected');
    const bullCalculationDiv = document.getElementById('bull-calculation');
    const finalResultDiv = document.getElementById('final-result');

    // State for Manual Mode
    let manualCards = [];

    // --- MODE SWITCHING ---
    // Initialize Manual Mode as default
    // We do this by simulating a click or setting classes directly
    // Let's set manual active by default
    
    function switchMode(mode) {
        if (mode === 'scan') {
            scannerView.classList.remove('hidden');
            manualView.classList.add('hidden');
            modeScanBtn.classList.add('active');
            modeManualBtn.classList.remove('active');
            initCamera(); // Ensure camera is running
        } else {
            scannerView.classList.add('hidden');
            manualView.classList.remove('hidden');
            modeScanBtn.classList.remove('active');
            modeManualBtn.classList.add('active');
            
            // Stop camera stream if active to save resources?
            if (video.srcObject) {
                const tracks = video.srcObject.getTracks();
                tracks.forEach(track => track.stop());
                video.srcObject = null;
            }
        }
    }
    
    // Bind listeners
    modeScanBtn.addEventListener('click', () => switchMode('scan'));
    modeManualBtn.addEventListener('click', () => switchMode('manual'));

    // Set default mode: Manual
    switchMode('manual');

    // --- MANUAL INPUT LOGIC ---
    
    // Separate listener for valid card keys only
    // Exclude action buttons by ID or class logic if needed,
    // but relying on data-val check is safer.
    document.querySelectorAll('.key-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = btn.dataset.val;
            // Only add if it has a value (action buttons like DEL don't have data-val)
            if (val && manualCards.length < 5) {
                manualCards.push(val);
                updateCardSlots();
            }
        });
    });

    // DEL Button (Remove last card)
    // Note: ID changed from clear-btn to del-btn in HTML
    const delBtnEl = document.getElementById('del-btn') || document.getElementById('clear-btn');
    if (delBtnEl) {
        delBtnEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (manualCards.length > 0) {
                manualCards.pop();
                updateCardSlots();
            }
        });
    }

    // CLEAR ALL Button
    const clearAllBtn = document.getElementById('clear-all-btn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            manualCards = []; // Reset array
            updateCardSlots();
        });
    }

    function updateCardSlots() {
        const slots = document.querySelectorAll('.card-slot');
        slots.forEach((slot, index) => {
            if (manualCards[index]) {
                slot.textContent = manualCards[index];
                slot.classList.add('filled');
            } else {
                slot.textContent = '';
                slot.classList.remove('filled');
            }
        });
        
        if(manualSubmitBtn) manualSubmitBtn.disabled = manualCards.length !== 5;
    }

    if (manualSubmitBtn) {
        manualSubmitBtn.addEventListener('click', () => {
            const result = calculateBull(manualCards);
            displayResults(manualCards, result);
            document.getElementById('result-container').classList.remove('hidden');
        });
    }

    // 3. Camera Initialization
    async function initCamera() {
        // Prevent starting camera if not in scan mode
        if (scannerView.classList.contains('hidden')) return;
        
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

    // Do NOT auto-start camera on load.
    // It's handled by switchMode() or manual click.
    // initCamera();

    retryCameraBtn.addEventListener('click', initCamera);

    // 4. Scan & Upload Handlers
    
    // Trigger file input
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            fileUpload.click();
        });
    }

    // Handle file selection
    if (fileUpload) {
        fileUpload.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            loadingDiv.classList.remove('hidden');
            resultContainer.classList.add('hidden');

            try {
                // 1. Read file as Image
                const img = new Image();
                const reader = new FileReader();
                
                await new Promise((resolve, reject) => {
                    reader.onload = (ev) => {
                        img.src = ev.target.result;
                        img.onload = () => resolve();
                        img.onerror = (err) => reject(err);
                    };
                    reader.readAsDataURL(file);
                });

                // 2. Draw image to canvas (to mimic video feed for consistency)
                // We resize canvas to match image dimensions temporarily
                const originalWidth = canvas.width;
                const originalHeight = canvas.height;
                
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // Show the canvas instead of video temporarily?
                // Or just process it. InferenceJS needs an HTMLImageElement or Canvas.
                // We can pass the 'img' object directly to inference.
                
                const cards = await identifyCards(img, true); // Pass true to indicate static image
                
                const result = calculateBull(cards);
                displayResults(cards, result);
                
                // Restore canvas dims if needed, or leave it showing the result
                // Actually identifyCards(img) will have drawn bounding boxes on 'canvas'
                // So we should make sure canvas is visible if video was hidden
                canvas.style.display = 'block';
                video.style.display = 'none';

            } catch (error) {
                console.error('Upload Scan failed:', error);
                alert('Scan failed: ' + error.message);
            } finally {
                loadingDiv.classList.add('hidden');
                resultContainer.classList.remove('hidden');
            }
        });
    }

    scanBtn.addEventListener('click', async () => {
        loadingDiv.classList.remove('hidden');
        resultContainer.classList.add('hidden');
        scanBtn.disabled = true;
        
        // Reset display to show video again if we were viewing a static image
        video.style.display = 'block';
        canvas.style.display = 'none';

        try {
            // Identify Cards (InferenceJS handles capture internally via video element)
            // We pass null for base64Image since identifyCards reads from 'video' directly now
            const cards = await identifyCards(null);
            
            // Note: identifyCards now draws the result (with bounding boxes) to 'canvas'
            // We don't need to manually capture/crop here anymore because InferenceJS
            // runs on the full frame and gives us bounding boxes.
            
            // Calculate Bull
            const result = calculateBull(cards);
            
            // Display Results
            displayResults(cards, result);

        } catch (error) {
            console.error('Scan failed:', error);
            // Check if it's our specific "No cards" error
            if (error.message === 'No cards detected' || error.message.includes('No cards')) {
                 displayResults([], { type: 'Error', message: 'No cards detected. Please try again closer or with better lighting.' });
                 document.getElementById('result-container').classList.remove('hidden');
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

    // 5. InferenceJS (Roboflow) Integration
    const API_KEY = "a0lZzrkziIcH6witAMUQ";
    const MODEL_NAME = "playing-cards-ow27d";
    const MODEL_VERSION = 4; // Updated to version 4 based on previous snippet

    var inferEngine = null;
    var modelWorkerId = null;

    // Initialize Engine on Load
    if (typeof inferencejs !== 'undefined') {
        inferEngine = new inferencejs.InferenceEngine();
        initModel();
    }

    async function initModel() {
        try {
            console.log("Loading Inference Engine...");
            modelWorkerId = await inferEngine.startWorker(MODEL_NAME, MODEL_VERSION, API_KEY);
            console.log("Model Worker Started:", modelWorkerId);
        } catch (err) {
            console.error("Failed to start model worker:", err);
        }
    }

    // Function to run a single detection on demand
    // sourceImage: optional HTMLImageElement (for upload). If null, uses 'video'.
    async function identifyCards(sourceImage, isStatic = false) {
        if (!modelWorkerId) {
            // Attempt to init if not ready
            await initModel();
            if (!modelWorkerId) throw new Error("Model failed to load. Check console.");
        }

        try {
            const inputSource = isStatic ? sourceImage : video;
            
            const predictions = await inferEngine.infer(modelWorkerId, new inferencejs.CVImage(inputSource));
            console.log("Predictions:", predictions);

            if (!predictions || predictions.length === 0) {
                throw new Error('No cards detected');
            }

            // Draw bounding boxes
            drawBoundingBoxes(predictions, inputSource);

            const validRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            
            const detected = predictions
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 5)
                .map(p => {
                    const label = p.class;
                    const match = label.match(/^(10|[2-9]|[JQKA])/i);
                    return match ? match[0].toUpperCase() : null;
                })
                .filter(rank => rank !== null && validRanks.includes(rank));

            if (detected.length < 5) {
                console.warn(`Only found ${detected.length} cards:`, detected);
            }

            return detected;

        } catch (error) {
            console.error('Inference Detection Error:', error);
            throw error;
        }
    }

    function drawBoundingBoxes(predictions, sourceElement) {
        const ctx = canvas.getContext("2d");
        
        // Match canvas dims to source
        const width = sourceElement.videoWidth || sourceElement.width;
        const height = sourceElement.videoHeight || sourceElement.height;
        
        canvas.width = width;
        canvas.height = height;
        
        // Draw the frame/image first
        ctx.drawImage(sourceElement, 0, 0, width, height);

        predictions.forEach(prediction => {
            const x = prediction.bbox.x - prediction.bbox.width / 2;
            const y = prediction.bbox.y - prediction.bbox.height / 2;
            const width = prediction.bbox.width;
            const height = prediction.bbox.height;

            // Draw the box
            ctx.strokeStyle = "#00FF00"; // Green color
            ctx.lineWidth = 4;
            ctx.strokeRect(x, y, width, height);

            // Draw the label background
            ctx.fillStyle = "#00FF00";
            const text = prediction.class + " " + Math.round(prediction.confidence * 100) + "%";
            const textWidth = ctx.measureText(text).width;
            ctx.fillRect(x, y - 25, textWidth + 10, 25);

            // Draw the text
            ctx.fillStyle = "black";
            ctx.font = "16px Arial";
            ctx.fillText(text, x + 5, y - 7);
        });
    }

    // 6. Poker Bull Logic & Display
    function getCardValue(card) {
        if (['J', 'Q', 'K'].includes(card)) return 10;
        if (card === 'A') return 1;
        return parseInt(card, 10);
    }

    // New Priority System for Bull Calculation
    // In Bull Bull (Niu Niu), sometimes multiple combos exist.
    // Usually, the best possible hand is the one that matters.
    // However, the standard rule is simply: If ANY 3 cards sum to a multiple of 10,
    // the remaining 2 determine the score.
    // If multiple combinations of 3 exist, do they result in different scores?
    // Let's trace:
    // Cards: 10, 10, 10, 3, 2
    // Values: 10, 10, 10, 3, 2. Total = 35.
    // Combo 1: 10+10+10 = 30 (Multiple of 10). Remainder: 3+2 = 5. Bull 5.
    // Combo 2: 10+3+??? No other 3-card combo sums to 10/20/30 easily?
    // Wait, let's re-read the user's claim: "10, 10, 10, 3, 2, suppose should be bull 8"
    // User says: "3 can change 6, 6+2 is 8" -> This sounds like a specific local variant or I misunderstood the user.
    // STANDARD RULES:
    // 3 cards sum to multiple of 10.
    // Remainder sums to X. Bull is X % 10.
    // User's example: 10, 10, 10, 3, 2.
    // 10+10+10=30. Remainder 3+2=5. Bull 5.
    // User claims Bull 8. Why? "3 can change 6"?
    // Ah, is the user playing a variant where "3" counts as "3 or 6"? Or maybe "3" and "6" are interchangeable?
    // OR, did the user mean specific cards?
    // "Review the entire calculation and correct it"
    // Let's stick to standard logic FIRST, but ensure we find the BEST bull if multiple exist.
    // Standard Bull Bull: Calculate total sum. If 3 cards sum % 10 == 0, then (Total - 3cards) % 10 is the bull.
    // (Total % 10) should be equal to (Remainder % 10).
    // So mathematically, if a Bull exists, the result is ALWAYS (Total Sum) % 10.
    // Let's verify:
    // Total = 35. 35 % 10 = 5.
    // Remainder = 5. 5 % 10 = 5.
    // So mathematically, if a valid 3-card combo exists, the Bull value is FIXED by the total sum.
    // There cannot be "different" bull results for the same hand in standard rules.
    // Unless the card values themselves are different (e.g. Gongpai rules where JQK are 10 but maybe face cards have score?)
    //
    // WAIT. If the user says "3 can change 6", that sounds like a very specific wildcard rule or "insane" rule.
    // "10, 10, 10, 3, 2".
    // If 3 becomes 6: 10, 10, 10, 6, 2.
    // 10+10+10=30. Remainder 6+2=8. Bull 8.
    // This implies a variant rule: "3 is a wildcard for 6" or similar?
    // Since I cannot ask for clarification easily without breaking flow, I will implement a flexible "Best Bull" search.
    // BUT, standard Niu Niu does not have "3 changes to 6".
    // Maybe the user meant the card "3" looks like "6" (OCR error)?
    // No, they entered manual input likely.
    // Let's assume the user knows their rules better than I do about this "3 -> 6" thing,
    // OR they might be confused.
    // However, looking at standard "Bull Bull", my code is correct (Bull 5).
    // If I want to support this specific request ("3 can change 6"), I'd have to code a variant.
    // "3 can change 6" -> Maybe 3 and 6 are interchangeable?
    // Let's assume standard rules first but check if I missed a "highest possible" logic.
    //
    // Actually, maybe the user implies the input was "10, 10, 10, 6, 2" but the OCR read it as 3?
    // "the result is incorrect cause if choose 10, 10, 10, 3, 2" -> They imply they CHOSE these.
    // If I must implement "3 counts as 3 OR 6", that's a big assumption.
    //
    // Alternative interpretation: "Bull 8" from 10,10,10,3,2?
    // 10+10+3+2 = 25? No.
    // 10+3+2 = 15? No.
    //
    // Let's look at the "User Message" again: "3 can change 6, 6+ 2 is 8".
    // This is explicitly stating a transformation rule.
    // "3 can become 6".
    // Is there a rule where 3 and 6 are swappable? Or maybe '3' and '6' look alike?
    // Or maybe this is "广东牛牛" or a specific variant?
    //
    // Since I must fix it according to user, I will implement a variant logic check:
    // If a card is '3', try it as '3' AND '6'.
    // See which yields the higher Bull.
    
    function calculateBull(cards) {
        if (cards.length < 5) {
            return { type: 'Error', message: `Found only ${cards.length} cards.` };
        }

        // Helper to solve for a specific set of values
        function solve(currentValues) {
            const sum = currentValues.reduce((a, b) => a + b, 0);
            let bestResult = { type: 'No Bull', value: 0 };

            for (let i = 0; i < 5; i++) {
                for (let j = i + 1; j < 5; j++) {
                    for (let k = j + 1; k < 5; k++) {
                        const subSum = currentValues[i] + currentValues[j] + currentValues[k];
                        if (subSum % 10 === 0) {
                            const remainingSum = sum - subSum;
                            let bull = remainingSum % 10;
                            if (bull === 0) bull = 10;
                            
                            // Found a bull. Is it better than what we have?
                            if (bestResult.type === 'No Bull' || bull > bestResult.value) {
                                bestResult = {
                                    type: 'Bull',
                                    value: bull,
                                    combo: [cards[i], cards[j], cards[k]],
                                    remainder: cards.filter((_, idx) => ![i, j, k].includes(idx))
                                };
                            }
                        }
                    }
                }
            }
            return bestResult;
        }

        // 1. Standard Calculation
        const baseValues = cards.map(getCardValue);
        let bestOutcome = solve(baseValues);

        // 2. Variant Rule Check: "3 can be 6" (and maybe 6 can be 3?)
        // The user specifically said "3 can change 6".
        // Let's generate permutations if there are 3s or 6s.
        // Actually, let's strictly follow "3 can change 6".
        // Does 6 change to 3? Usually these rules are bidirectional or specific.
        // Let's allow 3 -> 6 substitution to see if it improves the hand.
        
        const indicesOf3 = [];
        cards.forEach((c, idx) => { if (c === '3') indicesOf3.push(idx); });

        if (indicesOf3.length > 0) {
            // We have 3s. Let's try permutations where each 3 could be a 6.
            // 2^n permutations.
            const numPermutations = 1 << indicesOf3.length;
            
            for (let i = 1; i < numPermutations; i++) { // Start at 1 because 0 is original
                const newValues = [...baseValues];
                for (let bit = 0; bit < indicesOf3.length; bit++) {
                    if ((i >> bit) & 1) {
                        newValues[indicesOf3[bit]] = 6; // Swap value to 6
                    }
                }
                
                const outcome = solve(newValues);
                if (outcome.type === 'Bull') {
                     if (bestOutcome.type === 'No Bull' || outcome.value > bestOutcome.value) {
                         bestOutcome = outcome;
                         // Mark that we used a variant rule?
                         // bestOutcome.variant = "3 as 6";
                     }
                }
            }
        }
        
        return bestOutcome;
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
            let bullText = '';
            let color = '#FFC107'; // Default Gold

            if (result.type === '5 Ultimate Bulls') {
                bullText = 'ULTIMATE BULL! 👑';
                color = '#E91E63'; // Pink/Red for special
            } else if (result.value === 10) {
                bullText = 'BULL BULL! 🐂';
            } else {
                bullText = `Bull ${result.value} 🐮`;
            }

            finalResultDiv.textContent = bullText;
            finalResultDiv.style.color = color;
            
            // For 5 Ultimate, combo/remainder logic is trivial, maybe just show "All Face Cards"
            if (result.type === '5 Ultimate Bulls') {
                bullCalculationDiv.innerHTML = `<p>All J/Q/K cards!</p>`;
            } else {
                bullCalculationDiv.innerHTML = `
                    <p>Combo: ${result.combo.join('+')}</p>
                    <p>Points: ${result.remainder.join('+')}</p>
                `;
            }
        }
    }
});
