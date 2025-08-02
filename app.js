// Is line ko dhyan se dekhein. Humne poora URL hata diya hai.
// Jab frontend aur backend ek hi server par hote hain, toh 'io()' likhne se
// yeh apne aap sahi server se connect ho jaata hai.
const socket = io();

// UI Elements ko select kar rahe hain
const myIdElem = document.getElementById("my-id");
const friendIdInput = document.getElementById("friend-id");
const callBtn = document.getElementById("call-btn");
const callStatusElem = document.getElementById("call-status");
const voiceFilterSelect = document.getElementById("voice-filter");
const localAudio = document.getElementById("localAudio");
const remoteAudio = document.getElementById("remoteAudio");
const incomingCallDiv = document.getElementById("incoming-call-div");
const callerIdElem = document.getElementById("caller-id");
const answerBtn = document.getElementById("answer-btn");

// Variables
let myStream;
let peer;
let myId;
let callerSignal;
let audioContext, mediaStreamSource, filterNode, destination;

// Agar server se connect hone me error aaye
socket.on('connect_error', () => {
    myIdElem.textContent = "Server Offline";
    myIdElem.style.color = 'red';
});

// Jab server se 'your-id' event milta hai
socket.on("your-id", (id) => {
    myId = id;
    myIdElem.textContent = myId;
    myIdElem.style.color = '#007bff'; // Blue color for ID
    console.log("My ID:", myId);
});

// Microphone se audio stream lene ka function
async function getMedia() {
    try {
        // Echo cancellation aur noise suppression enable kar rahe hain taaki awaaz saaf aaye
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: false, 
            audio: { echoCancellation: true, noiseSuppression: true } 
        });
        myStream = stream;
        localAudio.srcObject = stream; // Local audio preview ke liye (muted)
        setupAudioProcessing(stream); // Audio processing setup karein
    } catch (err) {
        console.error("Failed to get local stream", err);
        alert("Microphone access denied. Please allow microphone access to use the app.");
    }
}

// Web Audio API setup
function setupAudioProcessing(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    destination = audioContext.createMediaStreamDestination(); // Processed stream ke liye destination
    
    // Shuru me koi filter nahi, direct connection
    mediaStreamSource.connect(destination);
    
    // Jab user filter select karega, toh yeh function call hoga
    voiceFilterSelect.addEventListener("change", applyFilter);
}

// Voice filter lagane ka function
function applyFilter() {
    const selectedFilter = voiceFilterSelect.value;
    
    // Puraane filter ko disconnect karein (agar koi hai)
    if (filterNode) filterNode.disconnect();
    mediaStreamSource.disconnect();

    // Agar 'Normal Voice' select kiya hai
    if (selectedFilter === "none") {
        mediaStreamSource.connect(destination);
        return;
    }

    // Naya filter node banayein
    if (selectedFilter === 'robot') {
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "bandpass";
        filterNode.frequency.value = 1500;
        filterNode.Q.value = 50;
    } else if (selectedFilter === 'chipmunk') {
        // High pitch effect
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "highpass";
        filterNode.detune.value = 1200; // Pitch up
    } else if (selectedFilter === 'monster') {
        // Low pitch effect
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "lowpass";
        filterNode.detune.value = -1200; // Pitch down
    }
    
    // Naye filter ko connect karein
    mediaStreamSource.connect(filterNode);
    filterNode.connect(destination);
}

// Page load hote hi microphone access maangein
getMedia();

// Function to call a user
function callUser(friendId) {
    if (!myStream) {
        alert("Could not find your microphone stream.");
        return;
    }
    callStatusElem.textContent = `Calling ${friendId}...`;
    
    // WebRTC connection shuru karein (caller)
    peer = new SimplePeer({ 
        initiator: true, 
        trickle: false, 
        stream: destination.stream // Hum original nahi, balki filtered audio stream bhej rahe hain
    });

    // WebRTC "offer" signal generate hone par
    peer.on("signal", (data) => {
        socket.emit("call-user", { 
            userToCall: friendId, 
            signalData: data, 
            from: myId 
        });
    });

    // Jab dost ki audio stream aaye
    peer.on("stream", (stream) => {
        remoteAudio.srcObject = stream;
        remoteAudio.play();
    });

    // Jab dost call accept kar le
    socket.on("call-accepted", (signal) => {
        callStatusElem.textContent = "Call connected!";
        incomingCallDiv.style.display = 'none';
        peer.signal(signal); // Connection poora karein
    });

    peer.on('close', handleCallEnd);
    peer.on('error', handleCallEnd);
}

// Jab aapke paas koi call aaye
socket.on("hey", (data) => {
    callerSignal = data.signal;
    callerIdElem.textContent = data.from;
    incomingCallDiv.style.display = "block";
    callStatusElem.textContent = "";
});

// Call ka jawab dene ka function
function answerCall() {
    if (!myStream) {
        alert("Could not find your microphone stream.");
        return;
    }
    incomingCallDiv.style.display = "none";
    callStatusElem.textContent = "Connecting...";

    // WebRTC connection shuru karein (callee)
    peer = new SimplePeer({ 
        initiator: false, 
        trickle: false, 
        stream: destination.stream 
    });

    // WebRTC "answer" signal generate hone par
    peer.on("signal", (data) => {
        socket.emit("accept-call", { signal: data, to: callerIdElem.textContent });
    });

    // Jab caller ki audio stream aaye
    peer.on("stream", (stream) => {
        remoteAudio.srcObject = stream;
        remoteAudio.play();
    });

    peer.signal(callerSignal); // Aaye hue "offer" ko accept karein

    peer.on('close', handleCallEnd);
    peer.on('error', handleCallEnd);
}

function handleCallEnd() {
    console.log('Call ended.');
    callStatusElem.textContent = "Call Ended";
    if (peer) {
        peer.destroy();
        peer = null;
    }
    remoteAudio.srcObject = null;
}

socket.on('call-ended', handleCallEnd);

// Event Listeners (Buttons par click hone par kya karna hai)
callBtn.addEventListener("click", () => {
    const friendId = friendIdInput.value.trim();
    if (friendId && friendId !== myId) {
        callUser(friendId);
    } else {
        alert("Please enter a valid Friend's ID.");
    }
});

answerBtn.addEventListener("click", answerCall);
