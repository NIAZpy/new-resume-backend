require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User'); // This line now correctly imports the User model

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('MongoDB connected...');

    const adminExists = await User.findOne({ role: 'Admin' });
    if (adminExists) {
      console.log('Admin user already exists.');
      mongoose.connection.close();
      return;
    }

    // We no longer need to hash the password here because the 'pre-save' hook in User.js does it automatically.
    const admin = new User({
      username: 'admin',
      password: 'adminpassword', // Provide the plain text password
      role: 'Admin',
    });

    await admin.save();
    console.log('Admin user created successfully!');
  } catch (error) {
    console.error('Error creating admin user:', error);
  } finally {
    mongoose.connection.close();
  }
};

createAdmin();