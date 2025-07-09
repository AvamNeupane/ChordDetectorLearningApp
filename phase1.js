// Guitar chord detection setup
const URL = "./my_model/";
let model, webcam, maxPredictions;
let isModelLoaded = false;
let isPracticing = false;

const gestureStrings = {
    'G': 'G',
    'A': 'A',
    'C': 'C'
};

// Wonderwall chord progression with timing and strumming
const chordProgression = [
    'G', 'A', 'C', 'G',
    'G', 'A', 'C', 'G',
    'A', 'C', 'G', 'A',
    'G', 'A', 'C', 'G'
];

// Each chord gets 4 beats (1 measure), strumming pattern repeats every 4 beats
const strummingPattern = ['D', 'D', 'U', 'D', 'D']; // DDUDD pattern
const beatsPerChord = 4;

let currentChordIndex = 0;
let correctChords = 0;
let totalAttempts = 0;
let startTime = null;
let timerInterval = null;

// Initialize the model and webcam
async function init() {
    try {
        const modelURL = URL + "model.json";
        const metadataURL = URL + "metadata.json";
        
        model = await tmImage.load(modelURL, metadataURL);
        maxPredictions = model.getTotalClasses();
        
        const flip = true;
        webcam = new tmImage.Webcam(640, 480, flip);
        await webcam.setup();
        await webcam.play();
        
        document.getElementById("webcam-container").appendChild(webcam.canvas);
        
        isModelLoaded = true;
        window.requestAnimationFrame(loop);
        
        document.getElementById('start-btn').disabled = false;
        document.getElementById('current-instruction').textContent = 'Model loaded! Click "Start Practice" to begin.';
        
    } catch (error) {
        console.error("Error initializing:", error);
        document.getElementById('current-instruction').textContent = 'Error loading model. Please check your model files.';
        document.getElementById('current-instruction').style.color = '#ff4444';
    }
}

async function loop() {
    if (webcam) {
        webcam.update();
        if (isPracticing) {
            await predict();
        }
        window.requestAnimationFrame(loop);
    }
}

async function predict() {
    const prediction = await model.predict(webcam.canvas);
    
    let bestPrediction = prediction[0];
    for (let i = 1; i < prediction.length; i++) {
        if (prediction[i].probability > bestPrediction.probability) {
            bestPrediction = prediction[i];
        }
    }
    
    if (bestPrediction.probability > 0.8) {
        const chordName = gestureStrings[bestPrediction.className];
        if (chordName) {
            document.getElementById('gesture-text').textContent = chordName;
            
            // Check if this is the correct chord
            if (chordName === chordProgression[currentChordIndex]) {
                handleCorrectChord();
            }
        }
    } else {
        document.getElementById('gesture-text').textContent = '';
    }
}

function handleCorrectChord() {
    correctChords++;
    totalAttempts++;
    
    // Update UI
    updateChordSequence();
    updateStats();
    
    // Show success feedback
    const instruction = document.getElementById('current-instruction');
    instruction.textContent = `✅ Great! You played ${chordProgression[currentChordIndex]}!`;
    instruction.className = 'current-instruction detected';
    
    // Move to next chord after a short delay
    setTimeout(() => {
        currentChordIndex++;
        
        if (currentChordIndex >= chordProgression.length) {
            // Song completed!
            completeSong();
        } else {
            // Next chord
            showNextChord();
        }
    }, 1500);
}

function showNextChord() {
    const instruction = document.getElementById('current-instruction');
    instruction.textContent = `🎸 Play ${chordProgression[currentChordIndex]} chord`;
    instruction.className = 'current-instruction waiting';
    
    updateChordSequence();
}

function updateChordSequence() {
    // This function now updates the progress bar instead of a separate chord sequence
    updateStats();
}

function createEnhancedProgressBar() {
    const progressContainer = document.querySelector('.song-progress');
    const oldProgressBar = document.querySelector('.progress-bar');
    
    // Create new enhanced progress bar
    const enhancedProgressBar = document.createElement('div');
    enhancedProgressBar.className = 'enhanced-progress-bar';
    
    chordProgression.forEach((chord, chordIndex) => {
        const chordSection = document.createElement('div');
        chordSection.className = 'chord-section';
        chordSection.style.width = `${100 / chordProgression.length}%`;
        
        // Chord label
        const chordLabel = document.createElement('div');
        chordLabel.className = 'chord-label';
        chordLabel.textContent = chord;
        chordSection.appendChild(chordLabel);
        
        // Beat divisions
        const beatContainer = document.createElement('div');
        beatContainer.className = 'beat-container';
        
        for (let beat = 0; beat < beatsPerChord; beat++) {
            const beatDiv = document.createElement('div');
            beatDiv.className = 'beat-division';
            
            // Add strumming pattern
            const strumIndex = beat % strummingPattern.length;
            const strumDirection = strummingPattern[strumIndex];
            
            const strumLabel = document.createElement('div');
            strumLabel.className = 'strum-label';
            strumLabel.textContent = strumDirection;
            beatDiv.appendChild(strumLabel);
            
            beatContainer.appendChild(beatDiv);
        }
        
        chordSection.appendChild(beatContainer);
        
        // Progress overlay
        const progressOverlay = document.createElement('div');
        progressOverlay.className = 'progress-overlay';
        progressOverlay.id = `progress-overlay-${chordIndex}`;
        chordSection.appendChild(progressOverlay);
        
        enhancedProgressBar.appendChild(chordSection);
    });
    
    // Replace old progress bar
    progressContainer.replaceChild(enhancedProgressBar, oldProgressBar);
}

function updateStats() {
    const progress = (currentChordIndex / chordProgression.length) * 100;
    
    // Update chord sections
    chordProgression.forEach((chord, index) => {
        const progressOverlay = document.getElementById(`progress-overlay-${index}`);
        const chordSection = progressOverlay.parentElement;
        
        if (index < currentChordIndex) {
            // Completed chord - full green
            progressOverlay.style.width = '100%';
            chordSection.classList.add('completed');
            chordSection.classList.remove('current');
        } else if (index === currentChordIndex && isPracticing) {
            // Current chord - no fill yet, but highlight if practicing
            progressOverlay.style.width = '0%';
            chordSection.classList.add('current');
            chordSection.classList.remove('completed');
        } else {
            // Future chord or not practicing yet - no fill
            progressOverlay.style.width = '0%';
            chordSection.classList.remove('completed', 'current');
        }
    });
    
    document.getElementById('chord-count').textContent = correctChords;
    
    const accuracy = totalAttempts > 0 ? Math.round((correctChords / totalAttempts) * 100) : 100;
    document.getElementById('accuracy').textContent = accuracy + '%';
}

function updateTimer() {
    if (startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('time-elapsed').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

function completeSong() {
    isPracticing = false;
    clearInterval(timerInterval);
    
    document.getElementById('success-message').style.display = 'block';
    document.getElementById('current-instruction').style.display = 'none';
    document.getElementById('start-btn').textContent = 'Practice Again';
    document.getElementById('start-btn').disabled = false;
}

function startPractice() {
    if (!isModelLoaded) {
        alert('Please wait for the model to load first.');
        return;
    }
    
    // Reset everything
    currentChordIndex = 0;
    correctChords = 0;
    totalAttempts = 0;
    startTime = Date.now();
    isPracticing = true;
    
    // Hide success message
    document.getElementById('success-message').style.display = 'none';
    document.getElementById('current-instruction').style.display = 'block';
    
    // Start timer
    timerInterval = setInterval(updateTimer, 1000);
    
    // Show first chord
    showNextChord();
    updateStats();
    
    // Disable start button
    document.getElementById('start-btn').disabled = true;
}

// Initialize when page loads
window.addEventListener('load', () => {
    createEnhancedProgressBar();
    init();
    // Don't call updateStats() here - let it initialize in a neutral state
});