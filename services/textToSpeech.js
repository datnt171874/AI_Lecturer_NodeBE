const axios = require('axios');

exports.generateAudio = async (text, language) => {
  try {
    const response = await axios.post(
      'https://api.text-to-speech.com/v1/synthesize', 
      {
        text,
        language,
        voice: 'default-voice', 
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );
    return {
      url: response.data.audio_url,
      duration: response.data.duration,
    };
  } catch (error) {
    throw new Error('Failed to generate audio: ' + error.message);
  }
};