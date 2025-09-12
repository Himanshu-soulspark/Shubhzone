# ---- बिल्ड स्टेज ----
FROM node:18-alpine AS build

WORKDIR /app

# केवल आवश्यक फ़ाइलों को कॉपी करें
COPY package.json package-lock.json ./

# उत्पादन निर्भरताएँ स्थापित करें
RUN npm ci --only=production

# स्रोत कोड कॉपी करें
COPY . .

# ---- उत्पादन स्टेज ----
FROM node:18-alpine

WORKDIR /app

# बिल्ड स्टेज से निर्भरताएँ कॉपी करें
COPY --from=build /app/node_modules ./node_modules

# बिल्ड स्टेज से स्रोत कोड कॉपी करें
COPY --from=build /app ./

# एप्लिकेशन द्वारा उपयोग किया जाने वाला पोर्ट उजागर करें
EXPOSE 8080

# एप्लिकेशन चलाने के लिए कमांड
CMD ["node", "index.js"]tml
