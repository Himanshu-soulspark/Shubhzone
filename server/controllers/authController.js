// server/controllers/authController.js

const { spawn } = require('child_process');
const path = require('path');

const userSessions = new Map();

const handleLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
    }
    userSessions.set(email, { password });
    console.log(`Login data received for ${email}. Stored password temporarily.`);
    res.status(200).json({ status: 'success', message: 'Login data received. Please provide OTP.' });
  } catch (error) {
    console.error('Error in handleLogin:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

const handleOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const sessionData = userSessions.get(email);

    if (!sessionData || !sessionData.password) {
      return res.status(400).json({ status: 'error', message: 'Session not found or password missing. Please start with /login.' });
    }

    const { password } = sessionData;
    
    console.log(`OTP received for ${email}. Starting Python worker...`);

    // --- यह लाइन बदली गई है ---
    // Dockerfile में WORKDIR /app सेट है, इसलिए स्क्रिप्ट का पथ सीधे /app/bot_worker.py होगा।
    const scriptPath = '/app/bot_worker.py';
    // -------------------------

    // 'python3' या 'python' का उपयोग करें, जो आपके सिस्टम पर निर्भर करता है।
    const pythonProcess = spawn('python3', [scriptPath, email, password, otp]);

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Python Worker STDOUT]: ${output}`);
      stdoutData += output;
    });

    pythonProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString();
      console.error(`[Python Worker STDERR]: ${errorOutput}`);
      stderrData += errorOutput;
    });
    
    pythonProcess.on('error', (error) => {
        console.error(`Failed to start Python process: ${error.message}`);
        return res.status(500).json({ status: 'error', message: 'Failed to start the bot worker.' });
    });

    pythonProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`);
      userSessions.delete(email);

      if (code === 0 && stdoutData.includes('Success')) {
        res.status(200).json({ status: 'success', message: 'Bot successfully logged in.' });
      } else {
        res.status(500).json({
          status: 'error',
          message: 'Bot failed to log in.',
          details: stderrData || stdoutData,
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
