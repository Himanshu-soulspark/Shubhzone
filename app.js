// VERY IMPORTANT: Isko baad me apne Render server ke URL se badalna hai.
// Abhi ke liye, agar aap local test kar rahe hain, toh yeh theek hai.
const SERVER_URL = "http://localhost:3000"; 

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

// Socket.io server se connect kar rahe hain
const socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: 5,
});

socket.on('connect_error', () => {
    myIdElem.textContent = "Server offline";
    myIdElem.style.color = 'red';
});

// Jab server se 'your-id' event milta hai
socket.on("your-id", (id) => {
    myId = id;
    myIdElem.textContent = myId;
    myIdElem.style.color = '#007bff';
    console.log("My ID:", myId);
});

// Microphone se audio stream lene ka function
async function getMedia() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true } });
        myStream = stream;
        localAudio.srcObject = stream; // Local audio preview ke liye
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
    
    mediaStreamSource.connect(destination); // Shuru me koi filter nahi
    
    voiceFilterSelect.addEventListener("change", applyFilter);
}

// Voice filter lagane ka function
function applyFilter() {
    const selectedFilter = voiceFilterSelect.value;
    
    if (filterNode) filterNode.disconnect();
    mediaStreamSource.disconnect();

    if (selectedFilter === "none") {
        mediaStreamSource.connect(destination);
        return;
    }

    if (selectedFilter === 'chipmunk' || selectedFilter === 'monster') {
        // Pitch shift is complex and not a standard node.
        // This is a simplified approach using detune.
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = selectedFilter === 'chipmunk' ? "highpass" : "lowpass";
        filterNode.detune.value = selectedFilter === 'chipmunk' ? 1200 : -1200; // Simplified pitch shift
    } else if (selectedFilter === 'robot') {
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "bandpass";
        filterNode.frequency.value = 1500;
        filterNode.Q.value = 50;
    }
    
    mediaStreamSource.connect(filterNode);
    filterNode.connect(destination);
}

getMedia(); // Page load hote hi media access lein

function callUser(friendId) {
    if (!myStream) return alert("Could not find your microphone stream.");
    callStatusElem.textContent = `Calling ${friendId}...`;
    
    peer = new SimplePeer({ initiator: true, trickle: false, stream: destination.stream });

    peer.on("signal", (data) => {
        socket.emit("call-user", { userToCall: friendId, signalData: data, from: myId });
    });

    peer.on("stream", (stream) => {
        remoteAudio.srcObject = stream;
        remoteAudio.play();
    });

    socket.on("call-accepted", (signal) => {
        callStatusElem.textContent = "Call connected!";
        incomingCallDiv.style.display = 'none';
        peer.signal(signal);
    });

    peer.on('close', handleCallEnd);
    peer.on('error', handleCallEnd);
}

socket.on("hey", (data) => {
    callerSignal = data.signal;
    callerIdElem.textContent = data.from;
    incomingCallDiv.style.display = "block";
    callStatusElem.textContent = "";
});

function answerCall() {
     if (!myStream) return alert("Could not find your microphone stream.");
    incomingCallDiv.style.display = "none";
    callStatusElem.textContent = "Connecting...";

    peer = new SimplePeer({ initiator: false, trickle: false, stream: destination.stream });

    peer.on("signal", (data) => {
        socket.emit("accept-call", { signal: data, to: callerIdElem.textContent });
    });

    peer.on("stream", (stream) => {
        remoteAudio.srcObject = stream;
        remoteAudio.play();
    });

    peer.signal(callerSignal);
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

// Event Listeners
callBtn.addEventListener("click", () => {
    const friendId = friendIdInput.value.trim();
    if (friendId && friendId !== myId) {
        callUser(friendId);
    } else {
        alert("Please enter a valid Friend's ID.");
    }
});

answerBtn.addEventListener("click", answerCall);
