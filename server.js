const express = require("express");
const http = require("http");
const path = require("path"); // path module ko import karein
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// CORS middleware
app.use(cors());

// --- YEH LINE SABSE ZAROORI HAI ---
// 'public' folder ko static files ke liye serve karein
app.use(express.static(path.join(__dirname, 'public')));
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
    console.log(`User ${data.from} is calling ${data.userToCall}`);
    io.to(data.userToCall).emit("hey", {
      signal: data.signalData,
      from: data.from,
    });
  });

  socket.on("accept-call", (data) => {
    console.log(`Call accepted by ${socket.id} to ${data.to}`);
    io.to(data.to).emit("call-accepted", data.signal);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    socket.broadcast.emit("call-ended");
  });
});

// Default route jo aapka index.html dikhayega
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => console.log(`Signaling server is running on port ${PORT}`));
