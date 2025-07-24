const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

exports.register = async (req, res) => {
  const { email, username, password, fullname } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'Email đã được sử dụng' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      email,
      username: username,
      password: hashedPassword,
      fullname: fullname || '',
      role: req.body.role || 'Lecturer'
    });

    await user.save();

    res.status(201).json({ message: 'Đăng ký thành công' });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  console.log(`Login attempt with password: ${password}`);
  try {
    const user = await User.findOne({ email: email });
    if (!user) {
      return res.status(400).json({ message: 'Tên người dùng hoặc mật khẩu không đúng' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Tên người dùng hoặc mật khẩu không đúng' });
    }

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
    console.log(`User found: ${user.email}, Role: ${user.role}`);
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) throw err;
        res.json({ token, message: 'Đăng nhập thành công', role: user.role });
      }
    );
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

exports.googleLogin = async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ message: 'Không nhận được idToken' });
  }

  console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
  console.log('Received idToken:', idToken);

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    console.log('Google payload:', payload);

    if (!payload.email_verified) {
      return res.status(400).json({ message: 'Email Google chưa được xác minh' });
    }

    const { email, name, sub: googleId } = payload;

    let user = await User.findOne({ email });
    if (!user) {
      user = new User({
        email,
        username: email.split('@')[0],
        fullname: name || '',
        password: '',
        role: 'Lecturer',
        googleId,
      });
      await user.save();
      console.log('New user created:', user);
    } else {
      user.googleId = googleId;
      await user.save();
      console.log('User updated:', user);
    }

    const jwtPayload = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };

    jwt.sign(
      jwtPayload,
      process.env.JWT_SECRET,
      { expiresIn: '1h' },
      (err, token) => {
        if (err) {
          console.error('JWT sign error:', err);
          throw err;
        }
        res.json({ token, message: 'Đăng nhập Google thành công', role: user.role });
      }
    );
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ message: 'Lỗi xác thực Google', error: error.message });
  }
};

exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'Người dùng không tồn tại' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi server', error: error.message });
  }
}