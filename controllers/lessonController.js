const Lesson = require('../models/Lesson');
const Segment = require('../models/Segment');
const Slide = require('../models/Slide');
const Video = require('../models/Video');
const PushSubscription = require('../models/PushSubscription');
const getAccessToken = require('./googleTTSAuth.cjs');
const mongoose = require('mongoose');
const axios = require('axios');
const { createCanvas } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');
const mammoth = require('mammoth');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs').promises;
const path = require('path');
const webpush = require('web-push');
const dotenv = require('dotenv');

dotenv.config();

ffmpeg.setFfmpegPath('C:/Users/Asus/Downloads/ffmpeg-7.1.1-essentials_build/ffmpeg-7.1.1-essentials_build/bin/ffmpeg.exe');

// Initialize R2 client
const r2Credentials = {
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
};

if (!r2Credentials.accessKeyId || !r2Credentials.secretAccessKey || !process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_DOMAIN) {
  console.error('R2 configuration is missing or invalid:', {
    accessKeyId: r2Credentials.accessKeyId,
    secretAccessKey: r2Credentials.secretAccessKey ? '[REDACTED]' : undefined,
    accountId: process.env.R2_ACCOUNT_ID,
    bucket: process.env.R2_BUCKET_NAME,
    endpoint: process.env.R2_ENDPOINT,
    publicDomain: process.env.R2_PUBLIC_DOMAIN,
  });
  throw new Error('R2 configuration is missing or invalid');
}

const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: r2Credentials,
});

// Configure web-push
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const estimateDuration = (text) => {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, words * 0.5);
};

const calculateStartTime = (segments, index) => {
  let startTime = 0;
  for (let i = 0; i < index; i++) {
    startTime += estimateDuration(segments[i]) || 0;
  }
  return startTime;
};

const generateLessonContent = async (input, isFile = false) => {
  try {
    let promptText;
    if (!isFile) {
      promptText = `Tạo nội dung giáo án học thuật từ text: "${input}". Trả về một JSON object với cấu trúc: [{"title": "Tiêu đề đoạn", "text": "Nội dung đoạn gồm nhiều câu đầy đủ, khoảng 100-150 từ"}]. Tổng số đoạn khoảng 4-6. Đảm bảo phản hồi là JSON hợp lệ, không chứa văn bản mô tả ngoài JSON.`;
    } else {
      if (!input || typeof input !== 'string') {
        throw new Error('Invalid file path provided');
      }
      const { value: rawText } = await mammoth.extractRawText({ path: input });
      const headings = rawText
        .split('\n')
        .filter(line => line.match(/^\d+\.\s+.+/))
        .map(line => line.replace(/^\d+\.\s+/, '').trim());

      if (headings.length === 0) {
        throw new Error('No valid headings found in the .docx file');
      }

      promptText = `Tạo nội dung giáo án học thuật từ các tiêu đề sau: "${headings.join('", "')}". Trả về một JSON object với cấu trúc: [{"title": "Tiêu đề đoạn", "text": "Nội dung đoạn gồm nhiều câu đầy đủ, khoảng 100-150 từ"}]. Tổng số đoạn bằng số tiêu đề cung cấp. Đảm bảo phản hồi là JSON hợp lệ, không chứa văn bản mô tả ngoài JSON.`;
    }

    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        model: 'gemini-2.0-flash',
        messages: [{ role: 'user', content: promptText }],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const content = response.data.choices[0].message.content;
    console.log('Raw API response:', content);

    let jsonString = content.replace(/```json\n|\n```/g, '').trim();
    if (!jsonString.startsWith('{') && !jsonString.startsWith('[')) {
      throw new Error('Invalid JSON response: Response does not start with JSON structure');
    }
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error from AI API or file processing:', error.response?.data || error.message);
    throw new Error('Failed to generate lesson content: ' + error.message);
  }
};

const generateSlideImage = (title, text) => {
  const width = 1000;
  const height = 400;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const wrapText = (ctx, text, x, y, maxWidth, lineHeight) => {
    const words = text.split(' ');
    let line = '';
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
    return y + lineHeight;
  };

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 30px Arial';
  const yAfterTitle = wrapText(ctx, title, 50, 50, width - 100, 36);

  ctx.font = '20px Arial';
  wrapText(ctx, text, 50, yAfterTitle + 20, width - 100, 28);

  return canvas.toDataURL('image/png');
};

// Send push notification to all subscribed users
const sendPushNotification = async (title, message) => {
  try {
    const subscriptions = await PushSubscription.find();
    const payload = JSON.stringify({
      title,
      body: message,
      icon: 'https://your-domain.com/icon.png', // Replace with your icon URL
      data: { url: 'http://localhost:5173/lecturerPage' }, // URL to open on click
    });

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.keys.p256dh,
              auth: subscription.keys.auth,
            },
          },
          payload
        );
        console.log(`Push notification sent to endpoint: ${subscription.endpoint}`);
      } catch (error) {
        console.error(`Failed to send push notification to ${subscription.endpoint}:`, error);
        // Remove invalid subscriptions
        if (error.statusCode === 410 || error.statusCode === 404) {
          await PushSubscription.deleteOne({ endpoint: subscription.endpoint });
          console.log(`Removed invalid subscription: ${subscription.endpoint}`);
        }
      }
    }
  } catch (error) {
    console.error('Error sending push notifications:', error);
  }
};

exports.createLessonWithText = async (req, res) => {
  try {
    console.log('Received request:', { file: !!req.file, body: req.body });
    const { title: inputTitle, text_content: inputText, language } = req.body;
    const file = req.file;
    const createdBy = req.user?.id;

    if (!createdBy) return res.status(401).json({ error: 'User not authenticated' });
    if (!inputTitle || (!inputText && !file)) return res.status(400).json({ error: 'Title and either text_content or file are required' });

    const createdByObjectId = new mongoose.Types.ObjectId(createdBy);
    let lessonContent;

    if (file) {
      const tempFilePath = path.join(__dirname, 'temp', `${Date.now()}-${file.originalname}`);
      await fs.mkdir(path.dirname(tempFilePath), { recursive: true });
      await fs.writeFile(tempFilePath, file.buffer);
      console.log(`Saved temp file: ${tempFilePath}`);
      lessonContent = await generateLessonContent(tempFilePath, true);
      await fs.unlink(tempFilePath).catch((err) => console.error(`Failed to delete temp file ${tempFilePath}:`, err));
    } else {
      lessonContent = await generateLessonContent(inputText);
    }

    const fullTextContent = lessonContent.map(item => `${item.title}\n${item.text}`).join('\n');

    const lesson = new Lesson({
      title: inputTitle,
      text_content: fullTextContent,
      createdBy: createdByObjectId,
      language: language || 'en',
      status: { status: 'uploaded' },
    });
    await lesson.save();
    console.log('Lesson saved:', lesson._id);

    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const segments = [];
    const audioFiles = [];
    const slideDocs = [];
    const tempFiles = [];

    const token = await getAccessToken();

    for (const [index, item] of lessonContent.entries()) {
      const segment = new Segment({
        lesson_id: lesson._id,
        segment_order: index + 1,
        text: item.text,
        start_time: 0,
        duration: 0,
      });
      await segment.save();
      segments.push(segment);
      console.log(`Segment ${index + 1} saved:`, segment._id);

      const audioResponse = await axios.post(
        'https://texttospeech.googleapis.com/v1/text:synthesize',
        {
          input: { text: item.text },
          voice: { languageCode: 'vi-VN', name: 'vi-VN-Standard-A' },
          audioConfig: { audioEncoding: 'MP3' },
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const audioContent = audioResponse.data.audioContent;
      const audioPath = path.join(tempDir, `audio_${segment._id}.mp3`);
      await fs.writeFile(audioPath, Buffer.from(audioContent, 'base64'));
      audioFiles.push(audioPath);
      tempFiles.push(audioPath);
      console.log(`Audio file saved: ${audioPath}`);

      const duration = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration);
        });
      });

      segment.duration = duration;
      segment.start_time = index === 0 ? 0 : segments[index - 1].start_time + segments[index - 1].duration;
      await segment.save();
      console.log(`Segment ${index + 1} updated with duration: ${duration}`);

      const imageUrl = generateSlideImage(item.title, item.text);
      const base64Data = imageUrl.replace(/^data:image\/png;base64,/, '');
      const slidePath = path.join(tempDir, `slide_${index + 1}.png`);
      await fs.writeFile(slidePath, base64Data, 'base64');
      tempFiles.push(slidePath);
      console.log(`Slide image saved: ${slidePath}`);

      const slideFileName = `slides/slide_${lesson._id}_${index + 1}.png`;
      console.log('Uploading slide to R2:', {
        bucket: process.env.R2_BUCKET_NAME,
        key: slideFileName,
        url: `https://${process.env.R2_PUBLIC_DOMAIN}/${slideFileName}`,
      });

      try {
        await r2Client.send(new PutObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: slideFileName,
          Body: Buffer.from(base64Data, 'base64'),
          ContentType: 'image/png',
        }));
        console.log(`Successfully uploaded slide: ${slideFileName}`);
      } catch (error) {
        console.error(`Failed to upload slide ${slideFileName}:`, error);
        throw new Error(`Failed to upload slide ${slideFileName}: ${error.message}`);
      }

      let slideUrl = `https://${process.env.R2_PUBLIC_DOMAIN}/${slideFileName}`;
      try {
        await axios.head(slideUrl);
        console.log(`Slide URL is accessible: ${slideUrl}`);
      } catch (error) {
        console.warn(`Slide URL is not accessible: ${slideUrl}`, error.message);
        slideUrl = await getSignedUrl(r2Client, new GetObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: slideFileName,
        }), { expiresIn: 3600 });
        console.log(`Using pre-signed URL for slide: ${slideUrl}`);
      }

      const slide = new Slide({
        segment_id: segment._id,
        image_url: slideUrl,
        display_time: duration,
        order_index: index + 1,
        status: 'completed',
      });
      await slide.save();
      slideDocs.push({
        ...slide.toObject(),
        image_url: slideUrl,
      });
      console.log(`Slide ${index + 1} saved:`, slide._id);
    }

    for (let i = 0; i < slideDocs.length; i++) {
      const slidePath = path.join(tempDir, `slide_${i + 1}.png`);
      const slideVideoPath = path.join(tempDir, `slide_${i + 1}.mp4`);
      tempFiles.push(slideVideoPath);

      await new Promise((resolve, reject) => {
        ffmpeg(slidePath)
          .loop(slideDocs[i].display_time)
          .outputOptions([
            '-vf', 'scale=800:600',
            '-c:v', 'libx264',
            '-t', `${slideDocs[i].display_time}`,
            '-pix_fmt', 'yuv420p',
            '-y'
          ])
          .output(slideVideoPath)
          .on('end', () => {
            console.log(`Slide video generated: ${slideVideoPath}`);
            resolve();
          })
          .on('error', (err) => {
            console.error(`Error generating slide video ${slideVideoPath}:`, err);
            reject(err);
          })
          .run();
      });
    }

    const slideVideos = slideDocs.map((_, i) => path.join(tempDir, `slide_${i + 1}.mp4`));
    const videoListPath = path.join(tempDir, 'video_list.txt');
    await fs.writeFile(videoListPath, slideVideos.map(v => `file '${v.replace(/\\/g, '\\\\')}'`).join('\n'));
    tempFiles.push(videoListPath);

    const finalSlideVideoPath = path.join(tempDir, 'final_slides.mp4');
    tempFiles.push(finalSlideVideoPath);
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy', '-y'])
        .output(finalSlideVideoPath)
        .on('end', () => {
          console.log(`Final slide video generated: ${finalSlideVideoPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`Error generating final slide video:`, err);
          reject(err);
        })
        .run();
    });

    const finalVideoPath = path.join(tempDir, 'output.mp4');
    tempFiles.push(finalVideoPath);
    const audioListPath = path.join(tempDir, 'audio_list.txt');
    let audioInput = audioFiles[0];

    if (audioFiles.length > 1) {
      await fs.writeFile(audioListPath, audioFiles.map(f => `file '${f.replace(/\\/g, '\\\\')}'`).join('\n'));
      audioInput = audioListPath;
      tempFiles.push(audioListPath);
    }

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(finalSlideVideoPath)
        .input(audioInput)
        .inputOptions(audioFiles.length > 1 ? ['-f', 'concat', '-safe', '0'] : [])
        .outputOptions([
          '-c:v', 'libx264',
          '-crf', '28',
          '-c:a', 'aac',
          '-pix_fmt', 'yuv420p',
          '-shortest',
          '-y'
        ])
        .output(finalVideoPath)
        .on('end', () => {
          console.log(`Final video generated: ${finalVideoPath}`);
          resolve();
        })
        .on('error', (err) => {
          console.error(`Error generating final video:`, err);
          reject(err);
        })
        .run();
    });

    const videoFileName = `videos/${lesson._id}_output.mp4`;
    console.log('Uploading video to R2:', {
      bucket: process.env.R2_BUCKET_NAME,
      key: videoFileName,
      url: `https://${process.env.R2_PUBLIC_DOMAIN}/${videoFileName}`,
    });

    try {
      await r2Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: videoFileName,
        Body: await fs.readFile(finalVideoPath),
        ContentType: 'video/mp4',
      }));
      console.log(`Successfully uploaded video: ${videoFileName}`);
    } catch (error) {
      console.error(`Failed to upload video ${videoFileName}:`, error);
      throw new Error(`Failed to upload video ${videoFileName}: ${error.message}`);
    }

    let videoUrl = `https://${process.env.R2_PUBLIC_DOMAIN}/${videoFileName}`;
    try {
      await axios.head(videoUrl);
      console.log(`Video URL is accessible: ${videoUrl}`);
    } catch (error) {
      console.warn(`Video URL is not accessible: ${videoUrl}`, error.message);
      videoUrl = await getSignedUrl(r2Client, new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: videoFileName,
      }), { expiresIn: 3600 });
      console.log(`Using pre-signed URL for video: ${videoUrl}`);
    }

    const video = new Video({
      lesson_id: lesson._id,
      name: `${inputTitle}_video`,
      video_url: videoUrl,
      format: 'mp4',
      duration: slideDocs.reduce((sum, slide) => sum + slide.display_time, 0),
      resolution: '800x600',
      status: 'completed',
    });
    await video.save();
    console.log(`Video saved: ${video._id}`);

    // Send push notification to all subscribed users
    await sendPushNotification(
      'New Lesson Available',
      `A new lesson titled "${inputTitle}" has been created! Check it out now.`
    );

    await Promise.all(tempFiles.map(file => fs.unlink(file).catch((err) => console.error(`Failed to delete temp file ${file}:`, err))));

    res.status(201).json({
      message: 'Lesson and video created successfully',
      lesson,
      segments,
      slides: slideDocs,
      video: videoUrl,
    });
  } catch (error) {
    console.error('Error in createLessonWithText:', error);
    res.status(500).json({ error: error.message });
  }
};

// New endpoint to save push subscriptions
exports.savePushSubscription = async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    const user_id = req.user?.id;

    if (!user_id) return res.status(401).json({ error: 'User not authenticated' });
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'Invalid subscription data' });
    }

    const subscription = new PushSubscription({
      user_id: new mongoose.Types.ObjectId(user_id),
      endpoint,
      keys,
    });

    await subscription.save();
    console.log(`Push subscription saved for user ${user_id}: ${endpoint}`);
    res.status(201).json({ message: 'Subscription saved successfully' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
};
exports.sendCustomNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    await sendPushNotification(title, message);
    res.status(200).json({ message: 'Notification sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send notification' });
  }
};