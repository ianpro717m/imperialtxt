const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// 1. DATABASE CONNECTION
// REPLACE THE LINK BELOW WITH YOUR ACTUAL MONGODB LINK
mongoose.connect('mongodb+srv://ianpro717m_db_user:<Ian@2026>@cluster0.it5lgsw.mongodb.net/?appName=Cluster0')
    .then(() => console.log("Database Connected Successfully"))
    .catch(err => console.log("Database Connection Error:", err));

// 2. DATA MODELS
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true }
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    from: String, to: String, message: String, time: { type: Date, default: Date.now }
}));

// 3. SOCKET LOGIC
let onlineUsers = {}; // Stores { socketId: username }

io.on('connection', (socket) => {
    // Auth: Sign Up
    socket.on('signup', async (data) => {
        try {
            const hash = await bcrypt.hash(data.password, 10);
            const user = new User({ username: data.username, password: hash });
            await user.save();
            socket.emit('auth-result', { success: true, user: data.username });
        } catch (e) { socket.emit('auth-result', { success: false, msg: "User already exists" }); }
    });

    // Auth: Login
    socket.on('login', async (data) => {
        const user = await User.findOne({ username: data.username });
        if (user && await bcrypt.compare(data.password, user.password)) {
            onlineUsers[socket.id] = user.username;
            socket.emit('auth-result', { success: true, user: user.username });
            io.emit('update-users', onlineUsers);
        } else { socket.emit('auth-result', { success: false, msg: "Wrong login" }); }
    });

    // Messaging & History
    socket.on('get-history', async (data) => {
        const history = await Message.find({
            $or: [{from: data.me, to: data.with}, {from: data.with, to: data.me}]
        }).sort('time');
        socket.emit('load-history', history);
    });

    socket.on('send-msg', async (data) => {
        const msg = new Message({ from: data.from, to: data.toName, message: data.msg });
        await msg.save();
        // Send to specific recipient if they are online
        for (let [id, name] of Object.entries(onlineUsers)) {
            if (name === data.toName) io.to(id).emit('msg-receive', data);
        }
    });

    // Video Signaling
    socket.on('call-request', (data) => {
        io.to(data.toId).emit('incoming-call', { fromPeer: data.myPeer, fromName: data.fromName, isAudio: data.isAudio });
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.id];
        io.emit('update-users', onlineUsers);
    });
});

http.listen(process.env.PORT || 3000, () => console.log("Server Running"));
