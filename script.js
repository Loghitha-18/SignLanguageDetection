// DOM Elements
const video = document.getElementById('video');
const startButton = document.getElementById('startButton');
const captureButton = document.getElementById('captureButton');
const loadingIndicator = document.getElementById('loading-indicator');
const detectionOverlay = document.getElementById('detection-overlay');
const detectionLabel = document.getElementById('detection-label');
const statusElement = document.getElementById('status');
const statusText = document.querySelector('.status-text');
const detectionList = document.getElementById('detection-list');
const alertOverlay = document.getElementById('alert-overlay');
const alertMessage = document.getElementById('alert-message');
const acknowledgeButton = document.getElementById('acknowledgeDanger');
const autoDetectCheckbox = document.getElementById('autoDetectCheckbox');
const subtitlesContainer = document.getElementById('subtitles-container');

// Configuration
const GEMINI_API_KEY = 'AIzaSyD6-qdVAj4Oe7Ncag5_wenp3phIHic-8sE'; // Replace with your actual API key
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'; // Updated to 1.5-flash model
const dangerSigns = ['danger', 'help', 'emergency', 'fire', 'stop'];
const maxDetectionHistory = 10;
const detectionInterval = 2000; // Auto detection every 2 seconds

//Twilio Configuration
const TWILIO_ACCOUNT_SID = 'ACf5f6f5141d1c4e4caab421e2286a1a3c'; // Replace with your Twilio Account SID
const TWILIO_AUTH_TOKEN = 'f06d847dc8cac492d5f5633c0d777926'; // Replace with your Twilio Auth Token
const TWILIO_PHONE_NUMBER = '+19895141369'; // Replace with your Twilio phone number
const MOBILE_NUMBERS = [
    '+919626148605', // Replace with first mobile number
    '+916380401249', // Replace with second mobile number
    '+918610621653'  // Replace with third mobile number
];

// State
let stream = null;
let isDetecting = false;
let detectionHistory = [];
let autoDetectionTimer = null;
let currentSentence = [];
let lastDetectionTime = 0;
let userLocation = null;
let consecutiveDetections = {}; // Track consecutive detections for confidence boosting

// Initialize loading state
loadingIndicator.style.display = 'none';

// Event Listeners
startButton.addEventListener('click', toggleCamera);
captureButton.addEventListener('click', captureAndDetect);
acknowledgeButton.addEventListener('click', closeAlert);
autoDetectCheckbox.addEventListener('change', toggleAutoDetection);

// Check for stored detection history
loadDetectionHistory();

// Start tracking user location
initializeLocationTracking();

// Functions
function initializeLocationTracking() {
    if (navigator.geolocation) {
        // Get initial location
        navigator.geolocation.getCurrentPosition(
            position => {
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                console.log('Initial location acquired:', userLocation);
            },
            error => {
                console.error('Error getting location:', error);
                alert('Unable to access your location. Location will not be included in alerts.');
            },
            { enableHighAccuracy: true }
        );
        
        // Continue watching position for updates
        navigator.geolocation.watchPosition(
            position => {
                userLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };
                console.log('Location updated:', userLocation);
            },
            error => {
                console.error('Error watching location:', error);
            },
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 27000 }
        );
    } else {
        console.error('Geolocation is not supported by this browser');
    }
}

// Get formatted location for messaging
function getFormattedLocation() {
    if (!userLocation) return "Location unavailable";
    
    const mapsUrl = `https://maps.google.com/maps?q=${userLocation.latitude},${userLocation.longitude}`;
    return `Location: ${mapsUrl} (accurate to ${Math.round(userLocation.accuracy)}m)`;
}

async function toggleCamera() {
    if (stream) {
        // Stop the camera and auto detection
        stopAutoDetection();
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.srcObject = null;
        startButton.innerHTML = '<i class="fas fa-play"></i> Start Camera';
        captureButton.disabled = true;
        autoDetectCheckbox.disabled = true;
        updateStatus('idle');
    } else {
        // Start the camera
        try {
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                } 
            });
            video.srcObject = stream;
            startButton.innerHTML = '<i class="fas fa-stop"></i> Stop Camera';
            captureButton.disabled = false;
            autoDetectCheckbox.disabled = false;
            updateStatus('detecting');
            
            // Start auto detection if the checkbox is checked
            if (autoDetectCheckbox.checked) {
                startAutoDetection();
            }
        } catch (err) {
            console.error('Error accessing camera:', err);
            alert('Could not access the camera. Please check permissions and try again.');
        }
    }
}

function toggleAutoDetection() {
    if (autoDetectCheckbox.checked && stream) {
        startAutoDetection();
    } else {
        stopAutoDetection();
    }
}

function startAutoDetection() {
    if (autoDetectionTimer) return; // Already running
    
    autoDetectionTimer = setInterval(() => {
        if (!isDetecting && stream) {
            captureAndDetect();
        }
    }, detectionInterval);
    
    console.log('Auto detection started');
}

function stopAutoDetection() {
    if (autoDetectionTimer) {
        clearInterval(autoDetectionTimer);
        autoDetectionTimer = null;
        console.log('Auto detection stopped');
    }
}

async function captureAndDetect() {
    if (!stream || isDetecting) return;
    
    isDetecting = true;
    loadingIndicator.style.display = 'flex';
    captureButton.disabled = true;
    
    try {
        // Take multiple captures for better accuracy
        const results = [];
        const capturesToTake = 2; // Take 2 captures
        
        for (let i = 0; i < capturesToTake; i++) {
            // Create a canvas to capture the current video frame
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert the canvas to base64 image data
            const imageData = canvas.toDataURL('image/jpeg').split(',')[1];
            
            // Call Gemini API to detect sign language
            const signDetected = await detectSignLanguage(imageData);
            results.push(signDetected);
            
            // If not the last capture, wait a small delay
            if (i < capturesToTake - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }
        
        // Choose the result with the highest confidence
        const bestResult = results.reduce((best, current) => 
            current.confidence > best.confidence ? current : best, results[0]);
        
        // Apply confidence boosting with consecutive detections
        const boostedResult = boostConfidence(bestResult);
        
        // Display the result
        showDetectionResult(boostedResult);
        
        // Update subtitles
        updateSubtitles(boostedResult);
        
        // Check if it's a danger sign
        if (isDangerSign(boostedResult.sign)) {
            triggerDangerAlert(boostedResult.sign);
            updateStatus('danger');
        }
        
    } catch (error) {
        console.error('Detection error:', error);
        alert('An error occurred during detection. Please try again.');
    } finally {
        loadingIndicator.style.display = 'none';
        captureButton.disabled = false;
        isDetecting = false;
    }
}

// Function to boost confidence based on consecutive detections
function boostConfidence(result) {
    const key = result.sign.toLowerCase();
    const now = Date.now();
    
    // Skip boosting for "Unknown" results
    if (key === 'unknown') {
        return result;
    }
    
    // Clear old entries (older than 5 seconds)
    Object.keys(consecutiveDetections).forEach(k => {
        if (now - consecutiveDetections[k].lastSeen > 5000) {
            delete consecutiveDetections[k];
        }
    });
    
    // Check if we've seen this sign recently
    if (consecutiveDetections[key]) {
        // Update the entry
        consecutiveDetections[key].count++;
        consecutiveDetections[key].lastSeen = now;
        
        // More aggressive boost for emergency signs
        const boostFactor = isDangerSign(key) ? 0.08 : 0.05;
        
        // Boost confidence (max 97%)
        const boostedConfidence = Math.min(0.97, 
            result.confidence + (consecutiveDetections[key].count * boostFactor));
            
        console.log(`Boosted confidence for "${key}" from ${result.confidence} to ${boostedConfidence} (seen ${consecutiveDetections[key].count} times)`);
        
        return {
            ...result,
            confidence: boostedConfidence,
            boosted: true
        };
    } else {
        // First time seeing this sign
        consecutiveDetections[key] = {
            count: 1,
            lastSeen: now
        };
        return result;
    }
}
async function detectSignLanguage(imageData) {
    // First apply preprocessing to enhance hand visibility
    const processedImageData = await preprocessImage(imageData);
    
    // Structure the request body for Gemini API with improved prompt
    const requestBody = {
        contents: [{
            parts: [
                {
                    text: "You are an expert sign language interpreter. Analyze this image carefully and identify ANY American Sign Language (ASL) gesture shown. Focus specifically on hand position, finger configuration, and orientation. Respond with ONLY the word, phrase, or letter represented by the sign:\n\n- If it's a letter: respond with 'LETTER:X' (where X is the letter)\n- If it's a word/phrase: respond only with that word (e.g., 'hello', 'thank you')\n- If it's a number: respond with 'NUMBER:X' (where X is the number)\n- If it's an emergency sign like 'help', 'danger', 'emergency', 'fire', or 'stop': respond ONLY with that exact word\n\nIf you cannot confidently identify the sign, respond with 'Unknown'. Do not include any explanations or additional text in your response."
                },
                {
                    inline_data: {
                        mime_type: "image/jpeg",
                        data: processedImageData  // Use the processed image instead of raw
                    }
                }
            ]
        }],
        generationConfig: {
            temperature: 0.1,  // Lower temperature for more consistent results
            maxOutputTokens: 20,  // Limit tokens since we just need a short response
            topP: 0.95,
            topK: 40
        }
    };

    try {
        console.log('Sending request to API with processed image...');
        
        // Make the API call
        const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('API Response Status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('API Error Response:', errorData);
            throw new Error(`API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        console.log('API Success Response:', data);
        
        // Check if the expected data structure exists
        if (!data.candidates || !data.candidates[0]?.content?.parts[0]?.text) {
            console.error('Unexpected API response structure:', data);
            throw new Error('Invalid API response structure');
        }
        
        const textResult = data.candidates[0].content.parts[0].text.trim();
        console.log('Raw detection result:', textResult);
        
        // Process the result
        let sign = textResult;
        let isAlphabet = false;
        let isNumber = false;
        let confidence = 0.85;  // Base confidence
        
        // Check if it's an alphabet letter
        if (sign.startsWith('LETTER:')) {
            sign = sign.replace('LETTER:', '').trim();
            isAlphabet = true;
        }
        
        // Check if it's a number
        if (sign.startsWith('NUMBER:')) {
            sign = sign.replace('NUMBER:', '').trim();
            isNumber = true;
        }
        
        // Clean up response - remove any extra text or formatting
        sign = sign.split('\n')[0].trim();
        
        // If the model added explanation or other text, extract just the first word
        if (sign.includes(' ') && !isDangerSign(sign)) {
            // But preserve known multi-word phrases
            const knownPhrases = ['thank you', 'i love you', 'good morning', 'good night', 'how are you'];
            if (!knownPhrases.some(phrase => sign.toLowerCase().includes(phrase))) {
                sign = sign.split(' ')[0];
            }
        }
        
        // For "Unknown" results, lower the confidence
        if (sign === 'Unknown' || sign === 'unknown' || sign.length > 20) {
            sign = 'Unknown';
            confidence = 0.3;
        }
        
        // Special handling for emergency signs - increase confidence
        if (isDangerSign(sign)) {
            confidence = 0.9;  // Higher confidence for emergency signs
        }
        
        return {
            sign: sign,
            isAlphabet: isAlphabet,
            isNumber: isNumber,
            confidence: confidence,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('Detection error details:', error);
        return {
            sign: 'Unknown',
            isAlphabet: false,
            isNumber: false,
            confidence: 0.2,
            timestamp: new Date().toISOString()
        };
    }
}


function showDetectionResult(result) {
    // Display the detection result on the video overlay
    detectionOverlay.style.display = 'block';
    
    // Show different label based on whether it's an alphabet or a word
    if (result.isAlphabet) {
        detectionLabel.textContent = `Letter: ${result.sign} (${Math.round(result.confidence * 100)}%)`;
    } else {
        detectionLabel.textContent = `Detected: ${result.sign} (${Math.round(result.confidence * 100)}%)`;
    }
    
    // Add visual indicator if confidence was boosted
    if (result.boosted) {
        detectionLabel.textContent += ' ⬆️';
    }
    
    // Add to detection history
    addToDetectionHistory(result);
    
    // Hide the detection label after 3 seconds
    setTimeout(() => {
        detectionOverlay.style.display = 'none';
    }, 3000);
}

function updateSubtitles(result) {
    const now = Date.now();
    
    // Only add to subtitles if the detection is confident enough
    if (result.confidence >= 0.7) {
        // If it's a letter, we want to build up a word
        if (result.isAlphabet) {
            // If there was a long pause, start a new word
            if (now - lastDetectionTime > 5000 && currentSentence.length > 0) {
                // Add a space to separate words
                currentSentence.push(' ');
            }
            
            // Add the letter to the current sentence
            currentSentence.push(result.sign);
        } else {
            // For non-alphabet signs, add a space and then the word
            if (currentSentence.length > 0) {
                currentSentence.push(' ');
            }
            currentSentence.push(result.sign);
        }
        
        // Update the subtitles display
        subtitlesContainer.textContent = currentSentence.join('');
        
        // Keep only the last 50 characters to avoid very long subtitles
        if (currentSentence.join('').length > 50) {
            // Remove characters from the beginning until we're under 50
            while (currentSentence.join('').length > 50) {
                currentSentence.shift();
            }
        }
    }
    
    // Update the last detection time
    lastDetectionTime = now;
}

function addToDetectionHistory(result) {
    // Add the new detection to history
    const isDanger = isDangerSign(result.sign);
    detectionHistory.unshift({
        ...result,
        isDanger: isDanger
    });
    
    // Limit history size
    if (detectionHistory.length > maxDetectionHistory) {
        detectionHistory.pop();
    }
    
    // Save to local storage
    saveDetectionHistory();
    
    // Update the UI
    updateDetectionHistoryUI();
}

function updateDetectionHistoryUI() {
    // Clear current list
    detectionList.innerHTML = '';
    
    // Add each detection to the list
    detectionHistory.forEach(item => {
        const li = document.createElement('li');
        const date = new Date(item.timestamp);
        const timeString = date.toLocaleTimeString();
        
        li.innerHTML = `
            <span class="${item.isDanger ? 'danger-item' : ''} ${item.isAlphabet ? 'alphabet-item' : ''}">${item.sign}</span>
            <span class="confidence">${Math.round(item.confidence * 100)}%</span>
            <span class="timestamp">${timeString}</span>
        `;
        
        detectionList.appendChild(li);
    });
}

function isDangerSign(sign) {
    // Check if the detected sign is in our list of danger signs
    return dangerSigns.some(dangerSign => 
        sign.toLowerCase().includes(dangerSign.toLowerCase())
    );
}

function triggerDangerAlert(sign) {
    // Show the danger alert overlay
    alertMessage.textContent = `A "${sign}" sign has been detected, which indicates danger. Please respond appropriately.`;
    alertOverlay.classList.remove('hidden');
    
    // Play alert sound
    playAlertSound();
    
    // Send SMS alerts to all configured numbers
    sendSMSAlert(sign)
        .then(result => {
            // Create notification element
            const smsNotification = document.createElement('p');
            smsNotification.className = 'sms-notification';
            
            if (result.overallSuccess) {
                // At least one SMS was sent successfully
                if (result.allSent) {
                    smsNotification.textContent = `Emergency SMS alerts sent to all ${result.sentTo.length} contacts`;
                } else {
                    smsNotification.textContent = `Emergency SMS alerts sent to ${result.sentTo.length} of ${result.sentTo.length + result.failedTo.length} contacts`;
                }
                console.log('Emergency SMS alerts sent successfully');
            } else {
                // All SMS sending attempts failed
                smsNotification.textContent = 'Failed to send emergency SMS alerts';
                smsNotification.classList.add('error');
                console.error('All SMS alert attempts failed');
            }
            
            // Add notification to the alert overlay
            const alertBox = document.querySelector('.alert-box');
            alertBox.appendChild(smsNotification);
        });
}

async function sendSMSAlert(dangerSign) {
    const sentResults = [];
    const failedResults = [];
    
    // Get current location for the message
    const locationInfo = getFormattedLocation();
    
    // Create message body with location
    const messageBody = `ALERT: A "${dangerSign}" sign was detected by SignAlert at ${new Date().toLocaleTimeString()}. This may indicate an emergency situation. ${locationInfo}`;
    
    // Send to each number in parallel
    const sendPromises = MOBILE_NUMBERS.map(async (phoneNumber) => {
        try {
            // Create message payload
            const message = {
                to: phoneNumber,
                from: TWILIO_PHONE_NUMBER,
                body: messageBody
            };
            
            // Send request to Twilio API
            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
                },
                body: new URLSearchParams({
                    To: message.to,
                    From: message.from,
                    Body: message.body
                })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                console.log(`SMS alert sent successfully to ${phoneNumber}:`, result.sid);
                sentResults.push(phoneNumber);
                return { success: true, phoneNumber };
            } else {
                console.error(`Failed to send SMS to ${phoneNumber}:`, result);
                failedResults.push(phoneNumber);
                return { success: false, phoneNumber, error: result };
            }
        } catch (error) {
            console.error(`Error sending SMS alert to ${phoneNumber}:`, error);
            failedResults.push(phoneNumber);
            return { success: false, phoneNumber, error };
        }
    });
    
    // Wait for all SMS sending attempts to complete
    await Promise.all(sendPromises);
    
    // Return overall status and details
    return {
        overallSuccess: sentResults.length > 0,
        sentTo: sentResults,
        failedTo: failedResults,
        allSent: failedResults.length === 0
    };
}

function closeAlert() {
    // Hide the alert overlay
    alertOverlay.classList.add('hidden');
    
    // Remove any SMS notifications that were added
    const smsNotifications = document.querySelectorAll('.sms-notification');
    smsNotifications.forEach(notification => notification.remove());
    
    updateStatus('detecting');
}

function updateStatus(status) {
    // Update the status indicator
    statusElement.className = `status ${status}`;
    
    if (status === 'idle') {
        statusText.textContent = 'Idle';
    } else if (status === 'detecting') {
        statusText.textContent = 'Ready to Detect';
    } else if (status === 'danger') {
        statusText.textContent = 'Danger Detected';
    }
}

function playAlertSound() {
    // Play the danger.mp3 sound file
    try {
        const audio = new Audio('danger.mp3');
        audio.volume = 0.8;
        
        // Add event handlers to log success or failure
        audio.onplay = () => console.log('Alert sound started playing');
        audio.onended = () => console.log('Alert sound finished playing');
        audio.onerror = (err) => console.error('Error playing alert sound:', err);
        
        // Play the sound
        const playPromise = audio.play();
        
        // Handle promise rejection (required for some browsers)
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.error('Could not play alert sound:', err);
            });
        }
    } catch (err) {
        console.error('Could not create audio element:', err);
    }
}

function clearSubtitles() {
    // Clear the current sentence and update display
    currentSentence = [];
    subtitlesContainer.textContent = '';
}

function saveDetectionHistory() {
    // Save detection history to local storage
    try {
        localStorage.setItem('signAlertHistory', JSON.stringify(detectionHistory));
    } catch (error) {
        console.error('Error saving detection history:', error);
    }
}

function loadDetectionHistory() {
    // Load detection history from local storage
    try {
        const savedHistory = localStorage.getItem('signAlertHistory');
        if (savedHistory) {
            detectionHistory = JSON.parse(savedHistory);
            updateDetectionHistoryUI();
        }
    } catch (error) {
        console.error('Error loading detection history:', error);
        // If there's an error, initialize with empty history
        detectionHistory = [];
    }
}

// Create custom function to preprocess image before sending to API
function preprocessImage(imageData) {
    return new Promise((resolve) => {
        // Create an image to load the data
        const img = new Image();
        img.onload = () => {
            // Create a canvas for processing
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            
            // Draw the original image
            ctx.drawImage(img, 0, 0);
            
            // Get image data for processing
            const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageDataObj.data;
            
            // Apply enhanced contrast for better hand visibility
            const factor = 1.3; // Increased contrast factor
            const intercept = 128 * (1 - factor);
            
            for (let i = 0; i < data.length; i += 4) {
                // Apply contrast to RGB channels
                data[i] = Math.min(255, Math.max(0, factor * data[i] + intercept)); // R
                data[i + 1] = Math.min(255, Math.max(0, factor * data[i + 1] + intercept)); // G
                data[i + 2] = Math.min(255, Math.max(0, factor * data[i + 2] + intercept)); // B
                // Alpha channel remains unchanged
            }
            
            // Put the processed data back
            ctx.putImageData(imageDataObj, 0, 0);
            
            // Return the processed image data
            resolve(canvas.toDataURL('image/jpeg').split(',')[1]);
        };
        
        // Load the image
        img.src = `data:image/jpeg;base64,${imageData}`;
    });
}

// Initialize app on page load
document.addEventListener('DOMContentLoaded', () => {
    // Display version info
    console.log('SignAlert system v1.2.0 initialized (with location tracking and improved detection)');
    
    // Check camera permissions on startup
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'camera' })
            .then(permissionStatus => {
                if (permissionStatus.state === 'granted') {
                    console.log('Camera permission already granted');
                } else {
                    console.log('Camera permission status:', permissionStatus.state);
                }
            })
            .catch(error => {
                console.error('Error checking camera permission:', error);
            });
    }
    
    // Check location permissions
    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' })
            .then(permissionStatus => {
                if (permissionStatus.state === 'granted') {
                    console.log('Location permission already granted');
                } else {
                    console.log('Location permission status:', permissionStatus.state);
                    // Prompt for location if not already granted
                    initializeLocationTracking();
                }
            })
            .catch(error => {
                console.error('Error checking location permission:', error);
            });
    }
});