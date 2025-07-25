const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express')
const swaggerDocument = require('./swagger.js');
const {serve, setup} = require('swagger-ui-express');
const YAML = require('yamljs')
const path = require('path');
const multer = require('multer');

const authRoute = require('./routes/authRoute')
const lessonRoute = require('./routes/lessonRoute')
const collectionRoute = require('./routes/collectionRoute');
const pushRoute = require('./routes/push');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;
// Configure multer for file uploads
const storage = multer.memoryStorage(); // Stores file in memory (can be changed to disk storage if needed)
const upload = multer({ storage: storage }); // Initialize upload middleware


app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Thêm tiêu đề COOP
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});


mongoose.connect(process.env.MONGODB_CONNECT_URI,{
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(()=>{ 
  console.log("Connected to MongoDB");
  app.listen(PORT, ()=> console.log("Server is running on port", PORT));
})
.catch(err => {
  console.error("MongoDB connection error:", err);
  process.exit(1);
});
// const swaggerDocument = YAML.load(path.join(__dirname, './swagger/swagger.yaml'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
// app.use('/api-docs', serve, setup(swaggerDocument));

// app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoute);
app.use('/api/lessons', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: 'File upload failed: ' + err.message });
    }
    next();
  });
}, lessonRoute);
app.use('/api/collection', collectionRoute);
app.use('/videos', express.static(path.join(__dirname, 'public/videos')));
app.use('/api/push', pushRoute);
