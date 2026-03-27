---
title: "Story RAG Chat: Project Overview"
---

# 1. What We Will Build
- **Application:** A "Story RAG Chat" web application.
- **Core Technologies:** Angular (Frontend), Firebase (Backend, Database, & Hosting), and Google Gemini (AI Models).
- **Functionality:** An interactive chatbot where users can ask questions about a provided PDF story. The bot acts as an expert on the uploaded document, answering queries precisely based strictly on the text inside the PDF.

---

# 2. What is Angular?
- **Definition:** A robust, component-based web framework developed and maintained by Google.
- **Purpose:** Used to build modern, scalable single-page applications (SPAs).
- **Key Features:**
  - Uses **TypeScript** for strong typing and better developer tooling.
  - **Component Architecture:** Breaks the UI into reusable pieces (like our `ChatComponent` and `LandingComponent`).
  - **Dependency Injection:** Makes managing services (like our `RagService` that talks to Firebase) modular and testable.
- **Role in our App:** It powers the user interface—handling the chat layout, user input, and displaying AI responses seamlessly without refreshing the browser.

---

# 3. What is RAG? (Retrieval-Augmented Generation)
- **The Concept:** RAG is an AI framework that improves the quality of a Large Language Model (LLM) by fetching external, specific information and giving it to the model *before* it generates a response.
- **Why it's needed:** Standard LLMs (like Gemini or ChatGPT) have vast general knowledge, but they haven't read your private, custom PDF story. RAG bridges this gap.
- **How it Works (The Pipeline):**
  1. **Ingestion (Knowledge Base Creation):** The backend reads the PDF and splits the text into smaller pieces called "chunks." It passes each chunk to a Gemini Embedding Model, which converts the text into a mathematical array of numbers (a "vector embedding"). These embeddings are saved in a database (Firestore).
  2. **Retrieval (Search):** When a user asks a question, the question itself is turned into an embedding. The system mathematically compares the question's embedding against all the saved chunks to find the most relevant excerpts from the story (Cosine Similarity).
  3. **Generation (Answering):** The system grabs the top 6 most relevant excerpts and attaches them to the user's question. It tells the Gemini Chat Model: *"Answer the user's question using ONLY these story excerpts."*

---

# 4. Benefits of RAG Over a Plain API Call
If we just sent a plain message to the Gemini API (`"Tell me what happened to the hero in my story"`), the model wouldn't know the answer because it hasn't read your specific narrative. 

**Why RAG is better:**
- **Eliminates Hallucinations:** RAG grounds the AI in reality. Instead of guessing or making things up, the AI answers using your exact, provided source material.
- **Cost & Token Efficiency:** LLMs have "context windows" (limits on how much text they can read at once) and charge per token. Sending an entire 200-page book in every single chat API call is expensive and slow. RAG elegantly solves this by only sending the most relevant paragraphs.
- **Dynamic Knowledge:** You don't have to train or fine-tune an expensive custom AI model to teach it your story. With RAG, if the story changes, you simply update the PDF and re-chunk the database. The AI instantly becomes "smart" about the new text.
