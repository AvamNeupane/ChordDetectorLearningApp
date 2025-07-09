// the link to your model provided by Teachable Machine export panel
const URL = "./my_model/";
let model, webcam, maxPredictions;

// Map your guitar chord classes to their names
const gestureStrings = {
  'G': 'G',
  'A': 'A', 
  'C': 'C'
};

// Load the image model and setup the webcam
async function init() {
    const modelURL = URL + "model.json";
    const metadataURL = URL + "metadata.json";
    
    // load the model and metadata
    model = await tmImage.load(modelURL, metadataURL);
    maxPredictions = model.getTotalClasses();
    
    // Convenience function to setup a webcam
    const flip = true; // whether to flip the webcam
    webcam = new tmImage.Webcam(640, 480, flip); // using your original dimensions
    await webcam.setup(); // request access to the webcam
    await webcam.play();
    
    // append elements to the DOM
    document.getElementById("webcam-container").appendChild(webcam.canvas);
    
    // Start the prediction loop
    window.requestAnimationFrame(loop);
}

async function loop() {
    webcam.update(); // update the webcam frame
    await predict();
    window.requestAnimationFrame(loop);
}

// Function to update chord button styling
function updateChordButtons(detectedChord) {
    // Get all chord buttons
    const chordButtons = document.querySelectorAll('.chord-needed');
    
    // Reset all buttons to default styling
    chordButtons.forEach(button => {
        button.classList.remove('chord-detected');
    });
    
    // If a chord is detected, highlight the corresponding button
    if (detectedChord) {
        chordButtons.forEach(button => {
            if (button.textContent.trim() === detectedChord) {
                button.classList.add('chord-detected');
            }
        });
    }
}

// run the webcam image through the image model
async function predict() {
    const prediction = await model.predict(webcam.canvas);
    
    // Find the prediction with highest probability
    let bestPrediction = prediction[0];
    for (let i = 1; i < prediction.length; i++) {
        if (prediction[i].probability > bestPrediction.probability) {
            bestPrediction = prediction[i];
        }
    }
    
    // Only show chord if confidence is high enough
    if (bestPrediction.probability > 0.9) {
        const chordName = gestureStrings[bestPrediction.className];
        if (chordName) {
            // Update the bottom right display (keep existing functionality)
            document.getElementById('gesture-text').textContent = chordName;
            
            // Update the chord buttons in the "chords needed" section
            updateChordButtons(chordName);
        }
    } else {
        // Clear both displays when no chord is detected
        document.getElementById('gesture-text').textContent = '';
        updateChordButtons(null);
    }
}