import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, 'functions', '.env') });

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
