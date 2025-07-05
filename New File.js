/* ================================================= */
/* === Shubhzone App Script (Code 2) - START === */
/* ================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyDuvWTMJL5edNG6cheez5pmwI2KlLCwtjw",
  authDomain: "shubhzone-4a6b0.firebaseapp.com",
  databaseURL: "https://shubhzone-4a6b0-default-rtdb.firebaseio.com",
  projectId: "shubhzone-4a6b0",
  storageBucket: "shubhzone-4a6b0.firebasestorage.app",
  messagingSenderId: "439309269785",
  appId: "1:439309269785:web:08a1256812648daafea388",
  measurementId: "G-5S0VFF21SB"
};

// Initialize Firebase only once
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const analytics = firebase.analytics();

let appState = {
    currentUser: {
        uid: null,
        username: "new_user",
        avatar: "https://via.placeholder.com/120/222/FFFFFF?text=+",
        email: "",
        name: "",
        mobile: "",
        address: "",
        hobby: "",
        state: "",
        country: "",
    },
    currentScreen: 'splash-screen',
    allVideos: [],
    userUploadedVideos: [],
    uploadDetails: {},
    activeComments: {
        videoId: null,
        videoOwnerUid: null
    }
};

let isYouTubeApiReady = false;
let players = {}; // --- MODIFIED ---: This will now hold both YouTube players and HTML5 video elements.
let videoObserver;
let fullVideoList = [];
let activePlayerId = null;
let userHasInteracted = false;
let hasShownAudioPopup = false;

const appContainer = document.getElementById('app-container');
const screens = document.querySelectorAll('.screen');
const navItems = document.querySelectorAll('.nav-item');
const profileAvatarElement = document.getElementById('profile-avatar');
const profileUsernameElement = document.getElementById('profile-username');
const profileImageInput = document.getElementById('profile-image-input');
const profileImagePreview = document.getElementById('profile-image-preview');
const uploadDetailsModal = document.getElementById('upload-details-modal');
const modalVideoTitle = document.getElementById('modal-video-title');
const modalVideoDescription = document.getElementById('modal-video-description');
const modalVideoHashtags = document.getElementById('modal-video-hashtags');
const modalVideoUrlInput = document.getElementById('modal-video-url');
const selectedCategoryText = document.getElementById('selected-category-text');
const categoryOptionsContainer = document.getElementById('category-options');
const commentsToggleInput = document.getElementById('comments-toggle-input');
const audienceOptions = document.querySelectorAll('.audience-option');
const categorySelectorDisplay = document.querySelector('.category-selector-display');
const videoSwiper = document.getElementById('video-swiper');
const homeStaticMessageContainer = document.getElementById('home-static-message-container');
const userVideoGrid = document.getElementById('user-video-grid');
const noVideosMessage = document.getElementById('no-videos-message');
const saveContinueBtn = document.getElementById('save-continue-btn');
const modalTitle = document.getElementById('modal-title');
const modalSaveButton = document.getElementById('modal-save-button');
const editingVideoIdInput = document.getElementById('editing-video-id');
const commentsModal = document.getElementById('comments-modal');
const commentsList = document.getElementById('comments-list');
const commentInput = document.getElementById('comment-input');
const sendCommentBtn = document.getElementById('send-comment-btn');

// --- NEW ---: Elements for the Premium Upload Screen (You will need to add these to your HTML)
const premiumUploadScreen = document.getElementById('premium-upload-screen');
const premiumVideoFileInput = document.getElementById('premium-video-file-input');
const premiumVideoPreview = document.getElementById('premium-video-preview');
const premiumVideoTitle = document.getElementById('premium-video-title');
const premiumVideoDescription = document.getElementById('premium-video-description');
const premiumVideoHashtags = document.getElementById('premium-video-hashtags');
const premiumUploadBtn = document.getElementById('premium-upload-btn');
const premiumUploadProgress = document.getElementById('premium-upload-progress');
const premiumUploadProgressText = document.getElementById('premium-upload-progress-text');
const backFromPremiumBtn = document.getElementById('back-from-premium-btn');


const categories = [
    "Entertainment", "Comedy", "Music", "Dance", "Education",
    "Travel", "Food", "DIY", "Sports", "Gaming", "News", "Lifestyle"
];

function activateScreen(screenId) {
    screens.forEach(screen => {
        const isActive = screen.id === screenId;
        screen.classList.toggle('active', isActive);
    });
    appState.currentScreen = screenId;
}

function navigateTo(nextScreenId) {
    // --- MODIFIED ---: Updated to handle both player types
    if (appState.currentScreen === 'home-screen' && activePlayerId && players[activePlayerId]) {
         pauseActivePlayer(); // Use a helper function for pausing
    }
    activePlayerId = null;
    activateScreen(nextScreenId);
    if (nextScreenId === 'profile-screen') loadUserVideosFromFirebase();

    // If navigating to editor, initialize it.
    if (nextScreenId === 'image-editor-screen') {
        photoEditor.start();
    }
}

async function checkUserProfileAndProceed(user) {
    if (!user) return;
    appState.currentUser.uid = user.uid;

    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();

    if (doc.exists && doc.data().name) {
        // User has filled info, go to home
        appState.currentUser = { ...appState.currentUser, ...doc.data() };
        updateProfileUI();
        await startAppLogic();
    } else {
        // User is new or hasn't filled info
        if (doc.exists) {
            appState.currentUser = { ...appState.currentUser, ...doc.data() };
        }
        updateProfileUI();
        navigateTo('information-screen');
    }
}

function initializeApp() {
    auth.onAuthStateChanged(user => {
        if (user) {
            checkUserProfileAndProceed(user);
        } else {
            auth.signInAnonymously().catch(error => console.error("Anonymous sign-in failed:", error));
        }
    });
    activateScreen('splash-screen');
}

async function loadUserVideosFromFirebase() {
    if (!appState.currentUser.uid) return;
    try {
        const videosRef = db.collection('videos').where('uploaderUid', '==', appState.currentUser.uid).orderBy('createdAt', 'desc');
        const snapshot = await videosRef.get();
        appState.userUploadedVideos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderUserVideos();
    } catch (error) {
        console.error("Error loading user videos:", error);
    }
}

async function loadAllVideosFromFirebase() {
    const videosRef = db.collection('videos').orderBy('createdAt', 'desc').limit(20);
    const snapshot = await videosRef.get();
    const loadedVideos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    fullVideoList = [...loadedVideos];
    appState.allVideos = [...loadedVideos];

    document.querySelectorAll('.category-chip').forEach(chip => chip.classList.remove('active'));
    const allChip = document.querySelector('.category-chip');
    if (allChip) allChip.classList.add('active');

    renderVideoSwiper();
}

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetScreen = `${item.getAttribute('data-nav')}-screen`;
        if (appState.currentScreen !== targetScreen) {
            navigateTo(targetScreen);
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        }
    });
});

profileImageInput.addEventListener('change', function() {
    if (this.files[0]) {
        const reader = new FileReader();
        reader.onload = e => profileImagePreview.src = e.target.result;
        reader.readAsDataURL(this.files[0]);
    }
});

function showHome() { navigateTo('home-screen'); }
function showWalletScreen() { navigateTo('wallet-screen'); }
function checkCustom(select, inputId) { document.getElementById(inputId).style.display = select.value === 'custom' ? 'block' : 'none'; }

async function saveAndContinue() {
    saveContinueBtn.disabled = true;
    saveContinueBtn.textContent = 'Saving...';
    const name = document.getElementById('info-name').value.trim();
    if (!name) {
        alert('Please enter your name.');
        saveContinueBtn.disabled = false;
        saveContinueBtn.textContent = 'Continue';
        return;
    }
    const userData = { name, mobile: document.getElementById('info-mobile').value, email: document.getElementById('info-email').value, address: document.getElementById('info-address').value, hobby: document.getElementById('info-hobby').value, state: document.getElementById('info-state').value, country: document.getElementById('info-country').value };
    const file = profileImageInput.files[0];
    if (file) {
        try {
            const storageRef = storage.ref(`avatars/${appState.currentUser.uid}/${file.name}`);
            const snapshot = await storageRef.put(file);
            userData.avatar = await snapshot.ref.getDownloadURL();
        } catch (error) {
            console.error("Avatar upload error:", error);
            alert("Failed to upload profile picture.");
        }
    }
    try {
        await db.collection('users').doc(appState.currentUser.uid).set(userData, { merge: true });
        appState.currentUser = { ...appState.currentUser, ...userData };
        updateProfileUI();
        await startAppLogic();

    } catch (error) {
        console.error("Profile save error:", error);
        alert("Failed to save profile.");
    }
}

function updateProfileUI() {
    profileUsernameElement.textContent = appState.currentUser.name || `@${appState.currentUser.username || 'new_user'}`;
    const avatarUrl = appState.currentUser.avatar || "https://via.placeholder.com/120/222/FFFFFF?text=+";
    profileAvatarElement.src = avatarUrl;
    profileImagePreview.src = avatarUrl;
    document.getElementById('info-name').value = appState.currentUser.name || '';
    document.getElementById('info-mobile').value = appState.currentUser.mobile || '';
    document.getElementById('info-email').value = appState.currentUser.email || '';
    document.getElementById('info-address').value = appState.currentUser.address || '';
    document.getElementById('info-hobby').value = appState.currentUser.hobby || '';
    document.getElementById('info-state').value = appState.currentUser.state || '';
    document.getElementById('info-country').value = appState.currentUser.country || 'India';
}

function openUploadDetailsModal() {
    modalTitle.textContent = "Upload Details";
    modalSaveButton.textContent = "Upload Video";
    editingVideoIdInput.value = "";
    uploadDetailsModal.classList.add('active');
}

function closeUploadDetailsModal() { uploadDetailsModal.classList.remove('active'); }
function toggleCategoryOptions() { categorySelectorDisplay.classList.toggle('open'); }

function selectCategory(category) {
    appState.uploadDetails.category = category;
    selectedCategoryText.textContent = category;
    categorySelectorDisplay.classList.remove('open');
    // --- NEW ---: Also set category for premium upload if that screen is active
    if (appState.currentScreen === 'premium-upload-screen') {
        // You'll need a similar category display on the premium screen
        // For now, we just store it.
    }
}

function selectAudience(audienceType) {
    appState.uploadDetails.audience = audienceType;
    audienceOptions.forEach(option => option.classList.remove('selected'));
    document.querySelector(`.audience-option[data-audience="${audienceType}"]`).classList.add('selected');
}

async function handleSave() {
    const videoId = editingVideoIdInput.value;
    if (videoId) await saveVideoEdits(videoId);
    else await saveNewVideo(); // This is for YouTube videos
}

async function saveNewVideo() {
    modalSaveButton.disabled = true;
    modalSaveButton.textContent = 'Uploading...';
    const videoUrlValue = modalVideoUrlInput.value.trim();
    const title = modalVideoTitle.value.trim();
    const category = appState.uploadDetails.category;
    if (!videoUrlValue || !title || !category) {
        alert("Please fill all required fields.");
        modalSaveButton.disabled = false;
        modalSaveButton.textContent = 'Upload Video';
        return;
    }
    const videoData = {
        uploaderUid: auth.currentUser.uid, uploaderUsername: appState.currentUser.name || appState.currentUser.username, uploaderAvatar: appState.currentUser.avatar, createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        title, description: modalVideoDescription.value.trim(), hashtags: modalVideoHashtags.value.trim(),
        videoUrl: videoUrlValue,
        thumbnailUrl: `https://img.youtube.com/vi/${videoUrlValue}/hqdefault.jpg`,
        videoType: 'youtube', // --- MODIFIED ---: Explicitly set type
        category, audience: appState.uploadDetails.audience || 'all', commentsEnabled: commentsToggleInput.checked, likes: 0, commentCount: 0
    };
    try {
        await db.collection("videos").add(videoData);
        alert("Video uploaded!");
        closeUploadDetailsModal();
        await loadAllVideosFromFirebase(); // Reload videos
        navigateTo('home-screen');
    } catch (error) {
        console.error("Error uploading video:", error);
        alert("Upload failed. Error: " + error.message);
    } finally {
        modalSaveButton.disabled = false;
        modalSaveButton.textContent = 'Upload Video';
    }
}

function renderCategories() {
    categoryOptionsContainer.innerHTML = categories.map(cat => `<div class="category-option" onclick="selectCategory('${cat}')">${cat}</div>`).join('');
    // --- NEW ---: You would also populate the category selector on the premium page here if it exists
}

// --- MODIFIED ---: Main rendering function updated for both video types
function renderVideoSwiper() {
    videoSwiper.innerHTML = '';
    players = {};
    if (videoObserver) videoObserver.disconnect();
    if (appState.allVideos.length === 0) {
        videoSwiper.appendChild(homeStaticMessageContainer);
        homeStaticMessageContainer.style.display = 'flex';
    } else {
        homeStaticMessageContainer.style.display = 'none';
        appState.allVideos.forEach(video => {
            const slide = document.createElement('div');
            slide.className = 'video-slide';
            slide.dataset.videoId = video.id;
            slide.dataset.videoType = video.videoType || 'youtube'; // Store type for easy access
            slide.addEventListener('click', (e) => {
                if (e.target.closest('.video-actions-overlay') || e.target.closest('.uploader-info')) return;
                togglePlayPause(video.id);
            });
            slide.addEventListener('dblclick', () => { handleLikeAction(video.id); });

            let playerHtml = '';
            // --- MODIFIED ---: Conditional player rendering
            if (video.videoType === 'premium') {
                // HTML5 Video Player for premium content
                playerHtml = `<video class="html5-player" id="player-${video.id}" src="${video.videoUrl}" loop muted playsinline></video>`;
            } else {
                // YouTube Iframe Player (default)
                playerHtml = `<div class="player-container" id="player-${video.id}"></div>`;
            }

            const thumbnailUrl = video.thumbnailUrl || 'https://via.placeholder.com/420x740/000000/FFFFFF?text=Video';
            slide.innerHTML = `
                <div class="video-preloader" style="background-image: url('${thumbnailUrl}');"><div class="loader"></div></div>
                ${playerHtml}
                <i class="fas fa-heart like-heart-popup"></i>
                <div class="video-meta-overlay">
                    <div class="uploader-info"><img src="${video.uploaderAvatar || 'https://via.placeholder.com/40'}" class="uploader-avatar"><span class="uploader-name">${video.uploaderUsername || 'User'}</span></div>
                    <p class="video-title">${video.title}</p>
                </div>
                <div class="video-actions-overlay">
                    <div class="action-icon-container" data-action="like" onclick="handleLikeAction('${video.id}')"><i class="far fa-heart icon"></i><span class="count">${video.likes || 0}</span></div>
                    <div class="action-icon-container ${!video.commentsEnabled ? 'disabled' : ''}" data-action="comment" onclick="${video.commentsEnabled ? `openCommentsModal('${video.id}', '${video.uploaderUid}')` : ''}"><i class="fas fa-comment-dots icon"></i><span class="count">${video.commentCount || 0}</span></div>
                </div>`;
            videoSwiper.appendChild(slide);
        });

        if (isYouTubeApiReady) {
            initializePlayers();
        }
    }
}

function onYouTubeIframeAPIReady() {
    isYouTubeApiReady = true;
    if (window.pendingAppStart) {
        window.pendingAppStart();
    }
}

// --- MODIFIED ---: This function now initializes both YT and HTML5 players
function initializePlayers() {
    if (!isYouTubeApiReady) return; // Still need this for YouTube part

    appState.allVideos.forEach((video) => {
        const playerId = `player-${video.id}`;
        const playerElement = document.getElementById(playerId);

        if (playerElement && !players[video.id]) {
            if (video.videoType === 'premium') {
                // For premium videos, the element is the <video> tag itself.
                // We just store a reference to it.
                players[video.id] = playerElement;
                playerElement.addEventListener('canplay', () => {
                    const preloader = playerElement.closest('.video-slide').querySelector('.video-preloader');
                    if(preloader) preloader.style.display = 'none';
                });
            } else {
                // For YouTube, we create a new YT.Player instance.
                players[video.id] = new YT.Player(playerId, {
                    height: '100%',
                    width: '100%',
                    videoId: video.videoUrl,
                    playerVars: { 'autoplay': 0, 'controls': 0, 'mute': 1, 'rel': 0, 'showinfo': 0, 'modestbranding': 1, 'loop': 1, 'playlist': video.videoUrl, 'fs': 0, 'iv_load_policy': 3, 'origin': window.location.origin },
                    events: { 'onReady': onPlayerReady, 'onStateChange': onPlayerStateChange }
                });
            }
        }
    });
    setupVideoObserver();
}

function onPlayerReady(event) {
    if (window.resolveFirstPlayerReady) {
        window.resolveFirstPlayerReady();
        delete window.resolveFirstPlayerReady;
    }
}

function onPlayerStateChange(event) {
    const preloader = event.target.getIframe().closest('.video-slide').querySelector('.video-preloader');
    if (event.data !== YT.PlayerState.UNSTARTED) {
        if(preloader) preloader.style.display = 'none';
    }
}

// --- MODIFIED ---: Unified play/pause toggle function
function togglePlayPause(videoId) {
    const player = players[videoId];
    if (!player) return;

    if (player instanceof YT.Player) { // It's a YouTube player
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            player.pauseVideo();
        } else {
            player.playVideo();
        }
    } else { // It's an HTML5 video element
        if (player.paused) {
            player.play();
        } else {
            player.pause();
        }
    }
}

// --- NEW --- Helper functions for unified player control
function playActivePlayer(videoId) {
    const player = players[videoId];
    if (!player) return;

    if (player instanceof YT.Player) {
        if (typeof player.playVideo === 'function') player.playVideo();
        if (userHasInteracted && typeof player.unMute === 'function') player.unMute();
    } else {
        player.play().catch(e => console.log("Play interrupted"));
        player.muted = !userHasInteracted;
    }
}

function pauseActivePlayer(videoId) {
    const videoIdToPause = videoId || activePlayerId;
    if (!videoIdToPause) return;

    const player = players[videoIdToPause];
    if (!player) return;

    if (player instanceof YT.Player) {
        if (typeof player.pauseVideo === 'function') player.pauseVideo();
    } else {
        player.pause();
    }
}


function setupVideoObserver() {
    if (videoObserver) videoObserver.disconnect();
    const options = { root: videoSwiper, threshold: 0.75 };
    const handleIntersection = (entries) => {
        entries.forEach(entry => {
            const videoId = entry.target.dataset.videoId;
            if (!videoId || !players[videoId]) return;

            if (entry.isIntersecting) {
                // Pause the previously active player
                if (activePlayerId && activePlayerId !== videoId) {
                    pauseActivePlayer(activePlayerId);
                }
                activePlayerId = videoId;
                playActivePlayer(videoId);

            } else {
                // This video is scrolling out of view, pause it
                if(videoId === activePlayerId) {
                     pauseActivePlayer(videoId);
                     activePlayerId = null;
                }
            }
        });
    };
    videoObserver = new IntersectionObserver(handleIntersection, options);
    document.querySelectorAll('.video-slide').forEach(slide => {
        if (players[slide.dataset.videoId]) videoObserver.observe(slide);
    });
}

async function openCommentsModal(videoId, videoOwnerUid) {
    appState.activeComments = { videoId, videoOwnerUid }; commentsModal.classList.add('active'); commentsList.innerHTML = '<li>Loading comments...</li>';
    try {
        const commentsRef = db.collection('videos').doc(videoId).collection('comments').orderBy('createdAt', 'desc');
        const snapshot = await commentsRef.get();
        if (snapshot.empty) { commentsList.innerHTML = '<li style="text-align:center; color: #888;">Be the first to comment!</li>'; }
        else {
            commentsList.innerHTML = snapshot.docs.map(doc => {
                const comment = { id: doc.id, ...doc.data() };
                const canDelete = appState.currentUser.uid === comment.uploaderUid || appState.currentUser.uid === videoOwnerUid;
                return `<li class="comment-item">
                            <img src="${comment.uploaderAvatar || 'https://via.placeholder.com/120/222/FFFFFF?text=+'}" alt="avatar" class="avatar">
                            <div class="comment-body"><div class="username">${comment.uploaderUsername}</div><div class="text">${comment.text}</div></div>
                            ${canDelete ? `<i class="fas fa-trash delete-comment-btn" onclick="deleteComment('${comment.id}')"></i>` : ''}
                        </li>`;
            }).join('');
        }
    } catch (error) { console.error("Error loading comments:", error); commentsList.innerHTML = '<li>Could not load comments.</li>'; }
}

function closeCommentsModal() { commentsModal.classList.remove('active'); }

async function postComment() {
    const { videoId } = appState.activeComments; const text = commentInput.value.trim(); if (!text || !videoId) return; sendCommentBtn.disabled = true;
    const newComment = { text, uploaderUid: appState.currentUser.uid, uploaderUsername: appState.currentUser.name, uploaderAvatar: appState.currentUser.avatar, createdAt: firebase.firestore.FieldValue.serverTimestamp() };
    const videoRef = db.collection('videos').doc(videoId); const commentRef = videoRef.collection('comments').doc();
    try {
        await db.runTransaction(async (transaction) => { transaction.set(commentRef, newComment); transaction.update(videoRef, { commentCount: firebase.firestore.FieldValue.increment(1) }); });
        commentInput.value = ''; openCommentsModal(videoId, appState.activeComments.videoOwnerUid);
    } catch (error) { console.error("Error posting comment: ", error); alert("Could not post comment. Please check Firestore Rules."); }
    finally { sendCommentBtn.disabled = false; }
}

function handleLikeAction(videoId) { /* Liking logic... */ }
function logoutUser() { if (confirm("Log out?")) auth.signOut().then(() => window.location.reload()); }
function initiateWithdrawal() { navigateTo('withdraw-success-screen'); }
function renderCategoriesInBar() { /* Category rendering logic... */ }
function filterVideosByCategory(category, element) { /* Filtering logic... */ }


// =======================================================================
// === NEW: Friends/Chat Screen Functions (Inspired by your prompt) ===
// =======================================================================

function openChatWindow(userId, username) {
    alert(`Opening chat with ${username} (ID: ${userId}).\nThis will navigate to a full chat screen in a future update.`);
}

function showFriendsSubView(viewName) {
    alert(`Switching to ${viewName} view.\nThis section is under development.`);
}

function openChatMenu() {
    const options = [
        "Block User", "Unblock User", "Clear Chat History", "Mute Notifications",
        "Report User", "Pin Chat", "Archive Chat", "Add to Close Friends",
        "View Profile", "Translate Messages"
    ];
    alert("Chat Menu Options (for future implementation):\n\n" + options.join("\n"));
}

function showDeleteMessageOptions() {
    const choice = confirm("Long press detected!\n\nChoose an option:\n'OK' for 'Delete for Everyone'\n'Cancel' for 'Delete for Me'");
    if (choice) {
        alert("Message will be deleted for everyone.");
    } else {
        alert("Message will be deleted for you only.");
    }
}

// --- NEW ---: Functions for Premium Video Upload
function handlePremiumFileUpload() {
    if (!premiumUploadBtn) return;
    premiumUploadBtn.disabled = true;
    premiumUploadBtn.textContent = 'Uploading...';

    const file = premiumVideoFileInput.files[0];
    const title = premiumVideoTitle.value.trim();
    const category = appState.uploadDetails.category; // Make sure category is selected

    if (!file || !title || !category) {
        alert("Please select a video file and enter a title and category.");
        premiumUploadBtn.disabled = false;
        premiumUploadBtn.textContent = 'Upload Video';
        return;
    }

    if(premiumUploadProgress) premiumUploadProgress.style.display = 'block';

    const storageRef = storage.ref(`premium_videos/${auth.currentUser.uid}/${Date.now()}-${file.name}`);
    const uploadTask = storageRef.put(file);

    uploadTask.on('state_changed',
        (snapshot) => {
            // Progress function
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            if(premiumUploadProgressText) premiumUploadProgressText.textContent = `Uploading: ${Math.round(progress)}%`;
        },
        (error) => {
            // Error function
            console.error("Upload failed:", error);
            alert("Upload failed. Please try again.");
            if(premiumUploadProgress) premiumUploadProgress.style.display = 'none';
            premiumUploadBtn.disabled = false;
            premiumUploadBtn.textContent = 'Upload Video';
        },
        async () => {
            // Complete function
            if(premiumUploadProgressText) premiumUploadProgressText.textContent = 'Processing...';
            try {
                const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                const videoData = {
                    uploaderUid: auth.currentUser.uid,
                    uploaderUsername: appState.currentUser.name || appState.currentUser.username,
                    uploaderAvatar: appState.currentUser.avatar,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    title: title,
                    description: premiumVideoDescription.value.trim(),
                    hashtags: premiumVideoHashtags.value.trim(),
                    videoUrl: downloadURL,
                    // NOTE: Thumbnail generation from video is complex on the client-side.
                    // We're using a placeholder. A server-side function would be ideal.
                    thumbnailUrl: 'https://via.placeholder.com/420x740/111/fff?text=Video',
                    videoType: 'premium', // Important for the player
                    category: category,
                    audience: appState.uploadDetails.audience || 'all',
                    commentsEnabled: true, // or get from a toggle
                    likes: 0,
                    commentCount: 0
                };

                await db.collection("videos").add(videoData);
                alert("Premium video uploaded successfully!");
                await loadAllVideosFromFirebase();
                navigateTo('home-screen');

            } catch (error) {
                console.error("Error saving video data:", error);
                alert("Could not save video details. Error: " + error.message);
            } finally {
                 if(premiumUploadProgress) premiumUploadProgress.style.display = 'none';
                 premiumUploadBtn.disabled = false;
                 premiumUploadBtn.textContent = 'Upload Video';
            }
        }
    );
}

const startAppLogic = async () => {
    const firstPlayerReadyPromise = new Promise(resolve => { window.resolveFirstPlayerReady = resolve; });
    await loadAllVideosFromFirebase();
    if (appState.allVideos.length > 0 && isYouTubeApiReady) { await firstPlayerReadyPromise; }
    else { delete window.resolveFirstPlayerReady; }
    navigateTo('home-screen');
};

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    renderCategories();
    renderCategoriesInBar();

    document.getElementById('get-started-btn').addEventListener('click', async () => {
        document.getElementById('get-started-btn').style.display = 'none';
        document.getElementById('loading-container').style.display = 'flex';
        await checkUserProfileAndProceed(auth.currentUser);
    });

    appContainer.addEventListener('click', () => { if (!userHasInteracted) userHasInteracted = true; }, { once: true });

    document.getElementById('home-menu-icon').addEventListener('click', () => { document.getElementById('main-sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('open'); });
    document.getElementById('close-sidebar-btn').addEventListener('click', () => { document.getElementById('main-sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); });
    document.getElementById('sidebar-overlay').addEventListener('click', () => { document.getElementById('main-sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); });
    sendCommentBtn.addEventListener('click', postComment);
    commentInput.addEventListener('keypress', (e) => e.key === 'Enter' && postComment());
    document.getElementById('navigate-to-theme-btn').addEventListener('click', () => { document.getElementById('main-sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); navigateTo('theme-settings-screen'); });
    document.getElementById('back-from-theme-btn').addEventListener('click', () => navigateTo('home-screen'));
    document.querySelectorAll('#theme-settings-screen .theme-btn').forEach(button => { button.addEventListener('click', () => { document.documentElement.classList.toggle('light-theme', button.dataset.theme !== 'dark'); }); });
    document.querySelectorAll('#theme-settings-screen .color-swatch').forEach(swatch => { swatch.addEventListener('click', () => { document.documentElement.style.setProperty('--primary-neon', swatch.dataset.color); }); });

    // --- MODIFIED ---: The `upload-action-button` now has specific IDs you will add to your HTML
    // This button will now open the YouTube modal
    const openYouTubeBtn = document.getElementById('open-youtube-modal-btn');
    if (openYouTubeBtn) {
        openYouTubeBtn.addEventListener('click', openUploadDetailsModal);
    }
    // This button will navigate to the new premium upload screen
    const openPremiumBtn = document.getElementById('open-premium-upload-btn');
    if (openPremiumBtn) {
        openPremiumBtn.addEventListener('click', () => navigateTo('premium-upload-screen'));
    }
    
    document.getElementById('navigate-to-editor-btn').addEventListener('click', () => navigateTo('image-editor-screen'));
    document.getElementById('back-from-editor-btn').addEventListener('click', () => document.querySelector('.nav-item[data-nav="upload"]').click());

    // --- NEW ---: Event listeners for the new premium upload screen
    if (premiumUploadBtn) {
        premiumUploadBtn.addEventListener('click', handlePremiumFileUpload);
    }
    if (backFromPremiumBtn) {
        backFromPremiumBtn.addEventListener('click', () => navigateTo('upload-screen'));
    }
    if(premiumVideoFileInput) {
        premiumVideoFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file && premiumVideoPreview) {
                const fileURL = URL.createObjectURL(file);
                premiumVideoPreview.src = fileURL;
                premiumVideoPreview.style.display = 'block';
            }
        });
    }

    // === NEW EVENT LISTENERS FOR FRIENDS SCREEN (Placeholder) ===
    const friendsNavMessages = document.getElementById('friends-nav-messages');
    const friendsNavStatus = document.getElementById('friends-nav-status');
    const friendsNavStory = document.getElementById('friends-nav-story');
    const friendsNavContent = document.getElementById('friends-nav-content');
    const friendsNavAi = document.getElementById('friends-nav-ai');

    if (friendsNavMessages) friendsNavMessages.addEventListener('click', () => showFriendsSubView('Messages'));
    if (friendsNavStatus) friendsNavStatus.addEventListener('click', () => showFriendsSubView('Status'));
    if (friendsNavStory) friendsNavStory.addEventListener('click', () => showFriendsSubView('Story'));
    if (friendsNavContent) friendsNavContent.addEventListener('click', () => showFriendsSubView('Content'));
    if (friendsNavAi) friendsNavAi.addEventListener('click', () => showFriendsSubView('AI Friend'));
});

/* ======================================================= */
/* === AI Photo Editor Script (Code 1) - START === */
/* ======================================================= */
// ... (Photo editor code remains unchanged) ...
const photoEditor = (() => {
    let isInitialized = false;

    // --- DOM Elements ---
    const getEl = (id) => document.getElementById(id);
    let mainImage, imageWrapper, uploadInput, cameraBtn, videoFeed, captureBtn, toolbarNav, panelContainer, imageContainer, drawingCanvas, drawCtx, brushBtn, eraserBtn, colorPicker, brushSizeSlider, brushSizeVal, brushPreview, undoDrawBtn, redoDrawBtn, clearDrawBtn, textInput, textColorPicker, textSizeSlider, textSizeVal, textPreview, fontSelectBtn, fontPickerModal, addTextBtn, cropOverlay, applyCropBtn, cancelCropBtn, cropShapesContainer;

    // --- DATA ---
    const filters = { 'Original': 'none', 'Clarendon': 'contrast(1.2) saturate(1.35)', 'Gingham': 'brightness(1.05) hue-rotate(-10deg)', 'Moon': 'grayscale(1) contrast(1.1) brightness(1.1)', 'Lark': 'contrast(.9) brightness(1.1) saturate(1.1)', 'Reyes': 'sepia(.22) brightness(1.1) contrast(.85) saturate(.75)', 'Juno': 'contrast(1.1) brightness(1.05) saturate(1.4)', 'Slumber': 'saturate(0.66) brightness(1.05)', 'Crema': 'sepia(.3) contrast(1.1) brightness(1.1) saturate(1.2)', 'Ludwig': 'brightness(1.05) saturate(1.5) contrast(0.95)', 'Aden': 'hue-rotate(-20deg) contrast(0.9) saturate(0.85) brightness(1.2)', 'Perpetua': 'contrast(1.1) saturate(1.2) brightness(1.05)', 'Amaro': 'hue-rotate(-10deg) contrast(0.9) brightness(1.1) saturate(1.5)', 'Mayfair': 'contrast(1.1) saturate(1.1)', 'Rise': 'brightness(1.05) sepia(0.2) contrast(0.9) saturate(0.9)', 'Hudson': 'brightness(1.2) contrast(0.9) saturate(1.1)', 'Valencia': 'contrast(1.08) brightness(1.08) sepia(0.08)', 'X-Pro II': 'sepia(0.3) contrast(1.5) brightness(0.9) saturate(1.3)', 'Sierra': 'contrast(0.85) saturate(1.2) brightness(1.1) sepia(0.15)', 'Willow': 'grayscale(0.5) contrast(0.95) brightness(0.9)', 'Lo-Fi': 'saturate(1.1) contrast(1.5)', 'Inkwell': 'sepia(0.3) contrast(1.1) brightness(1.1) grayscale(1)', 'Hefe': 'contrast(1.2) saturate(1.2) sepia(0.2)', 'Nashville': 'sepia(0.2) contrast(1.2) brightness(1.05) saturate(1.2)', 'Sutro': 'brightness(0.8) contrast(1.2) saturate(1.2) sepia(0.4)', 'Toaster': 'contrast(1.5) brightness(0.9)', 'Brannan': 'sepia(0.5) contrast(1.4)', '1977': 'contrast(1.1) brightness(1.1) saturate(1.3) sepia(0.4)', 'Kelvin': 'sepia(0.35) brightness(1.1) contrast(1.2)', 'Maven': 'sepia(.35) contrast(1.05) brightness(1.05) saturate(1.75)', 'Ginza': 'sepia(.05) contrast(1.15) brightness(1.1) saturate(1.35)', 'Skyline': 'saturate(1.2) contrast(1.15)', 'Dogpatch': 'contrast(1.3) brightness(1.1)', 'Brooklyn': 'contrast(1.1) brightness(1.1) sepia(0.2)', 'Helena': 'contrast(1.05) saturate(1.1) sepia(0.15)', 'Ashby': 'brightness(1.1) sepia(0.4)', 'Charmes': 'sepia(0.25) contrast(1.25) saturate(1.35)', 'Stinson': 'contrast(0.8) brightness(1.15) saturate(0.9)', 'Vesper': 'contrast(1.05) sepia(0.25) brightness(1.05)', 'Earlybird': 'sepia(0.3) contrast(1.1) brightness(1.1)', 'B&W': 'grayscale(100%)', 'Sepia': 'sepia(100%)', 'Vintage': 'sepia(0.5) contrast(1.2) brightness(1.1)', 'Cool': 'hue-rotate(180deg)', 'Warm': 'sepia(0.3) brightness(1.1)', 'Poprocket': 'sepia(0.15) brightness(1.2) contrast(1.2)', 'Invert': 'invert(100%)' };
    const stickers = ['https://i.ibb.co/L5rC3x7/sticker1.png','https://i.ibb.co/hLqj6nL/sticker2.png','https://i.ibb.co/m0fWMPJ/sticker3.png'];
    const frameCategories = { 'flower': {name: 'Flower', icon: 'https://i.ibb.co/6RKCR5MF/IMG-20250701-WA0001.jpg', frames: ['https://i.ibb.co/0yKnRbvS/1000147965-removebg-preview.png', 'https://i.ibb.co/Q3hQ3kkk/1000147958-removebg-preview.png', 'https://i.ibb.co/Cs2t8PWb/1000147957-removebg-preview.png', 'https://i.ibb.co/yDCLCyW/1000147956-removebg-preview.png', 'https://i.ibb.co/SX91vZWC/1000147942-removebg-preview.png', 'https://i.ibb.co/j9X9ZdBT/1000147943-removebg-preview.png']}, 'geometric': {name: 'Geometric', icon: 'https://i.ibb.co/k2c50c1/frame-geo-thumb.jpg', frames: ['https://i.ibb.co/H26h6mN/frame-geo-1.png', 'https://i.ibb.co/3F0x0x5/frame-geo-2.png']} };
    const fonts = [ { name: 'Roboto', value: "'Roboto Flex', sans-serif" }, { name: 'Pacifico', value: "'Pacifico', cursive" }, { name: 'Dancing Script', value: "'Dancing Script', cursive" }, { name: 'Marker', value: "'Permanent Marker', cursive" }, { name: 'Lobster', value: "'Lobster', cursive" }, { name: 'Oswald', value: "'Oswald', sans-serif" }, { name: 'Bebas Neue', value: "'Bebas Neue', cursive" }, { name: 'Caveat', value: "'Caveat', cursive" }, { name: 'Shadows', value: "'Shadows Into Light', cursive" }, { name: 'Raleway', value: "'Raleway', sans-serif" }, { name: 'Montserrat', value: "'Montserrat', sans-serif" }, { name: 'Lato', value: "'Lato', sans-serif" }, { name: 'Poppins', value: "'Poppins', sans-serif" }, { name: 'Nunito', value: "'Nunito', sans-serif" }, { name: 'Cormorant', value: "'Cormorant Garamond', serif" }, { name: 'Josefin Sans', value: "'Josefin Sans', sans-serif" }, { name: 'Comfortaa', value: "'Comfortaa', cursive" }, { name: 'Indie Flower', value: "'Indie Flower', cursive" }, { name: 'Amatic SC', value: "'Amatic SC', cursive" }, ];

    let currentFilter, currentStream, isDrawing, lastX, lastY, brushColor, brushSize, currentDrawTool, drawingHistory, historyIndex, activeElement, isCropping, currentFont, adjustments, cropBox, currentCropRatio;

    function initializeState() {
        currentFilter = 'none'; currentStream = null; isDrawing = false; lastX = 0; lastY = 0;
        const rootStyle = getComputedStyle(document.documentElement);
        brushColor = rootStyle.getPropertyValue('--primary-neon').trim() || '#F44336';
        brushSize = 8; currentDrawTool = 'brush';
        drawingHistory = []; historyIndex = -1; activeElement = null; isCropping = false;
        currentFont = fonts[0];
        adjustments = { brightness: 100, contrast: 100, saturate: 100, 'hue-rotate': 0, grayscale: 0, blur: 0 };
        cropBox = null; currentCropRatio = 'free';
    }

    function initialize() {
        mainImage = getEl('mainImage'); imageWrapper = getEl('image-wrapper'); uploadInput = getEl('upload'); cameraBtn = getEl('camera-btn'); videoFeed = getEl('video-feed'); captureBtn = getEl('capture-btn'); toolbarNav = getEl('toolbar-nav'); panelContainer = getEl('panel-container'); imageContainer = getEl('image-container'); drawingCanvas = getEl('drawing-canvas'); drawCtx = drawingCanvas.getContext('2d'); brushBtn = getEl('brush-btn'); eraserBtn = getEl('eraser-btn'); colorPicker = getEl('color-picker'); brushSizeSlider = getEl('brush-size'); brushSizeVal = getEl('brush-size-val'); brushPreview = getEl('brush-preview'); undoDrawBtn = getEl('undo-draw-btn'); redoDrawBtn = getEl('redo-draw-btn'); clearDrawBtn = getEl('clear-draw-btn'); textInput = getEl('text-input'); textColorPicker = getEl('text-color-picker'); textSizeSlider = getEl('text-size-slider'); textSizeVal = getEl('text-size-val'); textPreview = getEl('text-preview'); fontSelectBtn = getEl('font-select-btn'); fontPickerModal = getEl('font-picker-modal'); addTextBtn = getEl('add-text-btn'); cropOverlay = getEl('crop-overlay'); applyCropBtn = getEl('apply-crop-btn'); cancelCropBtn = getEl('cancel-crop-btn'); cropShapesContainer = getEl('crop-shapes');

        initializeState();

        populateFilters(); populateStickers(); populateFrameCategories(); populateFontModal(); setupEventListeners(); setupDrawingCanvas(); setupTextPanel();
        mainImage.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg width="380" height="675" xmlns="http://www.w3.org/2000/svg"%3E%3Crect width="100%25" height="100%25" fill="%231e1e1e"/%3E%3Ctext x="50%25" y="50%25" font-family="Roboto Flex, sans-serif" font-size="18" fill="%23a0a0a0" text-anchor="middle" dominant-baseline="middle"%3EPlease Upload an Image%3C/text%3E%3C/svg%3E';
        drawingCanvas.style.display = 'block'; document.querySelector('#image-editor-screen .tool-btn[data-tool="filters"]').click();
        window.addEventListener('resize', () => { if(isInitialized) { resizeDrawingCanvas(); if(isCropping) endCrop(); } });
        imageContainer.addEventListener('click', (e) => { if (e.target === imageContainer || e.target === imageWrapper) deactivateAllElements(); });
    }
    function populateFilters() { const c = getEl('filtersPanel');c.innerHTML = '';Object.keys(filters).forEach((n, i) => { const a = document.createElement('div');a.className = 'filter-card';if(i===0)a.classList.add('active');a.innerHTML = `<div class="filter-preview"></div><span class="filter-name">${n}</span>`;a.querySelector('.filter-preview').style.filter = filters[n];a.onclick = () => { currentFilter = filters[n];applyAllEffects();document.querySelector('#image-editor-screen #filtersPanel .filter-card.active').classList.remove('active');a.classList.add('active'); };c.appendChild(a); }); }
    function populateStickers() { const c = getEl('stickersPanel');c.innerHTML='';stickers.forEach(s => { const i = document.createElement('img');i.className = 'sticker-item';i.src = s;i.onclick = () => addSticker(s);c.appendChild(i); }); }
    function populateFrameCategories() { const c = getEl('framesCategoryPanel');c.innerHTML = '';const n = document.createElement('div');n.className = 'frame-option active';n.dataset.frame = 'none';n.innerHTML = '<i class="fa-solid fa-ban"></i>';n.onclick = () => applyFrame('none');c.appendChild(n);Object.keys(frameCategories).forEach(k => { const y = frameCategories[k];const i = document.createElement('div');i.className = 'frame-category-item';i.style.backgroundImage = `url(${y.icon})`;i.innerHTML = `<span class="category-name">${y.name}</span>`;i.onclick = () => showFramesForCategory(k);c.appendChild(i); }); }
    function showFramesForCategory(k) { const a = frameCategories[k];const c = getEl('framesDetailPanel');c.innerHTML = '';const b = document.createElement('div');b.className = 'frame-option';b.id = 'frame-back-btn';b.innerHTML = '<i class="fa-solid fa-arrow-left"></i>';b.onclick = () => { getEl('framesDetailPanel').classList.remove('active');getEl('framesCategoryPanel').classList.add('active'); };c.appendChild(b);a.frames.forEach(u => { const o = document.createElement('div');o.className = 'frame-option';o.style.backgroundImage = `url(${u})`;o.onclick = () => applyFrame(u);c.appendChild(o); });getEl('framesCategoryPanel').classList.remove('active');getEl('framesDetailPanel').classList.add('active'); }
    function populateFontModal() { const c = fontPickerModal.querySelector('.font-picker-content');c.innerHTML = '';fonts.forEach((f, i) => { const l = document.createElement('label');l.className = 'font-option';l.innerHTML = `<span style="font-family: ${f.value}">${f.name}</span> <input type="radio" name="font" value="${i}" ${i === 0 ? 'checked' : ''}> <div class="radio-custom"></div>`;c.appendChild(l); }); }
    function setupEventListeners() {
        uploadInput.addEventListener('change', handleUpload); cameraBtn.addEventListener('click', toggleCamera); captureBtn.addEventListener('click', captureImage); toolbarNav.addEventListener('click', handleToolbarClick); fontSelectBtn.addEventListener('click', () => fontPickerModal.style.display = 'flex');
        fontPickerModal.addEventListener('click', (e) => { if (e.target === fontPickerModal || e.target.closest('.font-option')) { const r = e.target.closest('.font-option')?.querySelector('input[type="radio"]'); if (r) { currentFont = fonts[r.value]; fontSelectBtn.textContent = currentFont.name; fontSelectBtn.style.fontFamily = currentFont.value; } fontPickerModal.style.display = 'none'; } });
        document.querySelectorAll('#image-editor-screen .adjust-slider-input').forEach(s => s.addEventListener('input', handleAdjustSlider));
        applyCropBtn.addEventListener('click', applyCrop); cancelCropBtn.addEventListener('click', endCrop); cropShapesContainer.addEventListener('click', handleCropShapeChange);
    }
    function setupDrawingCanvas() { const u = () => { brushSize = brushSizeSlider.value;brushColor = colorPicker.value;brushSizeVal.textContent = `${brushSize}px`;const p = Math.max(4, Math.min(brushSize, 30));brushPreview.style.width = `${p}px`;brushPreview.style.height = `${p}px`;brushPreview.style.background = brushColor; };brushBtn.onclick = () => { currentDrawTool = 'brush';brushBtn.classList.add('active');eraserBtn.classList.remove('active'); };eraserBtn.onclick = () => { currentDrawTool = 'eraser';eraserBtn.classList.add('active');brushBtn.classList.remove('active'); };colorPicker.oninput = u;brushSizeSlider.oninput = u;const g = (e) => { const r = drawingCanvas.getBoundingClientRect();const x = e.touches ? e.touches[0].clientX : e.clientX;const y = e.touches ? e.touches[0].clientY : e.clientY;return { x: x - r.left, y: y - r.top }; };const s = (e) => { isDrawing = true;[lastX, lastY] = [g(e).x, g(e).y]; };const d = (e) => { if (!isDrawing) return;e.preventDefault();const {x,y} = g(e);drawCtx.beginPath();drawCtx.moveTo(lastX, lastY);drawCtx.lineTo(x, y);drawCtx.strokeStyle = brushColor;drawCtx.lineWidth = brushSize;drawCtx.lineCap = 'round';drawCtx.lineJoin = 'round';drawCtx.globalCompositeOperation = currentDrawTool === 'eraser' ? 'destination-out' : 'source-over';drawCtx.stroke();[lastX, lastY] = [x,y]; };const o = () => { if(isDrawing) { isDrawing = false;addDrawingToHistory(); }};drawingCanvas.addEventListener('mousedown', s);drawingCanvas.addEventListener('mousemove', d);document.addEventListener('mouseup', o);drawingCanvas.addEventListener('touchstart', s, { passive: false });drawingCanvas.addEventListener('touchmove', d, { passive: false });document.addEventListener('touchend', o);undoDrawBtn.onclick = undoDrawing;redoDrawBtn.onclick = redoDrawing;clearDrawBtn.onclick = () => clearDrawing(true);u(); }
    function setupTextPanel() { const u=()=>{const s=textSizeSlider.value;textSizeVal.textContent=`${s}px`;const p=Math.max(10,Math.min(s,30));textPreview.style.width=`${p}px`;textPreview.style.height=`${p}px`;textPreview.style.background=textColorPicker.value;};textSizeSlider.oninput=u;textColorPicker.oninput=u;addTextBtn.onclick=()=>{const t=textInput.value.trim();if(t)addTextToImage(t,textColorPicker.value,textSizeSlider.value,currentFont.value);};u(); }
    function handleUpload(e) { if (e.target.files && e.target.files[0]) { const r = new FileReader(); r.onload = (ev) => { mainImage.src = ev.target.result;stopCamera();mainImage.style.display = 'block';videoFeed.style.display = 'none';captureBtn.style.display = 'none'; mainImage.onload = () => { resizeDrawingCanvas(); resetForNewImage(); document.querySelectorAll('#image-editor-screen .filter-preview').forEach(p => p.style.backgroundImage = `url(${mainImage.src})`); }; }; r.readAsDataURL(e.target.files[0]); } }
    async function toggleCamera() { if (currentStream) { stopCamera(); } else { try { currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); videoFeed.srcObject = currentStream; videoFeed.style.display = 'block'; mainImage.style.display = 'none'; captureBtn.style.display = 'block'; panelContainer.classList.remove('visible'); document.querySelector('#image-editor-screen .tool-btn.active')?.classList.remove('active'); } catch (err) { alert('Camera on nahi ho saka.'); } } }
    function captureImage() { const c = document.createElement('canvas'); c.width = videoFeed.videoWidth; c.height = videoFeed.videoHeight; c.getContext('2d').drawImage(videoFeed, 0, 0); mainImage.src = c.toDataURL('image/png'); stopCamera(); mainImage.style.display = 'block'; videoFeed.style.display = 'none'; captureBtn.style.display = 'none'; mainImage.onload = () => { resizeDrawingCanvas(); resetForNewImage(); document.querySelectorAll('#image-editor-screen .filter-preview').forEach(p => p.style.backgroundImage = `url(${mainImage.src})`); }; }
    function stopCamera() { if (currentStream) currentStream.getTracks().forEach(t => t.stop()); currentStream = null; videoFeed.srcObject = null; }
    function applyFrame(url) { imageWrapper.style.setProperty('--frame-image', url === 'none' ? 'none' : `url(${url})`); }
    function resetForNewImage() { clearDrawing(false); drawingHistory = []; historyIndex = -1; addDrawingToHistory(); imageWrapper.querySelectorAll('.interactive-wrapper').forEach(el => el.remove()); resetAdjustments(); document.querySelectorAll('#image-editor-screen .filter-card.active').forEach(c=>c.classList.remove('active')); if(document.querySelector('#image-editor-screen .filter-card')) document.querySelector('#image-editor-screen .filter-card').classList.add('active'); currentFilter = 'none'; applyAllEffects(); }
    function handleAdjustSlider(e) { const s = e.target;const f = s.dataset.filter;const v = s.value;const l = getEl(`${f}-val`);adjustments[f] = v;const u = (f === 'hue-rotate') ? '°' : (f === 'blur' ? 'px' : '%');l.textContent = v;applyAllEffects(); }
    function generateFilterString() { let s = '';s += `brightness(${adjustments.brightness}%) `;s += `contrast(${adjustments.contrast}%) `;s += `saturate(${adjustments.saturate}%) `;s += `grayscale(${adjustments.grayscale}%) `;s += `hue-rotate(${adjustments['hue-rotate']}deg) `;s += `blur(${adjustments.blur}px) `;if (currentFilter !== 'none') { s += currentFilter; } return s.trim(); }
    function applyAllEffects() { mainImage.style.filter = generateFilterString(); }
    function resetAdjustments() { Object.keys(adjustments).forEach(k => { const d = (k === 'brightness' || k === 'contrast' || k === 'saturate') ? 100 : 0;adjustments[k] = d;const s = document.querySelector(`#image-editor-screen .adjust-slider-input[data-filter="${k}"]`);if (s) s.value = d;const v = getEl(`${k}-val`);if (v) v.textContent = d; });applyAllEffects(); }
    function handleToolbarClick(e) { const t = e.target.closest('.tool-btn'); if (!t) return; const o = t.dataset.tool; const l = getEl(`${o}Panel`); const i = t.classList.contains('active'); deactivateAllElements(); endCrop(); drawingCanvas.style.pointerEvents = (o === 'draw') ? 'auto' : 'none'; if (i) { t.classList.remove('active'); if(l) l.classList.remove('active'); panelContainer.classList.remove('visible'); return; } document.querySelector('#image-editor-screen .tool-btn.active')?.classList.remove('active'); document.querySelectorAll('#image-editor-screen .panel.active').forEach(p => p.classList.remove('active')); t.classList.add('active'); if (l) { l.classList.add('active'); panelContainer.classList.add('visible'); if (o === 'frames') { getEl('framesDetailPanel').classList.remove('active'); getEl('framesCategoryPanel').classList.add('active'); } if (o === 'crop') startCrop(); } else { panelContainer.classList.remove('visible'); } }
    function resizeDrawingCanvas() { const r = mainImage.getBoundingClientRect();drawingCanvas.width = r.width;drawingCanvas.height = r.height;drawingCanvas.style.top = r.top + 'px';drawingCanvas.style.left = r.left + 'px';restoreDrawing(); }
    function addDrawingToHistory() { if (historyIndex < drawingHistory.length - 1) drawingHistory.splice(historyIndex + 1); drawingHistory.push(drawCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height)); historyIndex++; }
    function restoreDrawing() { if (historyIndex > -1 && drawingHistory[historyIndex]) { drawCtx.putImageData(drawingHistory[historyIndex], 0, 0); } }
    function undoDrawing() { if (historyIndex > 0) { historyIndex--; restoreDrawing(); } }
    function redoDrawing() { if (historyIndex < drawingHistory.length - 1) { historyIndex++; restoreDrawing(); } }
    function clearDrawing(addToHist) { drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); if (addToHist) addDrawingToHistory(); }
    function deactivateAllElements() { if (activeElement) activeElement.classList.remove('active'); activeElement = null; }
    function addTextToImage(text, color, size, font) { const wrapper = document.createElement('div'); wrapper.className = 'interactive-wrapper'; wrapper.dataset.type = 'text'; wrapper.style.left = '50%'; wrapper.style.top = '50%'; wrapper.style.transform = 'translate(-50%, -50%)'; wrapper.innerHTML = ` <div class="element-content" style="color:${color}; font-family:${font}; font-size:${size}px; white-space:nowrap; transform: scale(1, 1);"> ${text} </div> <div class="element-controls"> <div class="control-handle rotate-handle"><i class="fa-solid fa-rotate-left"></i></div> <div class="control-handle delete-handle"><i class="fa-solid fa-times"></i></div> <div class="control-handle handle-br"><i class="fa-solid fa-expand"></i></div> <div class="control-handle handle-mr"><i class="fa-solid fa-arrows-left-right"></i></div> <div class="control-handle handle-mb"><i class="fa-solid fa-arrows-up-down"></i></div> </div>`; imageWrapper.appendChild(wrapper); setTimeout(() => { const rect = wrapper.getBoundingClientRect(); wrapper.style.width = rect.width + 'px'; wrapper.style.height = rect.height + 'px'; makeElementInteractive(wrapper); }, 0); }
    function addSticker(src) { const wrapper = document.createElement('div'); wrapper.className = 'interactive-wrapper'; wrapper.dataset.type = 'sticker'; wrapper.style.left = '50%'; wrapper.style.top = '50%'; wrapper.style.transform = 'translate(-50%, -50%)'; wrapper.style.width = '120px'; wrapper.style.height = '120px'; wrapper.innerHTML = ` <img src="${src}" class="element-content" draggable="false" style="width:100%; height:100%;"> <div class="element-controls"> <div class="control-handle rotate-handle"><i class="fa-solid fa-rotate-left"></i></div> <div class="control-handle delete-handle"><i class="fa-solid fa-times"></i></div> <div class="control-handle handle-br"><i class="fa-solid fa-expand"></i></div> <div class="control-handle handle-mr"><i class="fa-solid fa-arrows-left-right"></i></div> <div class="control-handle handle-mb"><i class="fa-solid fa-arrows-up-down"></i></div> </div>`; imageWrapper.appendChild(wrapper); makeElementInteractive(wrapper); }
    function makeElementInteractive(element) { deactivateAllElements(); element.classList.add('active'); activeElement = element; const content = element.querySelector('.element-content'); const isText = element.dataset.type === 'text'; let state = { action: null, startX: 0, startY: 0, startLeft: 0, startTop: 0, startWidth: 0, startHeight: 0, startAngle: 0, startScaleX: 1, startScaleY: 1, startFontSize: 40 }; const onPointerDown = (e) => { e.preventDefault(); e.stopPropagation(); deactivateAllElements(); element.classList.add('active'); activeElement = element; const handle = e.target.closest('.control-handle'); if (!handle && e.target !== element) state.action = 'drag'; else if (handle) { if (handle.classList.contains('rotate-handle')) state.action = 'rotate'; else if (handle.classList.contains('delete-handle')) { element.remove(); deactivateAllElements(); return; } else if (handle.classList.contains('handle-br')) state.action = 'resize-br'; else if (handle.classList.contains('handle-mr')) state.action = 'resize-mr'; else if (handle.classList.contains('handle-mb')) state.action = 'resize-mb'; } else { state.action = 'drag'; } const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; state.startX = clientX; state.startY = clientY; const rect = element.getBoundingClientRect(); state.startLeft = element.offsetLeft; state.startTop = element.offsetTop; state.startWidth = element.offsetWidth; state.startHeight = element.offsetHeight; const matrix = new DOMMatrix(window.getComputedStyle(element).transform); state.startAngle = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI); if (isText) { const contentMatrix = new DOMMatrix(window.getComputedStyle(content).transform); state.startScaleX = contentMatrix.a; state.startScaleY = contentMatrix.d; state.startFontSize = parseFloat(window.getComputedStyle(content).fontSize); } document.addEventListener('mousemove', onPointerMove); document.addEventListener('touchmove', onPointerMove, { passive: false }); document.addEventListener('mouseup', onPointerUp); document.addEventListener('touchend', onPointerUp); }; const onPointerMove = (e) => { e.preventDefault(); const clientX = e.touches ? e.touches[0].clientX : e.clientX; const clientY = e.touches ? e.touches[0].clientY : e.clientY; const dx = clientX - state.startX; const dy = clientY - state.startY; if (state.action === 'drag') { element.style.left = `${state.startLeft + dx}px`; element.style.top = `${state.startTop + dy}px`; } else if (state.action === 'rotate') { const center = { x: element.getBoundingClientRect().left + element.offsetWidth / 2, y: element.getBoundingClientRect().top + element.offsetHeight / 2 }; const angle = Math.atan2(clientY - center.y, clientX - center.x) * (180 / Math.PI); const startAngle = Math.atan2(state.startY - center.y, state.startX - center.x) * (180 / Math.PI); element.style.transform = `rotate(${state.startAngle + angle - startAngle}deg)`; } else if (state.action && state.action.startsWith('resize')) { if (isText) { if (state.action === 'resize-br') { const newSize = Math.max(10, state.startFontSize + dx * 0.5); content.style.fontSize = `${newSize}px`; element.style.width = 'auto'; element.style.height = 'auto'; setTimeout(() => { element.style.width = element.offsetWidth + 'px'; element.style.height = element.offsetHeight + 'px'; }, 0); } else { let newScaleX = state.startScaleX; let newScaleY = state.startScaleY; if (state.action === 'resize-mr') newScaleX = Math.max(0.1, state.startScaleX + (dx / state.startWidth)); if (state.action === 'resize-mb') newScaleY = Math.max(0.1, state.startScaleY + (dy / state.startHeight)); content.style.transform = `scale(${newScaleX}, ${newScaleY})`; } } else { let newWidth = state.startWidth; let newHeight = state.startHeight; if (state.action === 'resize-br') { newWidth = Math.max(30, state.startWidth + dx); newHeight = state.startHeight * (newWidth / state.startWidth); } else if (state.action === 'resize-mr') { newWidth = Math.max(30, state.startWidth + dx); } else if (state.action === 'resize-mb') { newHeight = Math.max(20, state.startHeight + dy); } element.style.width = `${newWidth}px`; element.style.height = `${newHeight}px`; } } }; const onPointerUp = () => { document.removeEventListener('mousemove', onPointerMove); document.removeEventListener('touchmove', onPointerMove); document.removeEventListener('mouseup', onPointerUp); document.removeEventListener('touchend', onPointerUp); }; element.addEventListener('mousedown', onPointerDown); element.addEventListener('touchstart', onPointerDown, { passive: false }); }
    function handleCropShapeChange(e){ const b=e.target.closest('.shape-btn');if(!b||!isCropping)return;document.querySelector('#image-editor-screen .shape-btn.active').classList.remove('active');b.classList.add('active');currentCropRatio=b.dataset.ratio;setCropAspectRatio(); }
    function setCropAspectRatio() { if (!cropBox) return; cropBox.classList.toggle('is-circle', currentCropRatio === 'circle'); if (currentCropRatio === 'free' || currentCropRatio === 'circle') return; const [w, h] = currentCropRatio.split(':').map(Number); const ratio = h / w; const newHeight = cropBox.offsetWidth * ratio; if (cropBox.offsetTop + newHeight > mainImage.height) { cropBox.style.width = `${cropBox.offsetHeight / ratio}px`; } else { cropBox.style.height = `${newHeight}px`; } }
    function startCrop() { if (isCropping) return; isCropping = true; cropOverlay.style.display = 'block'; deactivateAllElements(); const i = mainImage.getBoundingClientRect(); const s = Math.min(i.width, i.height) * 0.8; cropBox = document.createElement('div'); cropBox.className = 'crop-box'; cropBox.style.width = `${s}px`; cropBox.style.height = `${s}px`; cropBox.style.left = `${(i.width - s) / 2}px`; cropBox.style.top = `${(i.height - s) / 2}px`; cropBox.innerHTML = `<div class="crop-handle tl"></div><div class="crop-handle tr"></div><div class="crop-handle bl"></div><div class="crop-handle br"></div>`; cropOverlay.appendChild(cropBox); setCropAspectRatio(); let t, a, l, e, o, d, n, h; const r = (c) => { c.preventDefault(); c.stopPropagation(); h = c.target.closest('.crop-handle'); n = h ? 'resize' : 'move'; t = c.touches ? c.touches[0].clientX : c.clientX; a = c.touches ? c.touches[0].clientY : c.clientY; l = cropBox.offsetLeft; e = cropBox.offsetTop; o = cropBox.offsetWidth; d = cropBox.offsetHeight; document.addEventListener('mousemove', p); document.addEventListener('touchmove', p, { passive: false }); document.addEventListener('mouseup', u); document.addEventListener('touchend', u); }; const p = (c) => { const x = c.touches ? c.touches[0].clientX : c.clientX; const y = c.touches ? c.touches[0].clientY : c.clientY; let g = x - t; let f = y - a; if (n === 'move') { cropBox.style.left = Math.min(i.width - o, Math.max(0, l + g)) + 'px'; cropBox.style.top = Math.min(i.height - d, Math.max(0, e + f)) + 'px'; } else { let L = l, T = e, W = o, H = d; if (h.classList.contains('br')) { W += g; H += f; } else if (h.classList.contains('bl')) { W -= g; H += f; L += g; } else if (h.classList.contains('tr')) { W += g; H -= f; T += f; } else if (h.classList.contains('tl')) { W -= g; H -= f; L += g; T += f; } if (W > 50 && L >= 0 && L + W <= i.width) { cropBox.style.left = `${L}px`; cropBox.style.width = `${W}px`; } if (H > 50 && T >= 0 && T + H <= i.height) { cropBox.style.top = `${T}px`; cropBox.style.height = `${H}px`; } if (currentCropRatio !== 'free' && currentCropRatio !== 'circle') { const [w, R] = currentCropRatio.split(':').map(Number); const A = R / w; if (h.classList.contains('br') || h.classList.contains('tl')) { cropBox.style.height = `${cropBox.offsetWidth * A}px`; } else { cropBox.style.width = `${cropBox.offsetHeight / A}px`; } } } }; const u = () => { document.removeEventListener('mousemove', p); document.removeEventListener('mouseup', u); document.removeEventListener('touchmove', p); document.removeEventListener('touchend', u); }; cropBox.addEventListener('mousedown', r); cropBox.addEventListener('touchstart', r, { passive: false }); }
    function endCrop() { if (!isCropping) return; isCropping = false; cropOverlay.style.display = 'none'; if (cropBox) cropBox.remove(); cropBox = null; document.querySelector('#image-editor-screen .shape-btn.active').classList.remove('active'); document.querySelector('#image-editor-screen .shape-btn[data-ratio="free"]').classList.add('active'); currentCropRatio = 'free'; }
    function applyCrop() { if (!cropBox) return; const i = mainImage; const sX = i.naturalWidth / i.width; const sY = i.naturalHeight / i.height; const cX = cropBox.offsetLeft * sX, cY = cropBox.offsetTop * sY; const cW = cropBox.offsetWidth * sX, cH = cropBox.offsetHeight * sY; const canvas = document.createElement('canvas'); canvas.width = cW; canvas.height = cH; const ctx = canvas.getContext('2d'); if (cropBox.classList.contains('is-circle')) { ctx.beginPath(); ctx.arc(cW / 2, cH / 2, Math.min(cW, cH) / 2, 0, Math.PI * 2, true); ctx.clip(); } ctx.drawImage(i, cX, cY, cW, cH, 0, 0, cW, cH); mainImage.src = canvas.toDataURL('image/png', 1.0); mainImage.onload = () => { resizeDrawingCanvas(); resetForNewImage(); }; endCrop(); document.querySelector('#image-editor-screen .tool-btn[data-tool="crop"]').click(); }
    function downloadImage() { deactivateAllElements(); endCrop(); const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const baseImage = new Image(); baseImage.crossOrigin = "anonymous"; baseImage.onload = () => { canvas.width = baseImage.naturalWidth; canvas.height = baseImage.naturalHeight; ctx.filter = generateFilterString(); ctx.drawImage(baseImage, 0, 0); ctx.drawImage(drawingCanvas, 0, 0, canvas.width, canvas.height); const elements = imageWrapper.querySelectorAll('.interactive-wrapper'); const promises = Array.from(elements).map(el => { const content = el.querySelector('.element-content'); const scaleX = baseImage.naturalWidth / mainImage.width; const scaleY = baseImage.naturalHeight / mainImage.height; const left = el.offsetLeft * scaleX; const top = el.offsetTop * scaleY; const width = el.offsetWidth * scaleX; const height = el.offsetHeight * scaleY; const el_matrix = new DOMMatrix(window.getComputedStyle(el).transform); const rotation = Math.atan2(el_matrix.b, el_matrix.a); ctx.save(); ctx.translate(left + width / 2, top + height / 2); ctx.rotate(rotation); if (el.dataset.type === 'sticker') { return new Promise(resolve => { const img = new Image(); img.crossOrigin = "anonymous"; img.src = content.src; img.onload = () => { ctx.drawImage(img, -width / 2, -height / 2, width, height); ctx.restore(); resolve(); } }); } else { const content_matrix = new DOMMatrix(window.getComputedStyle(content).transform); ctx.scale(content_matrix.a, content_matrix.d); ctx.fillStyle = content.style.color; ctx.font = `${parseFloat(content.style.fontSize) * scaleX}px ${content.style.fontFamily}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(content.textContent, 0, 0); ctx.restore(); return Promise.resolve(); } }); Promise.all(promises).then(() => { const link = document.createElement('a'); link.download = 'edited-image.png'; link.href = canvas.toDataURL('image/png', 1.0); link.click(); }); }; baseImage.src = mainImage.src; }

    return {
        start: () => {
            if (!isInitialized) {
                initialize();
                isInitialized = true;
            } else {
                // Re-initialize state if it's already been opened
                initializeState();
                resetForNewImage();
            }
        },
        downloadImage: downloadImage
    };
})();
/* ======================================================= */
/* === AI Photo Editor Script (Code 1) - END === */
/* ======================================================= */
