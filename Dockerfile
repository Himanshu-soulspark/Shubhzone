# Stage 1: Python और Chrome को बेस के रूप में सेट करें
FROM python:3.9-slim

# Google Chrome और आवश्यक निर्भरताएँ इंस्टॉल करें
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Python निर्भरताएँ इंस्टॉल करें
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Node.js इंस्टॉल करें
# NodeSource रिपॉजिटरी और Node.js 18.x इंस्टॉल करें
RUN apt-get update && apt-get install -y curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# अपने एप्लिकेशन कोड को कॉपी करें
COPY . .

# Node.js निर्भरताएँ इंस्टॉल करें
RUN npm install

# एप्लिकेशन को चलाने के लिए पोर्ट को उजागर करें
EXPOSE 10000

# एप्लिकेशन शुरू करने के लिए कमांड
CMD ["node", "server/index.js"]
