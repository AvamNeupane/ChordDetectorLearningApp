// Phase 2 - Guitar Hero Style JavaScript with Audio Context for metronome
const URL = "./my_model/";
let model, webcam, maxPredictions;
let isModelLoaded = false;
let isPlaying = false;

const gestureStrings = {
    'G': 'G',
    'A': 'A',
    'C': 'C'
};

// Wonderwall chord progression (example)
const chordProgression = [
    'G', 'A', 'C', 'G',
    'G', 'A', 'C', 'G',
    'A', 'C', 'G', 'A',
    'G', 'A', 'C', 'G',
    'C', 'A', 'G', 'C', // Added more chords for testing
    'A', 'G', 'C', 'A'
];

// Timing data for Guitar Hero style
const songTiming = {
    bpm: 87, // Beats per minute
    beatsPerChord: 4, // How many beats each chord lasts
    chordDuration: (4 / 87) * 60, // seconds per chord (default)
    totalDuration: chordProgression.length * ((4 / 87) * 60) // total song duration in seconds
};

// Audio Context for metronome
let audioContext;
let metronomeInterval;
let isMetronomeActive = false;

// Game state
let gameState = {
    score: 0,
    streak: 0,
    totalNotes: 0,
    hitNotes: 0,
    currentTime: 0, // Current elapsed time in seconds
    isPlaying: false,
    tempo: 0.8, // Playback tempo multiplier (0.5 to 1.5)
    currentChordIndex: 0, // Index of the chord currently in the hit zone
    chordStartTime: 0, // When the current chord became active
    nextChordTime: 0, // When the next chord should become active
    gameStartTime: 0, // When the game started
    fallingNotes: [], // Array to keep track of falling note elements
    songCompleted: false // New state variable
};

// Detection variables
let lastDetectedChord = null;
let detectionCooldown = false; // To prevent rapid-fire detections
let chordHoldTime = 0; // How long a chord has been held
let requiredHoldDuration = 200; // milliseconds a chord must be held to register
let gameTimer = null; // Interval for main game loop timing

// --- Utility Functions ---

// Initialize audio context
function initAudioContext() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    // Attempt to resume audio context if it's suspended (common in modern browsers)
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log('AudioContext resumed successfully');
        });
    }
}

// Create metronome click sound
function playMetronomeClick(frequency = 800, duration = 100) {
    if (!audioContext || audioContext.state === 'suspended') {
        // If suspended, try to resume on first click
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume().then(() => playMetronomeClick(frequency, duration));
        }
        return;
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'square';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
}

// Start metronome
function startMetronome() {
    if (isMetronomeActive) return;

    isMetronomeActive = true;
    const beatInterval = (60 / (songTiming.bpm * gameState.tempo)) * 1000; // ms per beat

    metronomeInterval = setInterval(() => {
        if (gameState.isPlaying) {
            playMetronomeClick();
        }
    }, beatInterval);
}

// Stop metronome
function stopMetronome() {
    if (metronomeInterval) {
        clearInterval(metronomeInterval);
        metronomeInterval = null;
    }
    isMetronomeActive = false;
}

// --- Game Initialization ---

// Initialize the model and webcam
async function init() {
    try {
        initAudioContext(); // Initialize audio context early but resume on user gesture

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
        document.getElementById('feedback-display').textContent = 'Model loaded! Ready to rock! 🎸';

        // Set total song time display
        const totalMinutes = Math.floor(songTiming.totalDuration / 60);
        const totalSeconds = Math.floor(songTiming.totalDuration % 60);
        document.getElementById('total-time').textContent = `${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}`;

        updateProgressBar();

    } catch (error) {
        console.error("Error initializing:", error);
        document.getElementById('feedback-display').textContent = 'Error loading model or webcam. Please check console.';
        document.getElementById('feedback-display').className = 'feedback-display miss';
        document.getElementById('start-btn').disabled = true;
    }
}

// --- Game Loop and Prediction ---

// Main game loop
async function loop() {
    if (webcam) {
        webcam.update(); // Update the webcam frame
        if (gameState.isPlaying && !gameState.songCompleted) {
            await predict();
            updateGameTiming(); // Handles chord progression and falling notes
            animateFallingNotes(); // Handles notes falling and removal
        }
        window.requestAnimationFrame(loop); // Request next frame
    }
}

// Prediction logic
async function predict() {
    const prediction = await model.predict(webcam.canvas);

    let bestPrediction = prediction[0];
    let secondBestPrediction = prediction[1] || { probability: 0 };

    for (let i = 1; i < prediction.length; i++) {
        if (prediction[i].probability > bestPrediction.probability) {
            secondBestPrediction = bestPrediction;
            bestPrediction = prediction[i];
        } else if (prediction[i].probability > secondBestPrediction.probability) {
            secondBestPrediction = prediction[i];
        }
    }

    const confidenceThreshold = 0.85;
    const confidenceGap = 0.2;

    const isConfident = bestPrediction.probability > confidenceThreshold &&
                       (bestPrediction.probability - secondBestPrediction.probability) > confidenceGap;

    if (isConfident && !detectionCooldown) {
        const chordName = gestureStrings[bestPrediction.className];

        if (chordName) {
            if (lastDetectedChord === chordName) {
                chordHoldTime += 50; // Assuming loop runs ~20 times/second (50ms per frame)

                if (chordHoldTime >= requiredHoldDuration) {
                    document.getElementById('gesture-text').textContent = chordName;
                    checkChordTiming(chordName);

                    detectionCooldown = true; // Activate cooldown
                    setTimeout(() => {
                        detectionCooldown = false;
                        lastDetectedChord = null; // Clear last detected chord after cooldown
                        chordHoldTime = 0;
                        document.getElementById('gesture-text').textContent = ''; // Clear gesture text
                    }, 500); // 500ms cooldown after a successful detection
                }
            } else {
                lastDetectedChord = chordName;
                chordHoldTime = 0;
                document.getElementById('gesture-text').textContent = `${chordName} (hold...)`;
            }
        }
    } else {
        if (!detectionCooldown && lastDetectedChord !== null) {
            lastDetectedChord = null;
            chordHoldTime = 0;
            document.getElementById('gesture-text').textContent = '';
        }
    }
}

// --- Game Logic ---

// Handles chord timing and feedback
function checkChordTiming(detectedChord) {
    // Find the falling note that is currently in the hit zone for the detected chord
    const hitZoneNote = gameState.fallingNotes.find(note =>
        note.chord === detectedChord && note.isPlayable && !note.isHit
    );

    if (hitZoneNote) {
        // Calculate how close the note is to the center of the hit zone (0.5 means center)
        const noteCurrentY = parseFloat(hitZoneNote.element.style.top);
        const hitZoneTop = document.querySelector('.hit-zone').offsetTop;
        const hitZoneHeight = document.querySelector('.hit-zone').offsetHeight;
        const noteHeight = hitZoneNote.element.offsetHeight;

        // Calculate progress through hit zone for the note
        // The animation goes from top: -100px to bottom: ~500px, hit zone is around 400px
        const animationTotalDistance = 600; // From -100 to 500 (approx height of timeline)
        const hitZoneCenter = hitZoneTop + hitZoneHeight / 2;
        
        // This is a simplified timing check. A more robust system would map animation progress
        // to a precise timing window. For now, we check if it's within the general hit zone.
        const noteBottom = noteCurrentY + noteHeight;
        
        const isWithinHitZone = noteBottom >= hitZoneTop && hitZoneNote.element.offsetTop <= (hitZoneTop + hitZoneHeight);
        
        if (isWithinHitZone) {
            // Check if it's the expected chord in the sequence
            const expectedChord = chordProgression[gameState.currentChordIndex];
            if (detectedChord === expectedChord) {
                showFeedback('🎯 CORRECT!', 'perfect');
                gameState.score += 100;
                gameState.streak++;
                gameState.hitNotes++;
                createScoreEffect(100);

                // Mark the falling note as hit and remove it
                hitZoneNote.isHit = true;
                hitZoneNote.element.classList.add('hit');
                setTimeout(() => {
                    hitZoneNote.element.remove();
                    gameState.fallingNotes = gameState.fallingNotes.filter(n => n.id !== hitZoneNote.id);
                }, 100); // Remove shortly after hit

                // If this was the current active chord, advance to the next
                if (gameState.currentChordIndex < chordProgression.length &&
                    chordProgression[gameState.currentChordIndex] === detectedChord) {
                    moveToNextChord();
                }
                
            } else {
                showFeedback(`❌ Wrong chord! Expected ${expectedChord}`, 'wrong');
                gameState.streak = 0;
            }
        } else {
            // Detected chord but not in the hit zone, or too early/late
            showFeedback('⏰ Timing off!', 'miss'); // Use 'miss' for timing errors
            gameState.streak = 0;
        }
    } else {
        // No relevant note in hit zone, or detected an extra chord
        showFeedback('🤔 No target here.', 'wrong');
        gameState.streak = 0;
    }
    gameState.totalNotes++; // Increment total notes attempted regardless of hit/miss
    updateScoreDisplay();
}

// Advances to the next chord in the progression
function moveToNextChord() {
    gameState.currentChordIndex++;
    if (gameState.currentChordIndex >= chordProgression.length) {
        completeSong();
        return;
    }
    // Set next chord timing relative to game start
    const timeToNextChord = songTiming.chordDuration / gameState.tempo;
    gameState.chordStartTime = gameState.currentTime;
    gameState.nextChordTime = gameState.chordStartTime + timeToNextChord;

    updateCurrentChordDisplay();
    updateProgressBar();
    // Potentially generate the next few falling chords
    generateUpcomingFallingNotes();
}


// Manages game timing and automatic chord progression
function updateGameTiming() {
    const now = Date.now();
    gameState.currentTime = (now - gameState.gameStartTime) / 1000; // Time in seconds

    // Update time display
    const currentMinutes = Math.floor(gameState.currentTime / 60);
    const currentSeconds = Math.floor(gameState.currentTime % 60);
    document.getElementById('current-time').textContent = `${currentMinutes}:${currentSeconds.toString().padStart(2, '0')}`;

    // Check if it's time for the next chord to become active
    // This also triggers a new falling note to be created
    if (gameState.currentChordIndex < chordProgression.length &&
        gameState.currentTime >= gameState.nextChordTime) {
        // If a chord note was missed (not hit by the time it passed the hit zone)
        // Check if the current chord in the sequence has a corresponding falling note that passed the hit zone
        const currentExpectedChord = chordProgression[gameState.currentChordIndex];
        const missedNote = gameState.fallingNotes.find(note =>
            note.chord === currentExpectedChord && !note.isHit &&
            (parseFloat(note.element.style.top) + note.element.offsetHeight) > document.querySelector('.hit-zone').offsetTop + document.querySelector('.hit-zone').offsetHeight
        );
        
        if (missedNote) {
            // Only penalize if it's an actual, un-hit note that passed the zone
            showFeedback(`😔 Missed ${currentExpectedChord}!`, 'miss');
            gameState.streak = 0;
            gameState.totalNotes++; // Still count as an attempted note
            updateScoreDisplay();
            missedNote.element.remove(); // Remove the missed note
            gameState.fallingNotes = gameState.fallingNotes.filter(n => n.id !== missedNote.id);
        }
        
        // Move to the next chord regardless if missed or not
        moveToNextChord();
    }
}

// --- Visual Updates ---

function updateCurrentChordDisplay() {
    const currentChordName = chordProgression[gameState.currentChordIndex];
    document.getElementById('current-chord').textContent = currentChordName || '-';
    // Clear countdown or set it up if needed
    document.getElementById('chord-countdown').textContent = '';
}

function updateProgressBar() {
    const progressText = document.getElementById('progress-text');
    const progressFill = document.getElementById('progress-fill');

    progressText.textContent = `${gameState.currentChordIndex} / ${chordProgression.length} chords`;
    const progressPercentage = (gameState.currentChordIndex / chordProgression.length) * 100;
    progressFill.style.width = `${progressPercentage}%`;
}

function updateScoreDisplay() {
    document.getElementById('current-score').textContent = gameState.score;
    document.getElementById('streak-count').textContent = gameState.streak;

    const accuracy = gameState.totalNotes > 0 ?
        Math.round((gameState.hitNotes / gameState.totalNotes) * 100) : 100;
    document.getElementById('accuracy-percent').textContent = accuracy + '%';

    if (gameState.streak > 0 && gameState.streak % 5 === 0) {
        document.getElementById('streak-count').classList.add('streak-effect');
        setTimeout(() => {
            document.getElementById('streak-count').classList.remove('streak-effect');
        }, 500);
    }
}

function showFeedback(message, type) {
    const feedbackDisplay = document.getElementById('feedback-display');
    feedbackDisplay.textContent = message;
    feedbackDisplay.className = `feedback-display ${type}`; // Apply class for styling
    // Clear feedback after a short delay
    setTimeout(() => {
        feedbackDisplay.className = 'feedback-display'; // Reset class
        feedbackDisplay.textContent = 'Keep strumming!';
    }, 1500);
}

function createScoreEffect(amount) {
    const scoreSection = document.getElementById('current-score');
    const scoreEffect = document.createElement('div');
    scoreEffect.textContent = `+${amount}`;
    scoreEffect.className = 'score-effect'; // Add CSS for animation
    scoreSection.appendChild(scoreEffect);

    scoreEffect.addEventListener('animationend', () => {
        scoreEffect.remove();
    });
}

// Creates a single falling chord note
function createFallingChordNote(chord, noteId) {
    const highway = document.getElementById('chord-highway');
    const note = document.createElement('div');
    note.id = `note-${noteId}`;
    note.textContent = chord;
    note.classList.add('chord-note', `${chord.toLowerCase()}-chord`);

    // Position based on chord type for different lanes (e.g., G, A, C)
    let leftPosition;
    switch (chord) {
        case 'G': leftPosition = 15; break; // Left lane
        case 'A': leftPosition = 45; break; // Middle lane
        case 'C': leftPosition = 75; break; // Right lane
        default: leftPosition = 45; // Default to middle
    }
    note.style.left = `${leftPosition}%`;
    note.style.top = '-100px'; // Start above the visible area

    // Animation duration based on tempo and a fixed distance to fall
    const animationDuration = (songTiming.chordDuration / gameState.tempo) * 2; // seconds to fall
    note.style.animationDuration = `${animationDuration}s`;
    
    // Add to highway and track
    highway.appendChild(note);
    gameState.fallingNotes.push({
        id: note.id,
        chord: chord,
        element: note,
        isHit: false,
        isPlayable: true // Can be hit
    });
}

// Generates upcoming falling notes based on the current song progress
function generateUpcomingFallingNotes() {
    const currentChord = chordProgression[gameState.currentChordIndex];
    if (!currentChord) return;

    // Remove notes that have already passed the hit zone (missed)
    gameState.fallingNotes = gameState.fallingNotes.filter(note => {
        const highway = document.getElementById('chord-highway');
        const noteRect = note.element.getBoundingClientRect();
        const highwayRect = highway.getBoundingClientRect();
        return noteRect.top < highwayRect.bottom + 50; // Keep notes that are still visible or just off screen
    });

    // Generate the current chord note if not already generated and a few upcoming ones
    for (let i = gameState.currentChordIndex; i < Math.min(gameState.currentChordIndex + 4, chordProgression.length); i++) {
        const chord = chordProgression[i];
        const noteId = `${chord}-${i}`;
        
        // Check if this note has already been created
        if (!gameState.fallingNotes.some(n => n.id === noteId)) {
            // Calculate when this note should ideally be hit
            const idealHitTime = (i * (songTiming.chordDuration / gameState.tempo)); // time in seconds from game start

            // Calculate the animation delay needed for this note to arrive at the hit zone at idealHitTime
            // This is complex and might need fine-tuning. For simplicity, we'll create it with a delay
            // based on its position in the upcoming sequence.
            const delayMultiplier = (i - gameState.currentChordIndex);
            
            // The note should start its fall such that it reaches the hit zone at `idealHitTime`.
            // The `animationDuration` is the time it takes to fall.
            // So, `creationTime = idealHitTime - animationDuration`.
            const noteFallDuration = (songTiming.chordDuration / gameState.tempo) * 2; // Consistent fall time
            const creationTime = idealHitTime - noteFallDuration;
            
            // Only create if its creation time is in the future or very recent past
            if (gameState.currentTime <= idealHitTime + 0.5) { // create if it's not too late
                 // We will use a fixed delay to stagger the notes for visual effect
                // and rely on animation-duration for the fall speed.
                const note = document.createElement('div');
                note.id = noteId;
                note.textContent = chord;
                note.classList.add('chord-note', `${chord.toLowerCase()}-chord`);

                let leftPosition;
                switch (chord) {
                    case 'G': leftPosition = 15; break;
                    case 'A': leftPosition = 45; break;
                    case 'C': leftPosition = 75; break;
                    default: leftPosition = 45;
                }
                note.style.left = `${leftPosition}%`;
                note.style.top = '-100px'; // Start above the visible area

                // Adjust animation duration based on tempo
                note.style.animationDuration = `${noteFallDuration}s`;
                note.style.animationDelay = `${(idealHitTime - gameState.currentTime) - noteFallDuration}s`; // How long to wait before it starts falling

                document.getElementById('chord-highway').appendChild(note);
                gameState.fallingNotes.push({
                    id: note.id,
                    chord: chord,
                    element: note,
                    isHit: false,
                    isPlayable: true,
                    expectedHitTime: idealHitTime // Store the expected hit time
                });
            }
        }
    }
}


// Animates falling notes (moves them down) and removes them if they go off screen
function animateFallingNotes() {
    const highway = document.getElementById('chord-highway');
    const hitZoneTop = document.querySelector('.hit-zone').offsetTop;
    const hitZoneHeight = document.querySelector('.hit-zone').offsetHeight;

    // Filter out notes that have left the screen or passed the hit zone without being hit
    gameState.fallingNotes = gameState.fallingNotes.filter(note => {
        const noteElement = note.element;
        if (!noteElement) return false; // Element might have been removed already

        const noteRect = noteElement.getBoundingClientRect();
        const highwayRect = highway.getBoundingClientRect();

        // If note has passed the hit zone AND is not hit, remove it and penalize if it was the target
        if (!note.isHit && noteRect.top > (hitZoneTop + hitZoneHeight)) {
            // Check if this was the current expected chord that was missed
            const expectedChordForThisNote = chordProgression.find((c, idx) => `note-${c}-${idx}` === note.id);
             if (expectedChordForThisNote && chordProgression[gameState.currentChordIndex] === expectedChordForThisNote) {
                // This means the current target chord was missed visually
                // The automatic `updateGameTiming` will handle progression and score for missed notes
                noteElement.remove();
                return false; // Remove from array
            }
        }
        // Keep notes that are still on screen or actively falling
        return noteRect.top < highwayRect.bottom + 50; // A buffer of 50px below
    });
}


// --- Control Functions ---

// Starts the game play-along
function startPlayAlong() {
    if (gameState.isPlaying) return;

    // Resume audio context on user gesture
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("AudioContext resumed on startPlayAlong.");
            // Continue with game start only after audio context is ready
            startPlayAlongLogic();
        }).catch(e => console.error("Failed to resume AudioContext:", e));
    } else {
        startPlayAlongLogic();
    }
}

function startPlayAlongLogic() {
    gameState.isPlaying = true;
    document.getElementById('start-btn').disabled = true;
    document.getElementById('play-pause-btn').innerHTML = '<span id="pause-icon">⏸️</span> Pause';
    document.getElementById('feedback-display').textContent = 'Strum along! 🎵';
    document.getElementById('feedback-display').className = 'feedback-display perfect'; // Green for start

    gameState.gameStartTime = Date.now();
    gameState.currentChordIndex = 0;
    gameState.chordStartTime = 0; // Relative to gameStartTime
    gameState.nextChordTime = songTiming.chordDuration / gameState.tempo; // First chord is due after one chordDuration

    gameState.score = 0;
    gameState.streak = 0;
    gameState.totalNotes = 0;
    gameState.hitNotes = 0;
    gameState.currentTime = 0;
    gameState.songCompleted = false;
    gameState.fallingNotes = []; // Clear any previous notes

    updateScoreDisplay();
    updateProgressBar();
    updateCurrentChordDisplay();
    startMetronome();

    // Start game timer that drives progression
    gameTimer = setInterval(updateGameTiming, 50); // Check every 50ms for timing updates

    // Generate initial falling notes
    generateUpcomingFallingNotes();
}

// Pauses the game
function pauseGame() {
    if (!gameState.isPlaying) return;

    gameState.isPlaying = false;
    webcam.pause();
    stopMetronome();
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
    if (audioContext && audioContext.state === 'running') {
        audioContext.suspend();
    }
    document.getElementById('play-pause-btn').innerHTML = '<span id="play-icon">▶️</span> Play';
    document.getElementById('feedback-display').textContent = 'Game Paused.';
    document.getElementById('feedback-display').className = 'feedback-display'; // Neutral feedback
}

// Resumes the game
function resumeGame() {
    if (gameState.isPlaying) return;

    // Resume audio context on user gesture
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            console.log("AudioContext resumed on resumeGame.");
            resumeGameLogic();
        }).catch(e => console.error("Failed to resume AudioContext:", e));
    } else {
        resumeGameLogic();
    }
}

function resumeGameLogic() {
    gameState.isPlaying = true;
    webcam.play();
    startMetronome();
    gameTimer = setInterval(updateGameTiming, 50); // Restart game timer
    document.getElementById('play-pause-btn').innerHTML = '<span id="pause-icon">⏸️</span> Pause';
    document.getElementById('feedback-display').textContent = 'Resuming... Strum along! 🎵';
    document.getElementById('feedback-display').className = 'feedback-display perfect';
}


// Toggles play/pause state
function togglePlayPause() {
    if (!isModelLoaded) {
        showFeedback('Model not loaded yet!', 'wrong');
        return;
    }
    if (gameState.songCompleted) { // If song finished, hitting play/pause restarts it
        resetGame();
        startPlayAlong();
    } else if (gameState.isPlaying) {
        pauseGame();
    } else {
        if (gameState.currentTime === 0) { // If starting from beginning
            startPlayAlong();
        } else { // If resuming from pause
            resumeGame();
        }
    }
}

// Handles tempo slider change
function changeTempo(value) {
    gameState.tempo = value / 100; // Convert to 0.5 - 1.5 range
    document.getElementById('tempo-display').textContent = `${value}%`;

    // Restart metronome and game timer with new tempo
    stopMetronome();
    if (gameState.isPlaying) {
        startMetronome();
        if (gameTimer) {
            clearInterval(gameTimer);
            gameTimer = null;
        }
        gameTimer = setInterval(updateGameTiming, 50);
        // Regenerate falling notes with new animation durations
        // For simplicity, we'll clear and recreate upcoming notes.
        document.getElementById('chord-highway').innerHTML = ''; // Clear highway
        gameState.fallingNotes = [];
        generateUpcomingFallingNotes();
    }
}

// Completes the song
function completeSong() {
    gameState.songCompleted = true;
    pauseGame(); // Stop all game activity
    webcam.stop(); // Stop webcam finally

    document.getElementById('feedback-display').textContent = 'Song Completed! Your final score: ' + gameState.score;
    document.getElementById('feedback-display').className = 'feedback-display perfect';
    document.getElementById('start-btn').disabled = false; // Enable start button for replay
    document.getElementById('start-btn').textContent = 'Play Again';

    // Show final stats more prominently if desired
}

// Resets game state (for replaying song)
function resetGame() {
    gameState.score = 0;
    gameState.streak = 0;
    gameState.totalNotes = 0;
    gameState.hitNotes = 0;
    gameState.currentTime = 0;
    gameState.currentChordIndex = 0;
    gameState.chordStartTime = 0;
    gameState.nextChordTime = 0;
    gameState.gameStartTime = 0;
    gameState.isPlaying = false;
    gameState.songCompleted = false;
    gameState.fallingNotes = []; // Clear falling notes
    document.getElementById('chord-highway').innerHTML = ''; // Clear notes from DOM

    lastDetectedChord = null;
    detectionCooldown = false;
    chordHoldTime = 0;

    document.getElementById('start-btn').textContent = 'Start Play Along';
    document.getElementById('play-pause-btn').innerHTML = '<span id="play-icon">▶️</span> Play';
    document.getElementById('feedback-display').textContent = 'Ready to rock! 🎸';
    document.getElementById('feedback-display').className = 'feedback-display';
    document.getElementById('current-time').textContent = '0:00';

    updateScoreDisplay();
    updateProgressBar();
    updateCurrentChordDisplay(); // Display first chord of progression

    if (webcam) { // Ensure webcam is playing for re-init
        webcam.play();
    }
}

// Initial call to load model
window.addEventListener('load', init);