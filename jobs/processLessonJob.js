const Queue = require('bull');
const Lesson = require('../models/Lesson');
const Segment = require('../models/Segment');
const Audio = require('../models/Audio');
const Slide = require('../models/Slide');
const Video = require('../models/Video');
const InputFile = require('../models/InputFile');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const textToSpeech = require('@google-cloud/text-to-speech');
const AWS = require('aws-sdk');
const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const ttsClient = new textToSpeech.TextToSpeechClient();

const lessonQueue = new Queue('lesson-processing', process.env.REDIS_URL);

const splitTextIntoSegments = (text) => {
  const sentences = text.split(/[.!?]/).filter(s => s.trim());
  return sentences.map((sentence, index) => ({
    text: sentence.trim(),
    order: index,
  }));
};

const createAudio = async (segment, lessonId, voiceId) => {
  const response = await ttsClient.synthesizeSpeech({
    input: { text: segment.text },
    voice: { languageCode: 'vi-VN', name: 'vi-VN-Wavenet-A' },
    audioConfig: { audioEncoding: 'MP3' },
  });

  const audioKey = `audios/${uuidv4()}.mp3`;
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: audioKey,
    Body: response[0].audioContent,
  };
  const uploadResult = await s3.upload(params).promise();

  const audio = new Audio({
    segment_id: segment._id,
    audio_url: uploadResult.Location,
    language: 'vi',
    voice_id: voiceId,
    duration: response[0].audioContent.length / 1000, // Giả định
    status: 'completed',
  });
  await audio.save();
  return audio;
};

const createSlide = async (segment, index) => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const htmlContent = `
    <html>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h1>${segment.text}</h1>
      </body>
    </html>
  `;
  await page.setContent(htmlContent);
  const imageKey = `slides/${uuidv4()}.png`;
  const imageBuffer = await page.screenshot();
  await browser.close();

  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: imageKey,
    Body: imageBuffer,
  };
  const uploadResult = await s3.upload(params).promise();

  const slide = new Slide({
    segment_id: segment._id,
    image_url: uploadResult.Location,
    display_time: segment.duration || 5, 
    order_index: index,
    status: 'completed',
  });
  await slide.save();
  return slide;
};

const createVideo = async (lessonId, slides, audios) => {
  const videoKey = `videos/${uuidv4()}.mp4`;
  const command = ffmpeg();

  slides.forEach((slide, index) => {
    command
      .input(slide.image_url)
      .input(audios[index].audio_url)
      .duration(slide.display_time);
  });

  command
    .outputOptions('-c:v libx264')
    .outputOptions('-c:a aac')
    .output(`./temp/${videoKey}`)
    .on('end', async () => {
      const videoBuffer = require('fs').readFileSync(`./temp/${videoKey}`);
      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: videoKey,
        Body: videoBuffer,
      };
      const uploadResult = await s3.upload(params).promise();

      const video = new Video({
        lesson_id: lessonId,
        video_url: uploadResult.Location,
        format: 'mp4',
        duration: slides.reduce((sum, slide) => sum + slide.display_time, 0),
        resolution: '1920x1080',
        status: 'completed',
      });
      await video.save();

      await Lesson.findByIdAndUpdate(lessonId, { status: 'completed' });
    })
    .on('error', async (err) => {
      await Lesson.findByIdAndUpdate(lessonId, { status: 'failed' });
      console.error('Error creating video:', err);
    })
    .run();
};

lessonQueue.process(async (job) => {
  const { lessonId, voiceId } = job.data;

  try {
    const lesson = await Lesson.findById(lessonId);
    if (!lesson) throw new Error('Không tìm thấy bài giảng');

    await Lesson.findByIdAndUpdate(lessonId, { status: 'processing' });

    let text = lesson.text_content;
    const inputFile = await InputFile.findOne({ lesson_id: lessonId });
    if (inputFile) {
      const fileBuffer = await s3.getObject({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: inputFile.file_url.split('/').pop(),
      }).promise();
      
      if (inputFile.file_format === 'docx') {
        const result = await mammoth.extractRawText({ buffer: fileBuffer.Body });
        text = result.value;
      } else if (inputFile.file_format === 'pdf') {
        const result = await pdfParse(fileBuffer.Body);
        text = result.text;
      }
    }
    const segmentsData = splitTextIntoSegments(text);
    const segments = [];
    for (let i = 0; i < segmentsData.length; i++) {
      const segment = new Segment({
        lesson_id: lessonId,
        order: i,
        text: segmentsData[i].text,
      });
      await segment.save();
      segments.push(segment);
    }

    const audios = [];
    const slides = [];
    for (let i = 0; i < segments.length; i++) {
      const audio = await createAudio(segments[i], lessonId, voiceId);
      audios.push(audio);
      const slide = await createSlide(segments[i], i);
      slides.push(slide);
    }

    await createVideo(lessonId, slides, audios);
  } catch (error) {
    await Lesson.findByIdAndUpdate(lessonId, { status: 'failed' });
    console.error('Error processing lesson:', error);
  }
});