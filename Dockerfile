# Stage 1: Python और Chrome को बेस के रूप में सेट करें
FROM python:3.9-slim

# Google Chrome, Chromedriver, और सभी आवश्यक टूल इंस्टॉल करें
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    curl \
    jq \
    --no-install-recommends \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /etc/apt/keyrings/google-chrome.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    # Chromedriver इंस्टॉल करने का नया और विश्वसनीय तरीका
    && CHROME_DRIVER_URL=$(curl -sS https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json | jq -r '.channels.Stable.downloads.chromedriver[] | select(.platform=="linux64") | .url') \
    && wget -q "${CHROME_DRIVER_URL}" -O chromedriver-linux64.zip \
    && unzip chromedriver-linux64.zip \
    && mv chromedriver-linux64/chromedriver /usr/local/bin/ \
    && rm chromedriver-linux64.zip \
    && rm -rf /var/lib/apt/lists/*

# Python निर्भरताएँ इंस्टॉल करें
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Stage 2: Node.js इंस्टॉल करें
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
