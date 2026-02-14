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

    // Correction Modal Elements
    const correctionModal = document.getElementById('correction-modal');
    const closeCorrectionBtn = document.getElementById('close-correction');
    let currentEditingIndex = -1;
    let currentResultCards = [];

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

    // 5. Roboflow Integration
    const ROBOFLOW_API_KEY = 'a0lZzrkziIcH6witAMUQ';
    const ROBOFLOW_MODEL = 'playing-cards-ow27d/1'; // Public model for playing cards
    const ROBOFLOW_URL = `https://detect.roboflow.com/${ROBOFLOW_MODEL}?api_key=${ROBOFLOW_API_KEY}`;

    async function identifyCards(base64Image) {
        try {
            const loadingText = document.querySelector('#loading p');
            if (loadingText) loadingText.textContent = `Analyzing with Roboflow...`;

            // Roboflow Inference API
            const response = await fetch(ROBOFLOW_URL, {
                method: "POST",
                body: base64Image,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            });

            if (!response.ok) {
                throw new Error(`Roboflow API Error: ${response.statusText}`);
            }

            const result = await response.json();
            console.log("Roboflow Result:", result);

            if (!result.predictions || result.predictions.length === 0) {
                throw new Error('No cards detected');
            }

            // Process predictions
            // 1. Sort by confidence (descending)
            // 2. Take top 5
            // 3. Extract rank from class name (e.g. "10H" -> "10")
            
            const validRanks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            
            const detected = result.predictions
                .sort((a, b) => b.confidence - a.confidence)
                .slice(0, 5)
                .map(p => {
                    // Class names are usually like "10H", "AH", "QD"
                    // We need to strip the suit.
                    // Regex: Look for 10 or single digit/letter at start
                    const match = p.class.match(/^(10|[2-9]|[JQKA])/i);
                    return match ? match[0].toUpperCase() : null;
                })
                .filter(rank => rank !== null && validRanks.includes(rank));

            if (detected.length < 5) {
                console.warn(`Only found ${detected.length} cards:`, detected);
            }

            return detected;

        } catch (error) {
            console.error('Vision API Error:', error);
            throw error;
        }
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

        // 2. Variant Rule Check: "3 can be 6" AND "6 can be 3" (Bidirectional)
        // User specific rules: 3 can substitute 6, and 6 can substitute 3.
        
        // Find indices of all '3's and '6's
        const indicesOf3 = [];
        const indicesOf6 = [];
        
        cards.forEach((c, idx) => {
            if (c === '3') indicesOf3.push(idx);
            if (c === '6') indicesOf6.push(idx);
        });

        const variableIndices = [...indicesOf3, ...indicesOf6];

        if (variableIndices.length > 0) {
            // Permutations for all variable cards (3s and 6s)
            // Each card at these indices can be either 3 or 6.
            const numPermutations = 1 << variableIndices.length;
            
            for (let i = 0; i < numPermutations; i++) {
                const newValues = [...baseValues];
                
                for (let bit = 0; bit < variableIndices.length; bit++) {
                    // index in original array
                    const idx = variableIndices[bit];
                    
                    // If bit is 0, use 3. If bit is 1, use 6.
                    // (Or swap logic, just need to cover both states)
                    if ((i >> bit) & 1) {
                        newValues[idx] = 6;
                    } else {
                        newValues[idx] = 3;
                    }
                }
                
                const outcome = solve(newValues);
                
                if (outcome.type === 'Bull') {
                     if (bestOutcome.type === 'No Bull' || outcome.value > bestOutcome.value) {
                         bestOutcome = outcome;
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

        // Store current cards for editing
        currentResultCards = [...cards];

        // Show detected cards
        cards.forEach((card, index) => {
            const span = document.createElement('span');
            span.className = 'card';
            span.textContent = card;
            span.style.cursor = 'pointer'; // Indicate clickability
            
            // Add click listener to edit this specific card
            span.addEventListener('click', () => {
                openCorrectionModal(index);
            });
            
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

    // --- CORRECTION LOGIC ---
    function openCorrectionModal(index) {
        currentEditingIndex = index;
        correctionModal.classList.remove('hidden');
    }

    document.querySelectorAll('.correct-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentEditingIndex > -1) {
                const newVal = btn.dataset.val;
                currentResultCards[currentEditingIndex] = newVal;
                
                // Recalculate with new card
                const newResult = calculateBull(currentResultCards);
                
                // Update display
                displayResults(currentResultCards, newResult);
                
                // Close modal
                correctionModal.classList.add('hidden');
            }
        });
    });

    if (closeCorrectionBtn) {
        closeCorrectionBtn.addEventListener('click', () => {
            correctionModal.classList.add('hidden');
        });
    }
});
