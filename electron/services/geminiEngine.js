const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Deliberately narrow surface: this module only ever builds a prompt out
 * of notes the user has explicitly tagged and selected. It never touches
 * calendar data, grades, or auto-generates content without an explicit
 * button press - keeping the app "high utility, low automation".
 */

function buildContext(notes) {
  return notes
    .map((n, i) => `--- Note ${i + 1}: ${n.title} ---\n${n.body_markdown}`)
    .join('\n\n');
}

async function generateStudyGuide(apiKey, notes, { model = 'gemini-1.5-flash' } = {}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gen = genAI.getGenerativeModel({ model });

  const prompt = `You are a study aid. Using ONLY the notes below (do not invent facts
outside them), produce a concise, well-organized study guide with headings,
bullet key points, and a short "likely to be tested" callout section.

${buildContext(notes)}`;

  const result = await gen.generateContent(prompt);
  return result.response.text();
}

async function generatePracticeExam(apiKey, notes, { model = 'gemini-1.5-flash', questionCount = 10 } = {}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gen = genAI.getGenerativeModel({ model });

  const prompt = `You are creating a practice exam using ONLY the notes below.
Write ${questionCount} questions (mix of multiple choice and short answer),
followed by an answer key at the end. Do not use outside knowledge.

${buildContext(notes)}`;

  const result = await gen.generateContent(prompt);
  return result.response.text();
}

/** Minimal, cheap call used only to confirm a saved key actually works. */
async function testApiKey(apiKey, { model = 'gemini-1.5-flash' } = {}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gen = genAI.getGenerativeModel({ model });
  await gen.generateContent('Reply with the single word: ok');
  return true;
}

/**
 * Copilot-style ghost-text completion. Kept deliberately tiny: short max
 * output so it stays fast enough to feel inline, and a tight instruction so
 * Gemini continues the sentence rather than restarting or explaining it.
 */
async function generateAutocomplete(apiKey, context, { model = 'gemini-1.5-flash' } = {}) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const gen = genAI.getGenerativeModel({
    model,
    generationConfig: { maxOutputTokens: 24, temperature: 0.4 }
  });

  const prompt = `Continue this student's note with a short, natural continuation (max ~12 words).
Output ONLY the continuation text - no quotes, no markdown, no repeating the input, no explanation.
If the text already ends on a complete thought, output nothing.

Text so far:
"""
${context}
"""
Continuation:`;

  const result = await gen.generateContent(prompt);
  const text = result.response.text().trim();
  // Guard against the model ever echoing the wrapper quotes/instructions back.
  return text.replace(/^"+|"+$/g, '').split('\n')[0].slice(0, 200);
}

module.exports = { generateStudyGuide, generatePracticeExam, testApiKey, generateAutocomplete };
