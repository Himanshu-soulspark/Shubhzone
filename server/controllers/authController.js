// server/controllers/authController.js

const { spawn } = require('child_process');
const path = require('path');

// चेतावनी: उत्पादन (production) में, आपको पासवर्ड संग्रहीत करने के लिए एक सुरक्षित सत्र (secure session) या डेटाबेस का उपयोग करना चाहिए।
// यह केवल एक प्रदर्शन के लिए इन-मेमोरी स्टोर है।
const userSessions = new Map();

/**
 * /login एंडपॉइंट के तर्क को संभालता है।
 * अस्थायी रूप से पासवर्ड को ईमेल के साथ संग्रहीत करता है।
 */
const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
    }
    
    // प्रदर्शन के लिए अस्थायी रूप से पासवर्ड संग्रहीत करें
    userSessions.set(email, { password });

    console.log(`Login data received for ${email}. Stored password temporarily.`);

    res.status(200).json({ status: 'success', message: 'Login data received. Please provide OTP.' });
  } catch (error) {
    console.error('Error in handleLogin:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

/**
 * /otp एंडपॉइंट के तर्क को संभालता है।
 * Python स्क्रिप्ट को निष्पादित करता है।
 */
const handleOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // सत्र से पासवर्ड पुनः प्राप्त करें
    const sessionData = userSessions.get(email);

    if (!sessionData || !sessionData.password) {
      return res.status(400).json({ status: 'error', message: 'Session not found or password missing. Please start with /login.' });
    }

    const { password } = sessionData;
    
    console.log(`OTP received for ${email}. Starting Python worker...`);

    // Python स्क्रिप्ट का पथ। __dirname वर्तमान फ़ाइल की डायरेक्टरी है।
    // हम रूट डायरेक्टरी तक पहुंचने के लिए '../..' का उपयोग करते हैं।
    const scriptPath = path.join(__dirname, '../../bot_worker.py');

    // 'python3' या 'python' का उपयोग करें, जो आपके सिस्टम पर निर्भर करता है।
    // तर्क एक सरणी (array) में पास किए जाते हैं: [scriptName, arg1, arg2, arg3]
    const pythonProcess = spawn('python3', [scriptPath, email, password, otp]);

    let stdoutData = '';
    let stderrData = '';

    // Python स्क्रिप्ट के स्टैंडर्ड आउटपुट को सुनें
    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Python Worker STDOUT]: ${output}`);
      stdoutData += output;
    });

    // Python स्क्रिप्ट के स्टैंडर्ड एरर को सुनें
    pythonProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      console.error(`[Python Worker STDERR]: ${errorOutput}`);
      stderrData += errorOutput;
    });
    
    // स्क्रिप्ट के निष्पादन के दौरान त्रुटि को संभालें (जैसे, 'python3' कमांड नहीं मिला)
    pythonProcess.on('error', (error) => {
        console.error(`Failed to start Python process: ${error.message}`);
        return res.status(500).json({ status: 'error', message: 'Failed to start the bot worker.' });
    });

    // जब Python स्क्रिप्ट समाप्त हो जाए तो सुनें
    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);

      // सत्र से पासवर्ड साफ़ करें
      userSessions.delete(email);

      if (code === 0 && stdoutData.includes('Success')) {
        res.status(200).json({ status: 'success', message: 'Bot successfully logged in.' });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Bot failed to log in.',
          details: stderrData || stdoutData, // त्रुटि विवरण प्रदान करें
        });
      }
    });

  } catch (error) {
    console.error('Error in handleOtp:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

module.exports = {
  handleLogin,
  handleOtp,
};
