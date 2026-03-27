const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
  if (!GEMINI_API_KEY) {
    console.error('No API key found in .env');
    return;
  }
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  try {
    const result = await genAI.listModels();
    console.log('Available Models:');
    result.models.forEach((m) => {
      console.log(`- ${m.name} (Methods: ${m.supportedGenerationMethods.join(', ')})`);
    });
  } catch (err) {
    console.error('Error listing models:', err);
  }
}

listModels();
