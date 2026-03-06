Comprehensive Japanese Training System (日語全方位特訓系統)
A web-based, mobile-friendly interactive application designed to help learners master Japanese vocabulary and grammar. It features smart flashcards, voice recognition for speaking practice, and listening comprehension quizzes.

✨ Key Features
📚 Smart Flashcards (預習單字卡)

Interactive flip cards displaying Japanese (Kanji/Kana), Romaji, and Traditional Chinese translations.

Includes part-of-speech (POS) color-coded badges and built-in example sentences.

Text-to-Speech (TTS) integration for native-like pronunciation playback.

🎯 Interactive Quiz Modes (測驗特訓)

🎤 Voice Training (語音特訓): Utilizes the Web Speech API to listen to your pronunciation and evaluate your speaking accuracy in real-time.

🎧 Audio Matching (盲聽配對): Listen to the pronunciation and select the correct corresponding vocabulary.

👂 Listening Comprehension (純聽力測驗): Listen to the Japanese audio and identify the correct Chinese meaning.

📈 Visual Pitch Accent (重音標示)

Automatically generates dictionary-style pitch accent visual indicators (red lines showing high/low/drop pitch) for accurate pronunciation training.

⚙️ Customizable Experience

Adjustable font scaling for better readability.

Customizable "Pass Targets" (number of correct answers required to master a word).

Filter vocabulary pools by JLPT levels (N5 to N1) or specific themes.

🛠️ Tech Stack
Frontend: HTML5, CSS3, Vanilla JavaScript

APIs: Web Speech API (Speech Recognition & Speech Synthesis)

No Frameworks: Lightweight and runs directly in the browser without any build tools.

🚀 Getting Started
Since this project uses Vanilla JavaScript and no backend, running it is incredibly simple.

Clone the repository:

Bash
git clone https://github.com/your-username/your-repo-name.git
Run locally:
Simply open index.html in your preferred modern web browser.
(Note: For the microphone/speech recognition features to work perfectly, it is recommended to serve the files via a local server, e.g., using VS Code's "Live Server" extension, due to browser security policies regarding microphone access.)

📂 Project Structure
index.html: The main UI structure and layout.

style.css: Responsive design, UI component styling, and pitch accent visual rules.

script.js: Core application logic, quiz routing, Web Speech API integration, and dynamic HTML generation.

data/: Directory containing vocabulary datasets (e.g., n5_vocab_99.js containing JLPT N5 words with pitch and examples).

⚠️ Browser Compatibility
Speech Recognition: Fully supported on Google Chrome, Microsoft Edge, and Safari.

Speech Synthesis (TTS): Supported on all modern web browsers.

🤝 Contributing
Contributions, issues, and feature requests are welcome! Feel free to check the issues page if you want to contribute.

📄 License
This project is licensed under the MIT License.
