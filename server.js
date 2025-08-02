const express = require("express");
const http = require("http");
const path = require("path"); // path module ki zaroorat padegi
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// CORS middleware
app.use(cors());

// --- YAHAN BADLAAV KIYA GAYA HAI ---
// Hum server ko bata rahe hain ki static files (HTML, CSS, JS) isi root directory me hain
app.use(express.static(__dirname));
// ------------------------------------

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

io.on("connection", (socket) => {
  console.log(`User connected with ID: ${socket.id}`);

  socket.emit("your-id", socket.id);

  socket.on("call-user", (data) => {
    io.to(data.userToCall).emit("hey", {
      signal: data.signalData,
      from: data.from,
    });
  });

  socket.on("accept-call", (data) => {
    io.to(data.to).emit("call-accepted", data.signal);
  });

  socket.on("disconnect", () => {
    socket.broadcast.emit("call-ended");
  });
});

// --- YAHAN BHI BADLAAV KIYA GAYA HAI ---
// Jab koi website khole, toh use 'index.html' file de do (root directory se)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// ------------------------------------

server.listen(PORT, () => console.log(`Signaling server is running on port ${PORT}`));
