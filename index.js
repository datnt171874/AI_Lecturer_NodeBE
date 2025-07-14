const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express')
const YAML = require('yamljs')
const path = require('path');

const authRoute = require('./routes/authRoute')
const lessonRoute = require('./routes/lessonRoute')

dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;


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
const swaggerDocument = YAML.load(path.join(__dirname, './swagger/swagger.yaml'));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoute);
app.use('/api/lessons', lessonRoute);
app.use('/videos', express.static(path.join(__dirname, './controllers/temp')));