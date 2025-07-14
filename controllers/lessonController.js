const Lesson = require('../models/Lesson');
const Segment = require('../models/Segment');
const Slide = require('../models/Slide');
const Video = require('../models/Video');
const getAccessToken = require('./googleTTSAuth.cjs'); // Assuming this is the path to your Google TTS auth module
const mongoose = require('mongoose');
const axios = require('axios');
const { createCanvas } = require('canvas');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath('C:/Users/Asus/Downloads/ffmpeg-7.1.1-essentials_build/ffmpeg-7.1.1-essentials_build/bin/ffmpeg.exe');
const fs = require('fs').promises;
const path = require('path');

const splitTextIntoSegments = (text) => {
  return text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0).map((sentence) => sentence.trim());
};

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

const generateLessonContent = async (inputText) => {
  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        model: 'gemini-2.0-flash',
        messages: [{
          role: 'user',
          content: `Tạo nội dung giáo án học thuật từ text: "${inputText}". Trả về JSON với cấu trúc: [{"title": "Tiêu đề đoạn", "text": "Nội dung đoạn gồm nhiều câu đầy đủ, khoảng 100-150 từ"}]. Tổng số đoạn khoảng 4-6.`
        }],
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
    const jsonString = content.replace(/```json\n|\n```/g, '').trim();
    return JSON.parse(jsonString);
  } catch (error) {
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



exports.createLessonWithText = async (req, res) => {
  try {
    const { title: inputTitle, text_content: inputText, language } = req.body;
    const createdBy = req.user?.id;

    if (!createdBy) return res.status(401).json({ error: 'User not authenticated' });
    if (!inputTitle || !inputText) return res.status(400).json({ error: 'Title and text_content are required' });

    const createdByObjectId = new mongoose.Types.ObjectId(createdBy);
    const lessonContent = await generateLessonContent(inputText); 
    const fullTextContent = lessonContent.map(item => `${item.title}\n${item.text}`).join('\n');

    const lesson = new Lesson({
      title: inputTitle,
      text_content: fullTextContent,
      createdBy: createdByObjectId,
      language: language || 'en',
      status: { status: 'uploaded' },
    });
    await lesson.save();

    const tempDir = path.join(__dirname, 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const segments = [];
    const audioFiles = [];
    const slideDocs = [];

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

      const duration = await new Promise((resolve, reject) => {
        ffmpeg.ffprobe(audioPath, (err, metadata) => {
          if (err) reject(err);
          else resolve(metadata.format.duration);
        });
      });

      segment.duration = duration;
      segment.start_time = index === 0 ? 0 : segments[index - 1].start_time + segments[index - 1].duration;
      await segment.save();

      const imageUrl = generateSlideImage(item.title, item.text);
      const base64Data = imageUrl.replace(/^data:image\/png;base64,/, '');
      const slidePath = path.join(tempDir, `slide_${index + 1}.png`);
      await fs.writeFile(slidePath, base64Data, 'base64');

      // Đọc lại file ảnh đã lưu để encode base64
const imageBuffer = await fs.readFile(slidePath);
const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

const slide = new Slide({
  segment_id: segment._id,
  image_url: slidePath, // vẫn lưu trong DB để tham chiếu nội bộ nếu cần
  display_time: duration,
  order_index: index + 1,
  status: 'completed',
});
await slide.save();

// Trả lại slide base64 cho frontend
slideDocs.push({
  ...slide.toObject(),
  image_url: base64Image,
});

    }

    // Tạo video từ từng slide
    for (let i = 0; i < slideDocs.length; i++) {
      const slidePath = path.join(tempDir, `slide_${i + 1}.png`);
      const slideVideoPath = path.join(tempDir, `slide_${i + 1}.mp4`);

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
          .on('end', resolve)
          .on('error', reject)
          .run();
      });
    }

    // Nối các slide video
    const slideVideos = slideDocs.map((_, i) => path.join(tempDir, `slide_${i + 1}.mp4`));
    const videoListPath = path.join(tempDir, 'video_list.txt');
    await fs.writeFile(videoListPath, slideVideos.map(v => `file '${v.replace(/\\/g, '\\\\')}'`).join('\n'));

    const finalSlideVideoPath = path.join(tempDir, 'final_slides.mp4');
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(videoListPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions(['-c', 'copy', '-y'])
        .output(finalSlideVideoPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Ghép audio
    const finalVideoPath = path.join(tempDir, 'output.mp4');
    const audioListPath = path.join(tempDir, 'audio_list.txt');
    let audioInput = audioFiles[0];

    if (audioFiles.length > 1) {
      await fs.writeFile(audioListPath, audioFiles.map(f => `file '${f.replace(/\\/g, '\\\\')}'`).join('\n'));
      audioInput = audioListPath;
    }

    const finalCommand = ffmpeg()
      .input(finalSlideVideoPath)
      .input(audioInput)
      .inputOptions(audioFiles.length > 1 ? ['-f', 'concat', '-safe', '0'] : [])
      .outputOptions([
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-pix_fmt', 'yuv420p',
        '-shortest',
        '-y'
      ])
      .output(finalVideoPath)
      .on('end', async () => {
        const publicVideoName = `${lesson._id}_output.mp4`;
const publicVideoPath = path.join(__dirname, '../controllers/temp', publicVideoName);
await fs.copyFile(finalVideoPath, publicVideoPath);
        const video = new Video({
          lesson_id: lesson._id,
          name: `${inputTitle}_video`,
          video_url: `http://localhost:8080/videos/${publicVideoName}`,
          format: 'mp4',
          duration: slideDocs.reduce((sum, slide) => sum + slide.display_time, 0),
          resolution: '800x600',
          status: 'completed',
        });
        await video.save();

        res.status(201).json({
          message: 'Lesson and video created successfully',
          lesson,
          segments,
          slides: slideDocs,
          video: finalVideoPath
        });
      })
      .on('error', (err) => {
        console.error('FFmpeg final error:', err.message);
        throw new Error('Final video creation failed: ' + err.message);
      })
      .run();

  } catch (error) {
    console.error('Error in createLessonWithText:', error);
    res.status(500).json({ error: error.message });
  }
};
