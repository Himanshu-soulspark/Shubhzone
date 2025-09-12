// server/controllers/authController.js

/**
 * /login एंडपॉइंट के तर्क को संभालता है।
 * @param {object} req - रिक्वेस्ट ऑब्जेक्ट।
 * @param {object} res - रिस्पांस ऑब्जेक्ट।
 */
const handleLogin = async (req, res) => {
  try {
    // रिक्वेस्ट बॉडी से डेटा प्राप्त करें
    const loginData = req.body;

    // प्राप्त डेटा को कंसोल में लॉग करें
    console.log('Login data received:', loginData);

    // एक सफल प्रतिक्रिया भेजें
    res.status(200).json({ status: 'success', message: 'Login data processed.' });
  } catch (error) {
    console.error('Error in handleLogin:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

/**
 * /otp एंडपॉइंट के तर्क को संभालता है।
 * @param {object} req - रिक्वेस्ट ऑब्जेक्ट।
 * @param {object} res - रिस्पांस ऑब्जेक्ट।
 */
const handleOtp = async (req, res) => {
  try {
    // रिक्वेस्ट बॉडी से डेटा प्राप्त करें
    const otpData = req.body;

    // प्राप्त डेटा को कंसोल में लॉग करें
    console.log('OTP received:', otpData);

    // एक सफल प्रतिक्रिया भेजें
    res.status(200).json({ status: 'success', message: 'OTP processed.' });
  } catch (error) {
    console.error('Error in handleOtp:', error);
    res.status(500).json({ status: 'error', message: 'Internal Server Error' });
  }
};

// फ़ंक्शंस को एक्सपोर्ट करें ताकि उन्हें रूट्स फ़ाइल में इस्तेमाल किया जा सके
module.exports = {
  handleLogin,
  handleOtp,
};
