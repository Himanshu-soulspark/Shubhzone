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

const RENDER_BACKEND_URL = 'https://shubhzone.onrender.com/upload';

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
    allVideos: [], // यह फ़िल्टर किए गए वीडियो के लिए होगा जो दिखेंगे
    userUploadedVideos: [],
    uploadDetails: {},
    activeComments: {
        videoId: null,
        videoOwnerUid: null
    }
};

let isYouTubeApiReady = false;
let players = {};
let videoObserver;
let fullVideoList = []; // यह डेटाबेस से लोड किए गए सभी वीडियो की पूरी सूची रखेगा
let activePlayerId = null;
let userHasInteracted = false;
let hasShownAudioPopup = false;

const appContainer = document.getElementById('app-container');
const screens = document.querySelectorAll('.screen');
const navItems = document.querySelectorAll('.nav-item');
const bottomNav = document.querySelector('.bottom-nav'); // <<<--- पहला बदलाव: बॉटम नेविगेशन बार को सेलेक्ट किया
const profileAvatarElement = document.getElementById('profile-avatar');
const profileUsernameElement = document.getElementById('profile-username');
const profileImageInput = document.getElementById('profile-image-input');
const profileImagePreview = document.getElementById('profile-image-preview');
const uploadDetailsModal = document.getElementById('upload-details-modal');
const modalVideoTitle = document.getElementById('modal-video-title');
const modalVideoDescription = document.getElementById('modal-video-description');
const modalVideoHashtags = document.getElementById('modal-video-hashtags');
const modalVideoUrlInput = document.getElementById('modal-video-url');
const selectedCategoryText = document.getElementById('selected-category-text'); // YouTube Modal के लिए
// प्रीमियम अपलोड स्क्रीन के लिए नया स्पैन ID जोड़ें (HTML में भी जोड़ें)
const selectedCategoryTextPremium = document.getElementById('selected-category-text-premium'); // प्रीमियम के लिए
const categoryOptionsContainer = document.getElementById('category-options'); // यह modal और premium screen दोनों के लिए share होगा
const commentsToggleInput = document.getElementById('comments-toggle-input');
const audienceOptions = document.querySelectorAll('.audience-option');
const categorySelectorDisplay = document.querySelector('.category-selector-display'); // YouTube Modal के लिए
const categorySelectorDisplayPremium = document.querySelector('#premium-upload-screen .category-selector-display'); // प्रीमियम के लिए

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
const categoryScroller = document.getElementById('category-scroller'); // होम स्क्रीन कैटेगरी बार के लिए

const categories = [
    "Entertainment", "Comedy", "Music", "Dance", "Education",
    "Travel", "Food", "DIY", "Sports", "Gaming", "News", "Lifestyle",
    "Art", "Technology", "Science", "Nature", "Fitness", "Other" // कुल 16 कैटेगरी, आप अपनी 15+ कैटेगरी यहाँ डाल सकते हैं
];

// ============== दूसरा बदलाव: activateScreen() फंक्शन को सुधारा गया ==============
function activateScreen(screenId) {
    screens.forEach(screen => {
        const isActive = screen.id === screenId;
        screen.classList.toggle('active', isActive);
    });
    appState.currentScreen = screenId;

    // यह तय करेगा कि बॉटम नेविगेशन बार को दिखाना है या नहीं।
    const showBottomNav = (screenId !== 'splash-screen' && screenId !== 'information-screen' && screenId !== 'image-editor-screen' && screenId !== 'withdraw-success-screen');
    if (bottomNav) {
        bottomNav.style.display = showBottomNav ? 'flex' : 'none';
    }

    // जब स्क्रीन बदलती है, तो सुनिश्चित करें कि कैटेगरी ड्रॉपdown बंद हो
     const openDisplay = document.querySelector('.category-selector-display.open');
     if(openDisplay) {
         openDisplay.classList.remove('open');
     }
}

function navigateTo(nextScreenId) {
    if (appState.currentScreen === 'home-screen' && activePlayerId && players[activePlayerId]) {
         pauseActivePlayer();
    }
    // activePlayerId = null; // इसे यहां रीसेट न करें, IntersectionObserver इसे मैनेज करेगा
    activateScreen(nextScreenId);

    // यह नेविगेशन आइकॉन पर 'active' क्लास को अपडेट करेगा
    navItems.forEach(nav => {
        const navTarget = nav.getAttribute('data-nav');
        // स्क्रीन ID से "-screen" हटाकर nav target से तुलना करें
        const isCurrentNav = (nextScreenId.replace('-screen', '') === navTarget);
        nav.classList.toggle('active', isCurrentNav);
    });

    if (nextScreenId === 'profile-screen') {
        // renderUserVideos(); // यह फंक्शन अभी मौजूद नहीं है, इसे अनcomment न करें
        loadUserVideosFromFirebase(); // सुनिश्चित करें कि डेटा लोड हो रहा है
    }
    if (nextScreenId === 'image-editor-screen') {
        // photoEditor.start(); // photoEditor लॉजिक यहां कॉल करें यदि यह यहां से शुरू होता है
    }
    if (nextScreenId === 'wallet-screen') {
        // Wallet screen specific logic
    }
    if (nextScreenId === 'friends-screen') {
         // Friends screen specific logic
    }
    // Home screen पर वापस आने पर वीडियो observer को फिर से अटैच करें
    if (nextScreenId === 'home-screen' && appState.allVideos.length > 0) {
         // छोटा डिले दें ताकि DOM रेंडर हो जाए
         setTimeout(setupVideoObserver, 100);
    }
}

async function checkUserProfileAndProceed(user) {
    if (!user) return;
    appState.currentUser.uid = user.uid;

    const userRef = db.collection('users').doc(user.uid);
    const doc = await userRef.get();

    if (doc.exists && doc.data().name) {
        appState.currentUser = { ...appState.currentUser, ...doc.data() };
        updateProfileUI();
        await startAppLogic(); // प्रोफाइल मिलने पर ऐप लॉजिक शुरू करें
    } else {
        if (doc.exists) {
            appState.currentUser = { ...appState.currentUser, ...doc.data() };
        }
        updateProfileUI();
        navigateTo('information-screen');
        // यदि प्रोफाइल मौजूद नहीं है, तो यहीं रुकें और startAppLogic को कॉल न करें
    }
}


function initializeApp() {
    auth.onAuthStateChanged(user => {
        if (user) {
            // यदि पहले से ही ऑथेंटिकेटेड है, तो सीधे चेक प्रोफाइल पर जाएं
            checkUserProfileAndProceed(user);
        } else {
            // यदि ऑथेंटिकेटेड नहीं है, तो एनोनिमस साइन-इन का प्रयास करें
            auth.signInAnonymously().catch(error => {
                console.error("Anonymous sign-in failed:", error);
                // यदि एनोनिमस साइन-इन भी विफल हो जाता है, तो यूजर को बताएं या कुछ और करें
                alert("Failed to sign in. Please check your connection.");
                // लोडिंग इंडिकेटर छिपाएं यदि यह दिख रहा है
                document.getElementById('get-started-btn').style.display = 'block';
                document.getElementById('loading-container').style.display = 'none';
            });
        }
    });
    activateScreen('splash-screen');
    // renderCategories() और renderCategoriesInBar() DOMContentLoaded में कॉल होंगे
}


async function loadUserVideosFromFirebase() {
    // console.log("Loading user videos for UID:", appState.currentUser.uid);
    if (!appState.currentUser.uid) {
        // console.log("User UID not available for loading user videos.");
        return;
    }
    try {
        const videosRef = db.collection('videos').where('uploaderUid', '==', appState.currentUser.uid).orderBy('createdAt', 'desc');
        const snapshot = await videosRef.get();
        appState.userUploadedVideos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // console.log("Loaded user videos:", appState.userUploadedVideos);
        // renderUserVideos(); // This function does not exist in your provided code, keep commented
    } catch (error) {
        console.error("Error loading user videos:", error);
    }
}


async function loadAllVideosFromFirebase() {
    // console.log("Loading all videos from Firebase...");
    const videosRef = db.collection('videos').orderBy('createdAt', 'desc').limit(20);
    const snapshot = await videosRef.get();
    const loadedVideos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    fullVideoList = [...loadedVideos]; // पूरी लिस्ट को fullVideoList में स्टोर करें
    appState.allVideos = [...loadedVideos]; // शुरुआत में सभी वीडियो दिखाएं

    // console.log("Loaded all videos:", fullVideoList);
    // console.log("Initial appState.allVideos:", appState.allVideos);

    // renderVideoSwiper() अब filterVideosByCategory द्वारा कॉल किया जाएगा

    // categoryScroller को इनिशियलाइज़ करें और 'All' को एक्टिव करें
    document.querySelectorAll('.category-chip').forEach(chip => chip.classList.remove('active'));
    const allChip = document.querySelector('.category-chip[data-category="all"]'); // 'All' चिप को डेटा एट्रिब्यूट से सेलेक्ट करें
    if (allChip) {
        allChip.classList.add('active');
    } else {
        // अगर किसी कारण से 'All' चिप रेंडर नहीं हुआ है (जो renderCategoriesInBar में होता है),
        // तो बस renderVideoSwiper को सीधे कॉल करें
        // console.warn("'All' category chip not found. Skipping initial filter.");
        renderVideoSwiper();
         if (appState.allVideos.length > 0 && isYouTubeApiReady) {
              setTimeout(setupVideoObserver, 100); // यदि वीडियो हैं तो Observer सेटअप करें
         } else if (appState.allVideos.length === 0) {
             // यदि कोई वीडियो नहीं है, तो भी Observer सेटअप करें (हालांकि यह कुछ भी observe नहीं करेगा)
              setupVideoObserver();
         }
    }


    // initial render and setup observer for 'all' category
    // filterVideosByCategory('all'); // startAppLogic में इसे कॉल करना बेहतर है
}

// ============== तीसरा बदलाव: navItems Event Listener को सुधारा गया ==============
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetScreen = `${item.getAttribute('data-nav')}-screen`;
        // यहाँ से active क्लास हटाने वाला कोड हटा दिया गया है क्योंकि navigateTo अब यह काम करेगा।
        if (appState.currentScreen !== targetScreen) {
            navigateTo(targetScreen);
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
    const userData = {
        name: name,
        mobile: document.getElementById('info-mobile').value.trim(),
        email: document.getElementById('info-email').value.trim(),
        address: document.getElementById('info-address').value.trim(),
        hobby: document.getElementById('info-hobby').value.trim(),
        state: document.getElementById('info-state').value === 'custom' ? document.getElementById('custom-state-input').value.trim() : document.getElementById('info-state').value,
        country: document.getElementById('info-country').value === 'custom' ? document.getElementById('custom-country-input').value.trim() : document.getElementById('info-country').value,
    };
    const file = profileImageInput.files[0];
    if (file) {
        try {
            const formData = new FormData();
            formData.append('media', file);
            // Add other fields if your backend expects them for avatar upload context
            // formData.append('uid', appState.currentUser.uid);

            const response = await fetch(RENDER_BACKEND_URL + '/upload-avatar', { // Make sure your backend has a specific endpoint for avatar
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.statusText} - ${errorText}`);
            }
            const result = await response.json();
            if (result.downloadURL) {
                 userData.avatar = result.downloadURL;
            } else {
                 throw new Error("Avatar upload succeeded but no downloadURL received.");
            }

        } catch (error) {
            console.error("Avatar upload error:", error);
            alert("Failed to upload profile picture: " + error.message);
            saveAndContinue.disabled = false; // Ensure button is enabled on error
            saveAndContinue.textContent = 'Continue';
            return; // Stop the process if avatar upload fails
        }
    }
    try {
        await db.collection('users').doc(appState.currentUser.uid).set(userData, { merge: true });
        appState.currentUser = { ...appState.currentUser, ...userData };
        updateProfileUI();
        // यदि उपयोगकर्ता पहली बार प्रोफाइल सहेज रहा है, तो startAppLogic यहाँ से कॉल करें
        if (appState.currentScreen === 'information-screen') {
             await startAppLogic(); // <--- यहां startAppLogic कॉल हो रहा है
        } else {
             // यदि उपयोगकर्ता मौजूदा प्रोफाइल को अपडेट कर रहा है
             navigateTo('profile-screen'); // या जहाँ भी आप जाना चाहें
        }

    } catch (error) {
        console.error("Profile save error:", error);
        alert("Failed to save profile: " + error.message);
    } finally {
        saveContinueBtn.disabled = false;
        saveContinueBtn.textContent = 'Continue';
    }
}


function updateProfileUI() {
    profileUsernameElement.textContent = appState.currentUser.name || `@${appState.currentUser.username || 'new_user'}`;
    const avatarUrl = appState.currentUser.avatar || "https://via.placeholder.com/120/222/FFFFFF?text=++"; // Placeholders are often tricky, added extra +
    profileAvatarElement.src = avatarUrl;
    profileImagePreview.src = avatarUrl;

    // Ensure input fields are updated only if the user is on the information screen
    if (appState.currentScreen === 'information-screen') {
        document.getElementById('info-name').value = appState.currentUser.name || '';
        document.getElementById('info-mobile').value = appState.currentUser.mobile || '';
        document.getElementById('info-email').value = appState.currentUser.email || '';
        document.getElementById('info-address').value = appState.currentUser.address || '';
        document.getElementById('info-hobby').value = appState.currentUser.hobby || '';

        const stateSelect = document.getElementById('info-state');
        const stateInput = document.getElementById('custom-state-input');
        const countrySelect = document.getElementById('info-country');
        const countryInput = document.getElementById('custom-country-input');

        // Set state
        if (appState.currentUser.state && Array.from(stateSelect.options).some(opt => opt.value === appState.currentUser.state)) {
            stateSelect.value = appState.currentUser.state;
            stateInput.style.display = 'none';
        } else if (appState.currentUser.state) {
            stateSelect.value = 'custom';
            stateInput.value = appState.currentUser.state;
            stateInput.style.display = 'block';
        } else {
             stateSelect.value = ''; // Default or prompt
             stateInput.value = '';
             stateInput.style.display = 'none';
        }

        // Set country
        if (appState.currentUser.country && Array.from(countrySelect.options).some(opt => opt.value === appState.currentUser.country)) {
            countrySelect.value = appState.currentUser.country;
            countryInput.style.display = 'none';
        } else if (appState.currentUser.country) {
            countrySelect.value = 'custom';
            countryInput.value = appState.currentUser.country;
            countryInput.style.display = 'block';
        } else {
            countrySelect.value = 'India'; // Default
            countryInput.value = '';
            countryInput.style.display = 'none';
        }
    }
}


function openUploadDetailsModal() {
    modalTitle.textContent = "Upload Details (YouTube)";
    modalSaveButton.textContent = "Upload Video";
    editingVideoIdInput.value = "";
    // modal inputs को खाली करें
    modalVideoTitle.value = '';
    modalVideoDescription.value = '';
    modalVideoHashtags.value = '';
    modalVideoUrlInput.value = '';
    selectedCategoryText.textContent = 'Select Category';
    selectAudience('all'); // Default audience
    commentsToggleInput.checked = true; // Default comments to on

    uploadDetailsModal.classList.add('active');
}

function closeUploadDetailsModal() { uploadDetailsModal.classList.remove('active'); }

// ============== बदलाव: toggleCategoryOptions() को सही डिस्प्ले एलिमेंट चुनने के लिए अपडेट किया गया ==============
function toggleCategoryOptions() {
     // पहले सभी ओपन ड्रॉपdown बंद करें
     document.querySelectorAll('.category-selector-display.open').forEach(display => display.classList.remove('open'));

     // सक्रिय स्क्रीन के आधार पर सही डिस्प्ले एलिमेंट चुनें
     let displayElement = null;
     // हम modal के अंदर या premium-upload-screen के अंदर हो सकते हैं
     if (uploadDetailsModal.classList.contains('active')) {
         displayElement = document.querySelector('#upload-details-modal .category-selector-display');
     } else if (appState.currentScreen === 'premium-upload-screen') {
         displayElement = document.querySelector('#premium-upload-screen .category-selector-display');
     }

     // यदि एलिमेंट मिला, तो क्लास टॉगल करें
     if (displayElement) {
         displayElement.classList.toggle('open');
     }
}


// ============== बदलाव: selectCategory() को सही टेक्स्ट स्पैन अपडेट करने के लिए अपडेट किया गया ==============
function selectCategory(category) {
    appState.uploadDetails.category = category;

    // जांचें कि कौन सी स्क्रीन सक्रिय है और सही स्पैन को अपडेट करें
    if (uploadDetailsModal.classList.contains('active')) { // यदि modal खुला है
         if(selectedCategoryText) selectedCategoryText.textContent = category;
    } else if (appState.currentScreen === 'premium-upload-screen') { // यदि प्रीमियम अपलोड स्क्रीन सक्रिय है
         if(selectedCategoryTextPremium) selectedCategoryTextPremium.textContent = category;
    }

    // विकल्पों को बंद करें
    const openDisplay = document.querySelector('.category-selector-display.open');
    if(openDisplay) {
        openDisplay.classList.remove('open');
    }
}


function selectAudience(audienceType) {
    appState.uploadDetails.audience = audienceType;
    audienceOptions.forEach(option => option.classList.remove('selected'));
    document.querySelector(`.audience-option[data-audience="${audienceType}"]`).classList.add('selected');
}

async function handleSave() {
    const videoId = editingVideoIdInput.value;
    if (videoId) {
        // await saveVideoEdits(videoId); // यह फ़ंक्शन अभी मौजूद नहीं है
    } else {
        await saveNewVideo(); // यह YouTube वीडियो के लिए है
    }
}

async function saveNewVideo() { // यह YouTube video upload के लिए है
    modalSaveButton.disabled = true;
    modalSaveButton.textContent = 'Uploading...';
    const videoUrlValue = modalVideoUrlInput.value.trim();
    const title = modalVideoTitle.value.trim();
    const category = appState.uploadDetails.category; // appState से कैटेगरी लें
    if (!videoUrlValue || !title || !category || category === 'Select Category') { // 'Select Category' चेक भी जोड़ें
        alert("Please fill all required fields (Title, YouTube ID, Category).");
        modalSaveButton.disabled = false;
        modalSaveButton.textContent = 'Upload Video';
        return;
    }
    // YouTube ID से वीडियो ID निकालें यदि पूरा URL पेस्ट किया गया है
    let youtubeId = videoUrlValue;
    const urlMatch = videoUrlValue.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&\n\?#]+)/);
    if (urlMatch && urlMatch[1]) {
        youtubeId = urlMatch[1];
    }

    const videoData = {
        uploaderUid: auth.currentUser.uid,
        uploaderUsername: appState.currentUser.name || appState.currentUser.username || 'User',
        uploaderAvatar: appState.currentUser.avatar || 'https://via.placeholder.com/40',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        title,
        description: modalVideoDescription.value.trim(),
        hashtags: modalVideoHashtags.value.trim(),
        videoUrl: youtubeId, // सिर्फ ID स्टोर करें
        thumbnailUrl: `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
        videoType: 'youtube',
        category,
        audience: appState.uploadDetails.audience || 'all',
        commentsEnabled: commentsToggleInput.checked,
        likes: 0,
        commentCount: 0
    };
    try {
        await db.collection("videos").add(videoData);
        alert("YouTube video added!");
        closeUploadDetailsModal();
        await loadAllVideosFromFirebase(); // सभी वीडियो फिर से लोड करें जिसमें नया भी शामिल है
        // navigateTo('home-screen'); // Home Screen पर नेविगेट करें
        filterVideosByCategory('all'); // 'All' कैटेगरी फिल्टर के साथ Home दिखाएं
    } catch (error) {
        console.error("Error uploading YouTube video:", error);
        alert("Upload failed. Error: " + error.message);
    } finally {
        modalSaveButton.disabled = false;
        modalSaveButton.textContent = 'Upload Video';
    }
}

function renderCategories() {
    // यह फ़ंक्शन modal और premium screen दोनों के `#category-options` div को पॉपुलेट करता है
    // क्योंकि HTML में वे share हो रहे हैं।
    if (!categoryOptionsContainer) return; // सुनिश्चित करें कि तत्व मौजूद है

    categoryOptionsContainer.innerHTML = categories.map(cat => `<div class="category-option" onclick="selectCategory('${cat}')">${cat}</div>`).join('');
}


// ============== बदलाव: renderCategoriesInBar() को लागू किया गया ==============
function renderCategoriesInBar() {
    const categoryScroller = document.getElementById('category-scroller');
    if (!categoryScroller) return;

    categoryScroller.innerHTML = ''; // Clear existing chips

    // Add 'All' chip first
    const allChip = document.createElement('div');
    allChip.className = 'category-chip active'; // 'All' is active by default
    allChip.textContent = 'All';
    allChip.dataset.category = 'all';
    allChip.addEventListener('click', () => filterVideosByCategory('all', allChip));
    categoryScroller.appendChild(allChip);

    // Add other category chips
    categories.forEach(cat => {
        const chip = document.createElement('div');
        chip.className = 'category-chip';
        chip.textContent = cat;
        chip.dataset.category = cat;
        chip.addEventListener('click', () => filterVideosByCategory(cat, chip));
        categoryScroller.appendChild(chip);
    });
}

// ============== बदलाव: filterVideosByCategory() को लागू किया गया ==============
function filterVideosByCategory(category, activeElement) {
    // Remove active class from all chips
    document.querySelectorAll('#category-scroller .category-chip').forEach(chip => {
        chip.classList.remove('active');
    });

    // Add active class to the clicked chip, if provided
    if (activeElement) {
        activeElement.classList.add('active');
    } else {
         // यदि activeElement प्रदान नहीं किया गया है (जैसे पेज लोड पर),
         // तो 'All' चिप को सक्रिय करें
         const defaultAllChip = document.querySelector('#category-scroller .category-chip[data-category="all"]');
         if(defaultAllChip) defaultAllChip.classList.add('active');
    }


    // Filter the videos from the full list
    if (category === 'all') {
        appState.allVideos = [...fullVideoList]; // Show all videos
    } else {
        appState.allVideos = fullVideoList.filter(video => video.category === category);
    }

    // console.log(`Filtering by category: ${category}`, appState.allVideos);

    // Re-render the video swiper with filtered videos
    renderVideoSwiper();

    // Ensure player observes the new DOM elements. Call after render.
    // setupVideoObserver() is called at the end of renderVideoSwiper() now.

    // Scroll the category bar to show the active chip (optional, but good UX)
     if (activeElement && categoryScroller && activeElement.parentElement === categoryScroller) {
        activeElement.scrollIntoView({ behavior: 'smooth', inline: 'center' });
    }
}


function renderVideoSwiper() {
    // console.log("Rendering video swiper with", appState.allVideos.length, "videos.");
    videoSwiper.innerHTML = '';
    // Dispose of old players if they exist
    for (const videoId in players) {
        if (players[videoId] && typeof players[videoId].destroy === 'function') {
            players[videoId].destroy();
        } else if (players[videoId] instanceof HTMLVideoElement) {
             players[videoId].pause();
             players[videoId].removeAttribute('src'); // Free up resource
             players[videoId].load();
        }
    }
    players = {}; // Reset players object

    if (videoObserver) videoObserver.disconnect(); // Disconnect old observer

    if (appState.allVideos.length === 0) {
        // Ensure static message is visible if no videos
        if (homeStaticMessageContainer) {
             videoSwiper.appendChild(homeStaticMessageContainer);
             homeStaticMessageContainer.style.display = 'flex';
        }
    } else {
        // Hide static message if videos exist
         if (homeStaticMessageContainer) {
             homeStaticMessageContainer.style.display = 'none';
             // Ensure it's removed from swiper if it was added
             if (homeStaticMessageContainer.parentElement === videoSwiper) {
                 videoSwiper.removeChild(homeStaticMessageContainer);
             }
         }

        appState.allVideos.forEach(video => {
            const slide = document.createElement('div');
            slide.className = 'video-slide';
            slide.dataset.videoId = video.id;
            slide.dataset.videoType = video.videoType || 'youtube';
            slide.addEventListener('click', (e) => {
                // Prevent toggling play/pause if clicking on action icons or uploader info
                if (e.target.closest('.video-actions-overlay') || e.target.closest('.uploader-info')) {
                    return;
                }
                togglePlayPause(video.id);
            });
            slide.addEventListener('dblclick', (e) => {
                 // Prevent like popup if double-clicking on action icons or uploader info
                if (e.target.closest('.video-actions-overlay') || e.target.closest('.uploader-info')) {
                    return;
                }
                handleLikeAction(video.id);
            });

            let playerHtml = '';
            // Use the correct video ID for YouTube player init
            const videoIdentifier = video.videoType === 'youtube' ? video.videoUrl : video.id;

            if (video.videoType === 'premium') {
                playerHtml = `<video class="html5-player" id="player-${videoIdentifier}" src="${video.videoUrl}" loop muted playsinline preload="metadata"></video>`; // Added preload
            } else {
                playerHtml = `<div class="player-container" id="player-${videoIdentifier}"></div>`;
            }

            const thumbnailUrl = video.thumbnailUrl || 'https://via.placeholder.com/420x740/000000/FFFFFF?text=Video';
            slide.innerHTML = `
                <div class="video-preloader" style="background-image: url('${thumbnailUrl}');"><div class="loader"></div></div>
                ${playerHtml}
                <i class="fas fa-heart like-heart-popup"></i>
                <div class="video-meta-overlay">
                    <div class="uploader-info"><img src="${video.uploaderAvatar || 'https://via.placeholder.com/40'}" alt="Uploader Avatar" class="uploader-avatar"><span class="uploader-name">${video.uploaderUsername || 'User'}</span></div>
                    <p class="video-title">${video.title}</p>
                </div>
                <div class="video-actions-overlay">
                    <div class="action-icon-container" data-action="like" onclick="handleLikeAction('${video.id}')"><i class="far fa-heart icon"></i><span class="count" data-likes="${video.likes || 0}">${video.likes || 0}</span></div>
                    <div class="action-icon-container ${!video.commentsEnabled ? 'disabled' : ''}" data-action="comment" onclick="${video.commentsEnabled ? `openCommentsModal('${video.id}', '${video.uploaderUid}')` : ''}"><i class="fas fa-comment-dots icon"></i><span class="count" data-comments="${video.commentCount || 0}">${video.commentCount || 0}</span></div>
                </div>`;
            videoSwiper.appendChild(slide);
        });

        // Initialize players and setup observer *after* slides are added to DOM
        if (isYouTubeApiReady) {
            // console.log("YouTube API Ready. Initializing players.");
            initializePlayers();
        } else {
             // console.log("YouTube API not yet ready. Players will be initialized later.");
        }
         // Always setup observer after rendering, regardless of API readiness
         // setupVideoObserver(); // Called at the end of initializePlayers or after loadAllVideosFromFirebase if no videos
    }
     // Always setup observer *after* rendering the slides
    setupVideoObserver();

}


function onYouTubeIframeAPIReady() {
    isYouTubeApiReady = true;
    console.log("Global onYouTubeIframeAPIReady called by YouTube API script.");
    // The first onReady call from any player created *after* this point will resolve window.resolveFirstPlayerReady
    // No need to directly resolve a pendingAppStart promise here anymore.
}

function initializePlayers() {
    if (!isYouTubeApiReady) {
        // console.log("Attempted to initialize players, but API not ready.");
        return;
    }
    // console.log("Initializing players for", appState.allVideos.length, "videos.");

    appState.allVideos.forEach((video) => {
        // Use the correct video ID for player initialization
        const videoIdentifier = video.videoType === 'youtube' ? video.videoUrl : video.id;
        const playerId = `player-${videoIdentifier}`;
        const playerElement = document.getElementById(playerId);

        if (playerElement && !players[video.id]) { // Check if player for THIS video ID already exists
            if (video.videoType === 'premium') {
                players[video.id] = playerElement; // Store the HTMLVideoElement
                playerElement.addEventListener('canplay', () => {
                    // console.log("Premium video canplay:", video.id);
                    const preloader = playerElement.closest('.video-slide').querySelector('.video-preloader');
                    if(preloader) preloader.style.display = 'none';
                    // Resolve the firstPlayerReadyPromise here if this is the first premium video ready
                    if (!window._firstPlayerReadyResolved) { // Use a flag to ensure it only resolves once
                         if (window.resolveFirstPlayerReady) {
                              window.resolveFirstPlayerReady();
                              window._firstPlayerReadyResolved = true;
                         }
                    }
                });
                 playerElement.addEventListener('error', (e) => {
                     console.error("Premium video error:", video.id, e);
                     const preloader = playerElement.closest('.video-slide').querySelector('.video-preloader');
                     if(preloader) {
                          preloader.style.display = 'flex';
                          preloader.innerHTML = '<p style="color: red; text-align: center;">Video failed to load.</p>';
                     }
                     // If premium video fails, the firstPlayerReadyPromise might not resolve.
                     // The overall timeout in startAppLogic will handle this.
                 });
            } else {
                // YouTube Player
                players[video.id] = new YT.Player(playerId, {
                    height: '100%',
                    width: '100%',
                    videoId: videoIdentifier, // Use YouTube video ID here
                    playerVars: { 'autoplay': 0, 'controls': 0, 'mute': 1, 'rel': 0, 'showinfo': 0, 'modestbranding': 1, 'loop': 1, 'playlist': videoIdentifier, 'fs': 0, 'iv_load_policy': 3, 'origin': window.location.origin },
                    events: {
                        'onReady': (event) => {
                            onPlayerReady(event);
                            // Resolve the firstPlayerReadyPromise here if this is the first YT video ready
                            if (!window._firstPlayerReadyResolved) { // Use a flag to ensure it only resolves once
                                 if (window.resolveFirstPlayerReady) {
                                      window.resolveFirstPlayerReady();
                                      window._firstPlayerReadyResolved = true;
                                 }
                            }
                        },
                        'onStateChange': onPlayerStateChange
                    }
                });
            }
        }
    });

    // setupVideoObserver(); // Now called at the end of renderVideoSwiper
}

function onPlayerReady(event) {
    // console.log("YouTube Player ready:", event.target.getVideoData().video_id);
    const preloader = event.target.getIframe().closest('.video-slide').querySelector('.video-preloader');
     if(preloader) preloader.style.display = 'none';

    // window.resolveFirstPlayerReady is resolved in initializePlayers now for the first ready player (YT or HTML5)
}


function onPlayerStateChange(event) {
    // console.log(`Player state changed for ${event.target.getVideoData ? event.target.getVideoData().video_id : 'HTML5 Video'}: ${event.data}`);
    const preloader = event.target.getIframe ? event.target.getIframe().closest('.video-slide').querySelector('.video-preloader') : event.target.closest('.video-slide').querySelector('.video-preloader');

    // If state is not UNSTARTED, the video has at least started buffering/loading
    // For YouTube, 1 (PLAYING), 2 (PAUSED), 3 (BUFFERING), 5 (CUED) mean preloader can hide.
    // For HTML5, 'playing', 'paused', 'stalled', 'waiting' might happen after canplay. Preloader hid on canplay.
    if (event.data !== YT.PlayerState.UNSTARTED) { // Also check for HTML5 video event types if necessary
        if(preloader) preloader.style.display = 'none';
    }
     // For HTML5 video: check event.type === 'playing', etc. For simplicity, canplay is used in initializePlayers.

    // Handle potential audio issue popup on first play attempt
    // This logic is slightly complex with different player types and timing.
    // Simplified check: if any player starts playing AND user hasn't interacted and popup not shown
    const isPlaying = (event instanceof YT.Player && event.data === YT.PlayerState.PLAYING) ||
                      (event instanceof HTMLVideoElement && event.type === 'play'); // Added HTML5 check

    if (isPlaying && !userHasInteracted && !hasShownAudioPopup) {
        console.log("Video started playing before user interaction. Showing audio popup.");
        showAudioIssuePopup();
        hasShownAudioPopup = true;
    }
}


function togglePlayPause(videoId) {
    const player = players[videoId];
    if (!player) return;

    // Ensure user interaction is marked if they click to play/pause
    if (!userHasInteracted) {
             console.log("First user interaction detected via togglePlayPause.");
             userHasInteracted = true;
             // Attempt to unmute all players (though only the currently active one matters)
             // Loop through players to unmute is better here after user interaction
             for (const id in players) {
                  const p = players[id];
                  if (p instanceof YT.Player && typeof p.unMute === 'function') p.unMute();
                  else if (p instanceof HTMLVideoElement) p.muted = false;
             }
         // Hide audio issue popup if visible
         hideAudioIssuePopup();
    }


    if (player instanceof YT.Player) {
        const state = player.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
            player.pauseVideo();
            // console.log("Paused YouTube video:", videoId);
        } else {
            player.playVideo();
             // console.log("Played YouTube video:", videoId);
        }
    } else { // HTML5 VideoElement
        if (player.paused) {
            player.play().catch(e => console.error("HTML5 Play failed:", e));
            // console.log("Played HTML5 video:", videoId);
        } else {
            player.pause();
            // console.log("Paused HTML5 video:", videoId);
        }
    }
}

function playActivePlayer(videoId) {
    const player = players[videoId];
    if (!player) return;

    // console.log("Attempting to play video:", videoId);

    if (player instanceof YT.Player) {
        if (typeof player.playVideo === 'function') {
             player.playVideo();
              // Only unmute if user has interacted
             if (userHasInteracted && typeof player.unMute === 'function') {
                 // console.log("Unmuting YouTube video:", videoId);
                  player.unMute();
             } else if (!userHasInteracted && typeof player.mute === 'function') {
                  // Ensure it's muted if no interaction yet
                  player.mute();
             }
        }
    } else { // HTML5 VideoElement
        player.play().catch(e => {
             console.error("HTML5 Play interrupted:", videoId, e);
             // Handle potential autoplay restrictions by showing popup if it hasn't been shown
             // Autoplay can fail even *with* mute, but often fails *without* user interaction.
             // The `userHasInteracted` check in the stateChange/play event handler is better for showing the popup.
        });
        // Mute/unmute based on user interaction
        player.muted = !userHasInteracted;
         // console.log(`Played HTML5 video: ${videoId}, Muted: ${player.muted}`);
    }
}


function pauseActivePlayer(videoId) {
    const videoIdToPause = videoId || activePlayerId;
    if (!videoIdToPause) return;

    const player = players[videoIdToPause];
    if (!player) return;

    // console.log("Attempting to pause video:", videoIdToPause);

    if (player instanceof YT.Player) {
        if (typeof player.pauseVideo === 'function') {
            player.pauseVideo();
            // console.log("Paused YouTube video:", videoIdToPause);
        }
    } else { // HTML5 VideoElement
        player.pause();
         // console.log("Paused HTML5 video:", videoIdToPause);
    }
}

function setupVideoObserver() {
    // console.log("Setting up IntersectionObserver...");
    if (videoObserver) videoObserver.disconnect(); // Disconnect previous observer
    const options = { root: videoSwiper, threshold: 0.75 }; // 75% visibility threshold
    const handleIntersection = (entries) => {
        entries.forEach(entry => {
            const videoId = entry.target.dataset.videoId;
            if (!videoId || !players[videoId]) return; // Ensure we have a videoId and a corresponding player

            if (entry.isIntersecting) {
                // console.log(`Slide ${videoId} is intersecting. Active: ${activePlayerId}`);
                // Pause the currently active player if it's different
                if (activePlayerId && activePlayerId !== videoId) {
                    // console.log(`Pausing previous active player: ${activePlayerId}`);
                    pauseActivePlayer(activePlayerId);
                }
                // Set the new active player and attempt to play
                activePlayerId = videoId;
                // console.log(`Setting active player to: ${activePlayerId}`);
                playActivePlayer(videoId);

            } else {
                // If a slide is no longer intersecting AND it was the active one, pause it
                if(videoId === activePlayerId) {
                    // console.log(`Slide ${videoId} is NOT intersecting and was active. Pausing.`);
                     pauseActivePlayer(videoId);
                    // Do NOT set activePlayerId to null here. Another slide might become active immediately.
                    // The next intersection event will set the new activePlayerId.
                }
            }
        });
    };
    videoObserver = new IntersectionObserver(handleIntersection, options);

    // Observe each video slide that has a player associated with it
    document.querySelectorAll('.video-slide').forEach(slide => {
        // Use the correct player ID logic to check if a player exists
        const videoId = slide.dataset.videoId;
        if (players[videoId]) { // Check if a player *object* exists for this video ID
             // console.log("Observing slide for video:", videoId);
             videoObserver.observe(slide);
        } else {
            // console.log("No player object found for video ID:", videoId, "Skipping observation.");
            // This might happen if YT API failed to load, or if a premium video failed to load.
            // The overall init timeout should handle cases where NO players can be created.
        }
    });

     // Manually trigger check for the first video on load if needed
     // This helps ensure the first video plays without requiring user scroll
     if (appState.allVideos.length > 0) {
         const firstSlide = document.querySelector('.video-slide');
         if (firstSlide) {
              // console.log("Manually checking intersection for first slide.");
              // Create a synthetic entry to trigger the handler for the first slide
              const firstEntry = [{
                  target: firstSlide,
                  isIntersecting: true, // Assume the first slide is initially visible
                  intersectionRatio: 1 // Assume it's fully visible
              }];
              handleIntersection(firstEntry);
         }
     }
}


// Liking logic
async function handleLikeAction(videoId) {
    if (!auth.currentUser || !auth.currentUser.uid) {
        alert("Please log in to like videos."); // Or redirect to login/signup
        return;
    }
    // console.log(`User ${auth.currentUser.uid} attempting to like video ${videoId}`);

    const videoRef = db.collection('videos').doc(videoId);
    const likeRef = videoRef.collection('likes').doc(auth.currentUser.uid); // Use user ID as like document ID

    try {
        const likeDoc = await likeRef.get();

        await db.runTransaction(async (transaction) => {
            const videoDoc = await transaction.get(videoRef);
            if (!videoDoc.exists) {
                throw "Video does not exist!";
            }

            const currentLikes = videoDoc.data().likes || 0;
            const likeIcon = document.querySelector(`.video-slide[data-video-id="${videoId}"] .action-icon-container[data-action="like"] .icon`);
             const likeCountSpan = document.querySelector(`.video-slide[data-video-id="${videoId}"] .action-icon-container[data-action="like"] .count`);
             const likeHeartPopup = document.querySelector(`.video-slide[data-video-id="${videoId}"] .like-heart-popup`);


            if (likeDoc.exists) {
                // User has already liked, unlike it
                transaction.delete(likeRef);
                transaction.update(videoRef, { likes: Math.max(0, currentLikes - 1) }); // Ensure likes don't go below 0
                // Update UI immediately
                 if(likeIcon) likeIcon.classList.remove('liked', 'fas');
                 if(likeIcon) likeIcon.classList.add('far'); // Use empty heart icon
                 if(likeCountSpan) likeCountSpan.textContent = Math.max(0, currentLikes - 1);
                 if(likeCountSpan) likeCountSpan.dataset.likes = Math.max(0, currentLikes - 1); // Update data attribute
                // console.log(`User unliked video ${videoId}`);
            } else {
                // User has not liked, like it
                transaction.set(likeRef, { userId: auth.currentUser.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                transaction.update(videoRef, { likes: currentLikes + 1 });
                // Update UI immediately
                 if(likeIcon) likeIcon.classList.add('liked', 'fas');
                 if(likeIcon) likeIcon.classList.remove('far'); // Use filled heart icon
                 if(likeCountSpan) likeCountSpan.textContent = currentLikes + 1;
                 if(likeCountSpan) likeCountSpan.dataset.likes = currentLikes + 1; // Update data attribute

                 // Show like heart popup on double-click or icon click
                 if(likeHeartPopup) {
                     likeHeartPopup.classList.remove('show'); // Reset animation
                     void likeHeartPopup.offsetWidth; // Trigger reflow
                     likeHeartPopup.classList.add('show');
                      // Remove the 'show' class after animation
                     likeHeartPopup.addEventListener('animationend', () => {
                          likeHeartPopup.classList.remove('show');
                     }, { once: true });
                 }
                // console.log(`User liked video ${videoId}`);
            }
        });

        // Optional: Listen to real-time updates on the video document's like count
        // to ensure the UI count is always accurate, especially if multiple users are liking.
        // This would require setting up a listener when the video slide is in view.

    } catch (error) {
        console.error("Error handling like action:", error);
        // alert("Could not process like action.");
    }
}


async function openCommentsModal(videoId, videoOwnerUid) {
    // console.log(`Opening comments for video ${videoId} by ${videoOwnerUid}`);
    if (!auth.currentUser || !auth.currentUser.uid) {
        alert("Please log in to view or post comments.");
        return;
    }
    appState.activeComments = { videoId, videoOwnerUid };
    commentsModal.classList.add('active');
    commentsList.innerHTML = '<li>Loading comments...</li>'; // Show loading state
    commentInput.value = ''; // Clear input
    sendCommentBtn.disabled = true; // Disable send button while loading/empty

    try {
        const commentsRef = db.collection('videos').doc(videoId).collection('comments').orderBy('createdAt', 'asc'); // Order by ascending for chat-like view
        const snapshot = await commentsRef.get();

        commentsList.innerHTML = ''; // Clear loading state
        if (snapshot.empty) {
             commentsList.innerHTML = '<li style="text-align:center; color: #888;">Be the first to comment!</li>';
        } else {
            snapshot.docs.forEach(doc => {
                const comment = { id: doc.id, ...doc.data() };
                const canDelete = appState.currentUser.uid === comment.uploaderUid || appState.currentUser.uid === videoOwnerUid;
                const timestamp = comment.createdAt ? new Date(comment.createdAt.toDate()).toLocaleString() : 'just now'; // Format timestamp

                const commentItem = document.createElement('li');
                commentItem.className = 'comment-item';
                commentItem.innerHTML = `
                    <img src="${comment.uploaderAvatar || 'https://via.placeholder.com/35/222/FFFFFF?text=+'}" alt="avatar" class="avatar">
                    <div class="comment-body">
                        <div class="username">${comment.uploaderUsername || 'User'} <span class="timestamp">${timestamp}</span></div>
                        <div class="text">${comment.text}</div>
                    </div>
                    ${canDelete ? `<i class="fas fa-trash delete-comment-btn" data-comment-id="${comment.id}" onclick="deleteComment('${videoId}', '${comment.id}')"></i>` : ''}
                `;
                commentsList.appendChild(commentItem);
            });
             // Scroll to bottom of comments list
            commentsList.scrollTop = commentsList.scrollHeight;
        }

    } catch (error) {
        console.error("Error loading comments:", error);
        commentsList.innerHTML = '<li style="text-align:center; color: red;">Could not load comments.</li>';
    } finally {
        // Enable send button only if there is text
         sendCommentBtn.disabled = commentInput.value.trim() === '';
    }
}

// Add input event listener to comment input to enable/disable send button
if(commentInput) {
    commentInput.addEventListener('input', () => {
        if (sendCommentBtn) {
            sendCommentBtn.disabled = commentInput.value.trim() === '';
        }
    });
}


function closeCommentsModal() {
     // console.log("Closing comments modal.");
     commentsModal.classList.remove('active');
     appState.activeComments = { videoId: null, videoOwnerUid: null }; // Reset active comments state
     commentsList.innerHTML = ''; // Clear list when closing
     commentInput.value = ''; // Clear input
     if (sendCommentBtn) sendCommentBtn.disabled = true; // Disable send button
}

async function postComment() {
    // console.log("Attempting to post comment.");
    const { videoId, videoOwnerUid } = appState.activeComments;
    const text = commentInput.value.trim();

    if (!text || !videoId || !auth.currentUser || !auth.currentUser.uid) {
        // console.log("Comment text or video ID missing, or user not logged in.");
        return; // Don't post empty comment or if no video/user
    }

    sendCommentBtn.disabled = true; // Disable button to prevent double posts

    const newComment = {
        text: text,
        uploaderUid: appState.currentUser.uid,
        uploaderUsername: appState.currentUser.name || appState.currentUser.username || 'User',
        uploaderAvatar: appState.currentUser.avatar || 'https://via.placeholder.com/35/222/FFFFFF?text=+',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const videoRef = db.collection('videos').doc(videoId);
    const commentsCollectionRef = videoRef.collection('comments');

    try {
        // Add the comment and update comment count in a transaction
        await db.runTransaction(async (transaction) => {
             // Get the current video document to ensure it exists
             const videoDoc = await transaction.get(videoRef);
             if (!videoDoc.exists) {
                 throw new Error("Video document does not exist.");
             }

             // Add the new comment
             const newCommentRef = commentsCollectionRef.doc(); // Firestore generates a unique ID
             transaction.set(newCommentRef, newComment);

             // Increment the comment count on the video document
             const currentCommentCount = videoDoc.data().commentCount || 0;
             transaction.update(videoRef, { commentCount: currentCommentCount + 1 });
        });

        // console.log("Comment posted successfully and count incremented.");
        commentInput.value = ''; // Clear the input field
        // Refresh the comments list after posting
        openCommentsModal(videoId, videoOwnerUid); // Re-open modal to show new comment and updated count

         // Optionally update the comment count display on the video slide directly
         const commentCountSpan = document.querySelector(`.video-slide[data-video-id="${videoId}"] .action-icon-container[data-action="comment"] .count`);
         if(commentCountSpan) {
              const currentCount = parseInt(commentCountSpan.dataset.comments || '0', 10);
              commentCountSpan.textContent = currentCount + 1;
              commentCountSpan.dataset.comments = currentCount + 1;
         }


    } catch (error) {
        console.error("Error posting comment: ", error);
        alert("Could not post comment. Please check Firestore Security Rules and your connection.");
    } finally {
        sendCommentBtn.disabled = commentInput.value.trim() === ''; // Re-enable button based on input value
    }
}


// Function to delete a comment
async function deleteComment(videoId, commentId) {
    // console.log(`Attempting to delete comment ${commentId} from video ${videoId}`);
    if (!auth.currentUser || !auth.currentUser.uid || !videoId || !commentId || !appState.activeComments.videoOwnerUid) {
        console.log("Cannot delete: Missing user, videoId, commentId, or videoOwnerUid.");
        return;
    }

    const commentRef = db.collection('videos').doc(videoId).collection('comments').doc(commentId);
    const videoRef = db.collection('videos').doc(videoId);

    try {
        const commentDoc = await commentRef.get();
        if (!commentDoc.exists) {
             console.log("Comment does not exist.");
             return;
        }

        const commentData = commentDoc.data();
        const isOwner = auth.currentUser.uid === commentData.uploaderUid;
        const isVideoOwner = auth.currentUser.uid === appState.activeComments.videoOwnerUid;

        // Check if the current user is either the comment owner or the video owner
        if (!isOwner && !isVideoOwner) {
             console.log("User is not authorized to delete this comment.");
             alert("You do not have permission to delete this comment.");
             return;
        }

        // Proceed with deletion using a transaction to also decrement the count
        await db.runTransaction(async (transaction) => {
            const videoDoc = await transaction.get(videoRef);
            if (!videoDoc.exists) {
                throw new Error("Video document does not exist during comment deletion.");
            }

            // Delete the comment document
            transaction.delete(commentRef);

            // Decrement the comment count on the video document
            const currentCommentCount = videoDoc.data().commentCount || 0;
            transaction.update(videoRef, { commentCount: Math.max(0, currentCommentCount - 1) }); // Ensure count doesn't go below 0
        });

        // console.log("Comment deleted successfully and count decremented.");
        // Refresh the comments list after deletion
        openCommentsModal(videoId, appState.activeComments.videoOwnerUid);

         // Optionally update the comment count display on the video slide directly
         const commentCountSpan = document.querySelector(`.video-slide[data-video-id="${videoId}"] .action-icon-container[data-action="comment"] .count`);
         if(commentCountSpan) {
              const currentCount = parseInt(commentCountSpan.dataset.comments || '0', 10);
              commentCountSpan.textContent = Math.max(0, currentCount - 1);
              commentCountSpan.dataset.comments = Math.max(0, currentCount - 1);
         }

    } catch (error) {
        console.error("Error deleting comment: ", error);
        alert("Could not delete comment. Please check Firestore Security Rules and your connection.");
    }
}


function logoutUser() {
    if (confirm("Are you sure you want to log out?")) {
        auth.signOut().then(() => {
            // console.log("User logged out.");
            // Clear app state or reload the page
            window.location.reload(); // Reloading is the simplest way to reset state
        }).catch((error) => {
            console.error("Logout failed:", error);
            alert("Logout failed: " + error.message);
        });
    }
}

function initiateWithdrawal() {
    // console.log("Initiating withdrawal...");
    // Add actual withdrawal logic here (e.g., sending data to backend)
    // For now, just simulate success and navigate
    const upiId = document.getElementById('upi-id').value.trim();
    if (!upiId) {
        alert("Please enter your UPI ID.");
        return;
    }
    // Simulated withdrawal success
    alert(`Withdrawal initiated for UPI ID: ${upiId}. This is a simulation.`);
    navigateTo('withdraw-success-screen'); // Navigate to success screen
}

// Audio Issue Popup Logic
const audioIssuePopup = document.getElementById('audio-issue-popup');
const audioIssueOkBtn = document.getElementById('audio-issue-ok-btn');

function showAudioIssuePopup() {
    if (audioIssuePopup) {
        audioIssuePopup.classList.add('active');
    }
}

function hideAudioIssuePopup() {
    if (audioIssuePopup) {
        audioIssuePopup.classList.remove('active');
    }
}

if (audioIssueOkBtn) {
    audioIssueOkBtn.addEventListener('click', () => {
        hideAudioIssuePopup();
         // Once user clicks OK on the popup, mark interaction as true
        if (!userHasInteracted) {
             console.log("First user interaction detected via audio popup OK button.");
            userHasInteracted = true;
             // Attempt to unmute the active player if it's still playing
             if (activePlayerId && players[activePlayerId]) {
                 const player = players[activePlayerId];
                 if (player instanceof YT.Player && typeof player.unMute === 'function') {
                      console.log("Attempting to unmute active YouTube player after popup interaction.");
                      player.unMute();
                 } else if (player instanceof HTMLVideoElement) {
                      console.log("Attempting to unmute active HTML5 player after popup interaction.");
                      player.muted = false;
                 }
             }
        }
    });
}


function openChatWindow(userId, username) {
    console.log(`Attempting to open chat with ${username} (ID: ${userId}).`);
    alert(`Opening chat with ${username}.\nThis feature is under development.`);
    // In a real app, you would navigate to a chat screen, likely passing userId
    // navigateTo('chat-screen', { userId: userId });
}

function showFriendsSubView(viewName) {
     console.log(`Switching friends sub-view to: ${viewName}`);
    // Logic to switch between Messages, Status, Story, Content, AI Friend views
    // This likely involves showing/hiding different sections within the #friends-screen
    alert(`Switching to ${viewName} view.\nThis section is under development.`);

    // Example: Update active class on sub-nav icons (assuming you have elements with these IDs)
     document.querySelectorAll('.friends-nav-icon').forEach(icon => icon.classList.remove('active'));
     const targetIcon = document.getElementById(`friends-nav-${viewName.toLowerCase().replace(' ', '')}`);
     if (targetIcon) targetIcon.classList.add('active');

     // Example: Hide all content sections and show the relevant one
     // (Requires corresponding HTML structure for sub-views like #messages-view, #status-view etc.)
     // document.querySelectorAll('.friends-content-view').forEach(view => view.style.display = 'none');
     // const targetView = document.getElementById(`${viewName.toLowerCase().replace(' ', '')}-view`);
     // if (targetView) targetView.style.display = 'block';
}


async function handlePremiumFileUpload() {
    if (!premiumUploadBtn) return;

    premiumUploadBtn.disabled = true;
    premiumUploadBtn.textContent = 'Uploading...';

    const file = premiumVideoFileInput.files[0];
    const title = premiumVideoTitle.value.trim();
    const category = appState.uploadDetails.category; // appState से कैटेगरी लें

    // Check if a category was selected (not the default placeholder text)
    const selectedCategoryTextElement = document.getElementById('selected-category-text-premium');
    const isCategorySelected = category && selectedCategoryTextElement && selectedCategoryTextElement.textContent !== 'Select Category';


    if (!file || !title || !isCategorySelected) {
        alert("Please select a video file, enter a title, and select a category.");
        premiumUploadBtn.disabled = false;
        premiumUploadBtn.textContent = 'Upload Video';
        return;
    }

    // Optional: File size validation
    const maxFileSizeMB = 100; // Example limit
    if (file.size > maxFileSizeMB * 1024 * 1024) {
        alert(`File size exceeds the limit of ${maxFileSizeMB}MB.`);
        premiumUploadBtn.disabled = false;
        premiumUploadBtn.textContent = 'Upload Video';
        return;
    }

    if (premiumUploadProgress) premiumUploadProgress.style.display = 'block';
    if (premiumUploadProgressText) premiumUploadProgressText.textContent = `Uploading... (Please wait)`;

    try {
        const formData = new FormData();
        formData.append('media', file);
        formData.append('title', title);
        formData.append('description', premiumVideoDescription.value.trim());
        formData.append('hashtags', premiumVideoHashtags.value.trim());
        formData.append('category', category); // Use the category from appState
        formData.append('uploaderUid', auth.currentUser.uid);
        formData.append('uploaderUsername', appState.currentUser.name || appState.currentUser.username || 'User');
        formData.append('uploaderAvatar', appState.currentUser.avatar || 'https://via.placeholder.com/40');
        formData.append('videoType', 'premium'); // Specify video type

        // You might need to add progress tracking here if your backend supports it
        // e.g., using XMLHttpRequest or Fetch API with a custom Uploader class

        const response = await fetch(RENDER_BACKEND_URL, { // Use the main upload endpoint
            method: 'POST',
            body: formData
            // headers: { 'Content-Type': '...' } // Do NOT set Content-Type for FormData, browser does it
        });

        if (!response.ok) {
             const errorData = await response.json().catch(() => null); // Try to parse error JSON
             const errorMessage = errorData && errorData.error ? errorData.error : response.statusText;
            throw new Error(`Upload failed with status: ${response.status} - ${errorMessage}`);
        }

        const result = await response.json();
         if (!result.downloadURL) {
              throw new Error("Upload succeeded but no downloadURL received from backend.");
         }

        if (premiumUploadProgressText) premiumUploadProgressText.textContent = 'Processing and Saving...';

        // Save video metadata to Firestore after successful file upload
        const videoData = {
            uploaderUid: auth.currentUser.uid,
            uploaderUsername: appState.currentUser.name || appState.currentUser.username || 'User',
            uploaderAvatar: appState.currentUser.avatar || 'https://via.placeholder.com/40',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            title: title,
            description: premiumVideoDescription.value.trim(),
            hashtags: premiumVideoHashtags.value.trim(),
            videoUrl: result.downloadURL, // Use the URL from the backend response
            thumbnailUrl: result.thumbnailUrl || 'https://via.placeholder.com/420x740/111/fff?text=Video', // Use thumbnail URL from backend if provided
            videoType: 'premium',
            category: category, // Use the selected category
            audience: appState.uploadDetails.audience || 'all', // Use selected audience
            commentsEnabled: true, // Or get from a toggle if you add one
            likes: 0,
            commentCount: 0
        };

        await db.collection("videos").add(videoData);

        alert("Premium video uploaded successfully!");

        // Reset form fields
        if (premiumVideoFileInput) premiumVideoFileInput.value = '';
        if (premiumVideoPreview) {
            premiumVideoPreview.removeAttribute('src');
            premiumVideoPreview.style.display = 'none';
        }
        if (premiumVideoTitle) premiumVideoTitle.value = '';
        if (premiumVideoDescription) premiumVideoDescription.value = '';
        if (premiumVideoHashtags) premiumVideoHashtags.value = '';
        if (selectedCategoryTextPremium) selectedCategoryTextPremium.textContent = 'Select Category'; // Reset category text
        appState.uploadDetails.category = null; // Clear selected category in state

        await loadAllVideosFromFirebase(); // सभी वीडियो फिर से लोड करें जिसमें नया भी शामिल है
        // navigateTo('home-screen'); // Home Screen पर नेविगेट करें
        filterVideosByCategory('all'); // 'All' कैटेगरी फिल्टर के साथ Home दिखाएं


    } catch (error) {
        console.error("Error during premium upload:", error);
        alert("Upload failed. Please try again. Error: " + error.message);
        if (premiumUploadProgressText) premiumUploadProgressText.textContent = 'Upload Failed';
    } finally {
        if (premiumUploadProgress) premiumUploadProgress.style.display = 'none';
        premiumUploadBtn.disabled = false;
        premiumUploadBtn.textContent = 'Upload Video';
    }
}


const startAppLogic = async () => {
    console.log("Starting app logic...");

    // Define the promise that resolves when the first YouTube or HTML5 player is ready.
    // This promise's resolve function (window.resolveFirstPlayerReady) is called
    // inside the onReady event handler for YT players or the canplay event for HTML5 players.
    const firstPlayerReadyPromise = new Promise(resolve => {
        window.resolveFirstPlayerReady = resolve; // Store resolve globally
        window._firstPlayerReadyResolved = false; // Flag to ensure it only resolves once
    });

    // Set up a timeout for the player readiness waiting part
    const playerReadyTimeout = new Promise((resolve, reject) => // <-- FIX: Changed from (_, reject) to (resolve, reject) to make `resolve` available
        setTimeout(() => {
            console.warn("Player readiness timed out after 15 seconds.");
             // We don't necessarily need to reject the whole app init here.
             // Just letting this promise "lose" the race means the app will proceed
             // without waiting for players if they are taking too long.
             // If no players are created successfully, the "No videos" message will show, or HTML5 might try to play.
             // Resolving it gracefully allows the app to proceed.
             resolve(); // This will now call the `resolve` defined in the promise's executor function.
        }, 15000) // 15 seconds timeout for player readiness
    );

    try {
        // Load videos from Firebase first (this is independent of the player API)
        console.log("Loading all videos...");
        await loadAllVideosFromFirebase(); // Populates fullVideoList and appState.allVideos

        // Now, if there are videos, wait for the first player to be ready OR the player readiness timeout
        // We only await the player readiness if there are videos to play.
        if (appState.allVideos.length > 0) {
             console.log(`Loaded ${appState.allVideos.length} videos. Waiting for first player ready or player readiness timeout.`);
             // Use Promise.race to wait for the first player ready OR the specific player readiness timeout
             await Promise.race([firstPlayerReadyPromise, playerReadyTimeout]);
             console.log("First player ready or player readiness timeout reached. Proceeding.");
        } else {
             console.log("No videos loaded. Skipping player readiness wait.");
             // No videos, no players to wait for. The app can proceed directly.
             // Ensure any pending playerReadyPromise is potentially resolved if it exists,
             // though in this branch, it won't be awaited anyway.
             if (window.resolveFirstPlayerReady && !window._firstPlayerReadyResolved) {
                 window.resolveFirstPlayerReady();
                 window._firstPlayerReadyResolved = true;
             }
        }


        // Initialize players (will only create YT players if isYouTubeApiReady is true)
        // and setup observer. This happens implicitly when filterVideosByCategory calls renderVideoSwiper.
        console.log("Filtering videos and rendering swiper...");
        filterVideosByCategory('all'); // This calls renderVideoSwiper and setupVideoObserver


        // Navigate to the home screen only after initial data load and rendering setup attempt
        console.log("App logic finished loading. Navigating to home screen.");
        navigateTo('home-screen');

    } catch (error) {
        // This catch block will only run for critical errors *before* the timeout,
        // or if the timeout itself was set up to reject (which we changed to resolve).
        // So, critical errors in loadAllVideosFromFirebase would land here.
        console.error("App initialization critical error:", error);
        alert("Failed to load the application: " + error.message + ". Please check your internet connection and try again.");
        // Ensure loading indicator is hidden on critical error
        document.getElementById('loading-container').style.display = 'none';
        document.getElementById('get-started-btn').style.display = 'block'; // Show button again
    }
};

// Keep the global function for the YouTube API script to call
window.onYouTubeIframeAPIReady = () => {
    isYouTubeApiReady = true;
    console.log("Global onYouTubeIframeAPIReady called by YouTube API script.");
    // initializePlayers will be called by filterVideosByCategory (which is called by startAppLogic)
    // initializePlayers will then create YT players if isYouTubeApiReady is true,
    // and the onReady of the *first* player will resolve window.resolveFirstPlayerReady.
};


document.addEventListener('DOMContentLoaded', () => {
    // console.log("DOM Content Loaded. Initializing App...");

    initializeApp(); // यह ऑथेंटिकेशन चेक शुरू करता है

    // Category options for modals/upload screens
    renderCategories();

    // Category chips for the home screen bar
    renderCategoriesInBar();


    document.getElementById('get-started-btn').addEventListener('click', async () => {
        document.getElementById('get-started-btn').style.display = 'none';
        document.getElementById('loading-container').style.display = 'flex';
        // InitialApp() में onAuthStateChanged() इसे संभालेगा।
        // checkUserProfileAndProceed() को यहां सीधे कॉल करने की आवश्यकता नहीं है
    });

    // This listener ensures userHasInteracted is true after the very first click on the app container
    appContainer.addEventListener('click', () => {
        if (!userHasInteracted) {
             console.log("First user interaction detected via app container click.");
             userHasInteracted = true;
             // Hide audio issue popup immediately on first interaction
             hideAudioIssuePopup();
             // Attempt to unmute the currently active player
             if (activePlayerId && players[activePlayerId]) {
                  const player = players[activePlayerId];
                   if (player instanceof YT.Player && typeof player.unMute === 'function') {
                        console.log("Attempting to unmute active YouTube player after first interaction.");
                       player.unMute();
                   } else if (player instanceof HTMLVideoElement) {
                        console.log("Attempting to unmute active HTML5 player after first interaction.");
                       player.muted = false;
                   }
             }
        }
    }, { once: true }); // This listener will only run once


    document.getElementById('home-menu-icon').addEventListener('click', () => { document.getElementById('main-sidebar').classList.add('open'); document.getElementById('sidebar-overlay').classList.add('open'); });
    document.getElementById('close-sidebar-btn').addEventListener('click', () => { document.getElementById('main-sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); });
    document.getElementById('sidebar-overlay').addEventListener('click', () => { document.getElementById('main-sidebar').classList.remove('open'); document.getElementById('sidebar-overlay').classList.remove('open'); });

    // Comment functionality event listeners
    if(sendCommentBtn) sendCommentBtn.addEventListener('click', postComment);
    if(commentInput) commentInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !sendCommentBtn.disabled) postComment(); }); // Check if button is not disabled


    document.getElementById('navigate-to-theme-btn').addEventListener('click', () => {
        document.getElementById('main-sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('open');
        navigateTo('theme-settings-screen');
    });
    document.getElementById('back-from-theme-btn').addEventListener('click', () => navigateTo('home-screen')); // Theme screen back button

    document.querySelectorAll('#theme-settings-screen .theme-btn').forEach(button => {
        button.addEventListener('click', () => {
            // Update active class visually
            document.querySelectorAll('#theme-settings-screen .theme-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            // Apply theme class to html element
            document.documentElement.classList.toggle('light-theme', button.dataset.theme === 'default');
            // Save theme preference (optional, requires more code)
            // localStorage.setItem('shubhzoneTheme', button.dataset.theme);
        });
    });

    document.querySelectorAll('#theme-settings-screen .color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            // Update active class visually
             document.querySelectorAll('#theme-settings-screen .color-swatch').forEach(sw => sw.classList.remove('active'));
             swatch.classList.add('active');
            // Apply primary color variable
            document.documentElement.style.setProperty('--primary-neon', swatch.dataset.color);
            // Save color preference (optional, requires more code)
            // localStorage.setItem('shubhzonePrimaryColor', swatch.dataset.color);
        });
    });

    // Set initial theme and color on load (optional, requires localStorage)
    // const savedTheme = localStorage.getItem('shubhzoneTheme') || 'dark';
    // const initialThemeBtn = document.querySelector(`#theme-settings-screen .theme-btn[data-theme="${savedTheme}"]`);
    // if (initialThemeBtn) initialThemeBtn.click(); // Simulate click to apply theme/active class

    // const savedColor = localStorage.getItem('shubhzonePrimaryColor');
    // const initialColorSwatch = document.querySelector(`#theme-settings-screen .color-swatch[data-color="${savedColor}"]`);
    // if (savedColor && initialColorSwatch) {
    //      initialColorSwatch.click(); // Simulate click to apply color/active class
    // } else {
        // Ensure a default color swatch is active on load if no preference is saved
        const defaultColorSwatch = document.querySelector('#theme-settings-screen .color-swatch.active');
         if (!defaultColorSwatch) {
             const firstSwatch = document.querySelector('#theme-settings-screen .color-swatch');
             if (firstSwatch) firstSwatch.classList.add('active');
         }
    // }


    const openYouTubeBtn = document.getElementById('open-youtube-modal-btn');
    if (openYouTubeBtn) {
        openYouTubeBtn.addEventListener('click', openUploadDetailsModal);
    }
    const openPremiumBtn = document.getElementById('open-premium-upload-btn');
    if (openPremiumBtn) {
        openPremiumBtn.addEventListener('click', () => {
            // Reset premium upload form state before navigating
            if (premiumVideoFileInput) premiumVideoFileInput.value = '';
            if (premiumVideoPreview) { premiumVideoPreview.removeAttribute('src'); premiumVideoPreview.style.display = 'none'; }
            if (premiumVideoTitle) premiumVideoTitle.value = '';
            if (premiumVideoDescription) premiumVideoDescription.value = '';
            if (premiumVideoHashtags) premiumVideoHashtags.value = '';
            // Reset category selection UI and state for premium upload
            if (selectedCategoryTextPremium) selectedCategoryTextPremium.textContent = 'Select Category';
            appState.uploadDetails.category = null; // Clear selected category in state
            if(premiumUploadProgress) premiumUploadProgress.style.display = 'none';
             if(premiumUploadProgressText) premiumUploadProgressText.textContent = '';


            navigateTo('premium-upload-screen');
        });
    }

    // Image Editor Navigation
    const navigateToEditorBtn = document.getElementById('navigate-to-editor-btn');
    if(navigateToEditorBtn) {
        navigateToEditorBtn.addEventListener('click', () => {
            navigateTo('image-editor-screen');
             // Call photo editor start logic here if it depends on screen navigation
             if (typeof photoEditor !== 'undefined' && typeof photoEditor.start === 'function') {
                  photoEditor.start();
             } else {
                  console.warn("Photo Editor start function not found.");
             }
        });
    }
     const backFromEditorBtn = document.getElementById('back-from-editor-btn');
     if(backFromEditorBtn) {
         backFromEditorBtn.addEventListener('click', () => {
              navigateTo('upload-screen');
              // Call photo editor stop/cleanup logic here if needed
              if (typeof photoEditor !== 'undefined' && typeof photoEditor.stop === 'function') {
                   photoEditor.stop();
              }
         });
     }


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
                // Optional: Revoke old URL object to free memory
                 if(premiumVideoPreview.dataset.oldUrl) {
                     URL.revokeObjectURL(premiumVideoPreview.dataset.oldUrl);
                 }
                 premiumVideoPreview.dataset.oldUrl = fileURL;
            }
        });
    }

    // Friends Sub-navigation listeners
    const friendsNavMessages = document.getElementById('friends-nav-messages');
    const friendsNavStatus = document.getElementById('friends-nav-status');
    const friendsNavStory = document.getElementById('friends-nav-story');
    const friendsNavContent = document.getElementById('friends-nav-content');
    const friendsNavAI = document.getElementById('friends-nav-ai');

    if (friendsNavMessages) friendsNavMessages.addEventListener('click', () => showFriendsSubView('Messages'));
    if (friendsNavStatus) friendsNavStatus.addEventListener('click', () => showFriendsSubView('Status'));
    if (friendsNavStory) friendsNavStory.addEventListener('click', () => showFriendsSubView('Story'));
    if (friendsNavContent) friendsNavContent.addEventListener('click', () => showFriendsSubView('Content'));
    if (friendsNavAI) friendsNavAI.addEventListener('click', () => showFriendsSubView('AI Friend'));

    // Withdrawal button listener
    const withdrawButton = document.querySelector('#wallet-screen .button-withdraw');
    if(withdrawButton) {
        withdrawButton.addEventListener('click', initiateWithdrawal);
    }

    // Back button from withdraw success screen
    const backToWalletButton = document.querySelector('#withdraw-success-screen .back-to-wallet-button');
    if(backToWalletButton) {
        backToWalletButton.addEventListener('click', () => navigateTo('wallet-screen'));
    }

    // Initialize custom input visibility on info screen load
    // This is handled within updateProfileUI if coming from auth check
    // but might be needed if navigating directly or on page load
    // Add event listeners for select changes if needed
    const infoStateSelect = document.getElementById('info-state');
    const infoCountrySelect = document.getElementById('info-country');
    if(infoStateSelect) infoStateSelect.addEventListener('change', () => checkCustom(infoStateSelect, 'custom-state-input'));
    if(infoCountrySelect) infoCountrySelect.addEventListener('change', () => checkCustom(infoCountrySelect, 'custom-country-input'));


});


/* ======================================================= */
/* === AI Photo Editor Script (Code 1) - START === */
/* ======================================================= */
// NOTE: The photoEditor variable should be defined globally or accessible here.
// Assuming photoEditor is defined elsewhere (e.g., in the original file or a separate file)
// and its public methods like .start(), .stop(), .downloadImage() are accessible.
// If the photo editor code is IN THIS SAME FILE, ensure it's wrapped correctly,
// like in the commented-out IIFE below.
//
// const photoEditor = (() => {
//     // ... all of your AI Photo Editor code here ...
//     // Make sure public methods like start, stop, downloadImage are returned
//     return {
//         start: () => { console.log("Photo Editor Started"); /*...*/ },
//         stop: () => { console.log("Photo Editor Stopped"); /*...*/ },
//         downloadImage: () => { console.log("Photo Editor Download"); /*...*/ }
//         // ... other public methods ...
//     };
// })();

// If photoEditor is defined externally or further down in this file,
// the calls navigateTo('image-editor-screen') and navigateTo('upload-screen')
// in the DOMContentLoaded listener assume photoEditor is available when those clicks happen.


/* ======================================================= */
/* === AI Photo Editor Script (Code 1) - END === */
/* ======================================================= */
