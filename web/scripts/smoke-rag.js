const fs = require('fs');
const path = require('path');

const { initializeApp, getApps } = require('firebase/app');
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require('firebase/functions');

async function main() {
  const firebaseConfigPath = path.join(__dirname, '..', 'src', 'app', 'firebaseConfig.ts');
  const ts = fs.readFileSync(firebaseConfigPath, 'utf8');

  const match = ts.match(/export const firebaseConfig\s*=\s*(\{[\s\S]*?\});/);
  if (!match) throw new Error('Could not parse firebaseConfig.ts');
  const firebaseConfig = eval('(' + match[1] + ')');

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, 'localhost', 5001);

  const ensureRagIndex = httpsCallable(functions, 'ensureRagIndex');
  const chatWithRag = httpsCallable(functions, 'chatWithRag');

  console.log('Calling ensureRagIndex...');
  const ensureRes = await ensureRagIndex({});
  console.log('ensureRagIndex result:', ensureRes.data);

  console.log('Calling chatWithRag...');
  const chatRes = await chatWithRag({
    message: 'What is this story about? Provide a short answer.',
    topK: 6,
  });

  console.log('chatWithRag result:', chatRes.data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

