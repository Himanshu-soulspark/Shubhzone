// Server se connect kar rahe hain. Is line ko badalne ki zaroorat nahi hai.
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
    myIdElem.style.color = '#007bff';
    console.log("My ID:", myId);
});

// Microphone se audio stream lene ka function
async function getMedia() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: { echoCancellation: true, noiseSuppression: true }
        });
        myStream = stream;
        localAudio.srcObject = stream;
        setupAudioProcessing(stream);
    } catch (err) {
        console.error("Failed to get local stream", err);
        alert("Microphone access denied. Please allow microphone access.");
    }
}

// Web Audio API setup
function setupAudioProcessing(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    destination = audioContext.createMediaStreamDestination();
    mediaStreamSource.connect(destination);
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

    if (selectedFilter === 'robot') {
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "bandpass";
        filterNode.frequency.value = 1500;
        filterNode.Q.value = 50;
    } else if (selectedFilter === 'chipmunk') {
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "highpass";
        filterNode.detune.value = 1200;
    } else if (selectedFilter === 'monster') {
        filterNode = audioContext.createBiquadFilter();
        filterNode.type = "lowpass";
        filterNode.detune.value = -1200;
    }

    mediaStreamSource.connect(filterNode);
    filterNode.connect(destination);
}

// Page load hote hi microphone access maangein
getMedia();

// --- YAHAN BADLAAV KIYA GAYA HAI ---
// Function to call a user (with STUN servers)
function callUser(friendId) {
    if (!myStream) return alert("Could not find your microphone stream.");
    callStatusElem.textContent = `Calling ${friendId}...`;

    peer = new SimplePeer({
        initiator: true,
        trickle: false,
        stream: destination.stream,
        // Yeh STUN servers alag-alag networks ke beech call connect karne mein madad karte hain
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });

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
    peer.on('error', (err) => {
        console.error("Peer Error:", err);
        handleCallEnd();
    });
}

socket.on("hey", (data) => {
    callerSignal = data.signal;
    callerIdElem.textContent = data.from;
    incomingCallDiv.style.display = "block";
    callStatusElem.textContent = "";
});


// --- YAHAN BHI BADLAAV KIYA GAYA HAI ---
// Call ka jawab dene ka function (with STUN servers)
function answerCall() {
    if (!myStream) return alert("Could not find your microphone stream.");
    incomingCallDiv.style.display = "none";
    callStatusElem.textContent = "Connecting...";

    peer = new SimplePeer({
        initiator: false,
        trickle: false,
        stream: destination.stream,
        // Yeh STUN servers yahaan bhi zaroori hain
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });

    peer.on("signal", (data) => {
        socket.emit("accept-call", { signal: data, to: callerIdElem.textContent });
    });

    peer.on("stream", (stream) => {
        remoteAudio.srcObject = stream;
        remoteAudio.play();
    });

    peer.signal(callerSignal);

    peer.on('close', handleCallEnd);
    peer.on('error', (err) => {
        console.error("Peer Error:", err);
        handleCallEnd();
    });
}

function handleCallEnd() {
    console.log('Call ended.');
    callStatusElem.textContent = "Call Ended";
    if (peer) {
        peer.destroy();
        peer = null;
    }
    remoteAudio.srcObject = null;
    // Page ko refresh kar sakte hain taaki sab reset ho jaaye
    // window.location.reload(); 
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
