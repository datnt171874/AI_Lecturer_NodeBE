const Lesson = require('../models/Lesson');
const Segment = require('../models/Segment');
const Slide = require('../models/Slide');
const mongoose = require('mongoose');
const axios = require('axios');
const { createCanvas } = require('canvas');

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
          content: `Tạo nội dung giáo án học thuật từ text: "${inputText}". Trả về dưới dạng JSON với cấu trúc: [{"title": "Tiêu đề đoạn 1", "text": "Nội dung đoạn 1 (không quá 2 câu)"}, {"title": "Tiêu đề đoạn 2", "text": "Nội dung đoạn 2 (không quá 2 câu)"}], đảm bảo nội dung giáo dục và ngắn gọn.`
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
  const width = 800;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 30px Arial';
  ctx.fillText(title, 50, 50);

  ctx.font = '20px Arial';
  const lines = text.split('\n');
  let y = 100;
  for (const line of lines) {
    ctx.fillText(line, 50, y);
    y += 30;
  }

  return canvas.toDataURL('image/png');
};

exports.createLessonWithText = async (req, res) => {
  try {
    const { title: inputTitle, text_content: inputText, language } = req.body;
    const createdBy = req.user?.id;

    if (!createdBy) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!inputTitle || !inputText) {
      return res.status(400).json({ error: 'Title and text_content are required' });
    }

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

    const segments = lessonContent.map((item, index) => ({
      lesson_id: lesson._id,
      segment_order: index + 1,
      text: item.text,
      start_time: calculateStartTime(lessonContent.map(c => c.text), index),
      duration: estimateDuration(item.text),
    }));
    const segmentDocs = await Segment.insertMany(segments);

    const slideDocs = [];
    for (const [index, content] of lessonContent.entries()) {
      const imageUrl = generateSlideImage(content.title, content.text);
      const slide = new Slide({
        segment_id: segmentDocs[index]._id,
        image_url: imageUrl,
        display_time: estimateDuration(content.text),
        order_index: index + 1,
        status: 'completed',
      });
      await slide.save();
      slideDocs.push(slide);
    }

    res.status(201).json({
      message: 'Lesson and slides created successfully',
      lesson,
      segments: segmentDocs,
      slides: slideDocs,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};