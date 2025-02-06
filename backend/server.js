const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const path = require('path');

const User = require('./models/user');
const GroupMessage = require('./models/groupMessage');
const PrivateMessage = require('./models/privateMessage');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'views')));

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB Connected'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

//LOCAL STORAGE LOG IN LOG OUT
const sessions = {};

const isAuthenticated = (req, res, next) => {
  const { username } = req.body;

  if (sessions[username]) {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized. Please log in.' });
  }
};

app.post('/api/signup', async (req, res) => {
  try {
    const { username, firstname, lastname, password } = req.body;

    //  if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      username,
      firstname,
      lastname,
      password: hashedPassword,
    });

    await user.save();
    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error('❌ Signup Error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Find 
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid username or password' });
    }

    sessions[username] = true;

    res.status(200).json({ username });
  } catch (err) {
    console.error('❌ Login Error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/logout', (req, res) => {
  const { username } = req.body;

  // Remove the user from the session store
  if (sessions[username]) {
    delete sessions[username];
  }

  res.status(200).json({ message: 'Logged out successfully' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'signup.html'));
});

app.get('/private-chat', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'private_chat.html'));
  });
  
  app.get('/group-chat', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'group_chat.html'));
  });
  app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'views', 'chat.html'));
  });

//  logic
io.on('connection', (socket) => {
  console.log(` New Connection: ${socket.id}`);

  socket.broadcast.emit('message', { user: 'server', text: `User ${socket.id} has joined.` });

  socket.on('disconnect', (reason) => {
    console.log(`❌ Client disconnected ${socket.id} : ${reason}`);
    socket.broadcast.emit('message', { user: 'server', text: `User ${socket.id} has left.` });
  });

  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`👥 ${socket.id} joined room: ${room}`);

    io.to(room).emit('message', { user: 'server', text: `User ${socket.id} has joined ${room}` });
  });

  socket.on('leave_room', (room) => {
    socket.leave(room);
    console.log(` ${socket.id} left room: ${room}`);

    io.to(room).emit('message', { user: 'server', text: `User ${socket.id} has left ${room}` });
  });

    socket.on('group_message', async (data) => {
        try {
        console.log(`📩 Group Message: ${JSON.stringify(data)}`);
        const groupMessage = new GroupMessage({
            from_user: data.from_user,
            room: data.room,
            message: data.message,
        });

        await groupMessage.save();
        io.to(data.room).emit('group_message', data);
        } catch (err) {
        console.error('❌ Error saving group message:', err);
        }
    });

  socket.on('private_message', async (data) => {
    try {
      console.log(`📩 Private Message: ${JSON.stringify(data)}`);
      const privateMessage = new PrivateMessage({
        from_user: data.from_user,
        to_user: data.to_user,
        message: data.message,
      });

      await privateMessage.save();
      socket.to(data.to_user).emit('private_message', data);
    } catch (err) {
      console.error('❌ Error saving private message:', err);
    }
  });

  socket.on('typing', (data) => {
    socket.broadcast.to(data.room).emit('typing', data);
  });
});

const PORT = process.env.PORT || 1080;
server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}/`));