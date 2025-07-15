const { GoogleAuth } = require('google-auth-library');

const getAccessToken = async () => {
  const auth = new GoogleAuth({
    keyFile: './credentials/text-to-speech-lecturer-465713-6e095b24faac.json', // <-- Thay bằng đường dẫn thật
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
  });

  const client = await auth.getClient();
  const accessToken = await client.getAccessToken();
  return accessToken.token;
};

module.exports = getAccessToken;