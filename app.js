let currentPool = []; 
let activeItem = null;
let currentMode = ''; 
let passTarget = 2; // 動態過關次數
let totalTargetPoints = 0; 
let currentPoints = 0; 

// --- 設定與本地儲存 ---
function loadSettings() {
    let savedScale = localStorage.getItem('fontScale') || 1;
    let savedTarget = localStorage.getItem('passTarget') || 2;
    document.documentElement.style.setProperty('--font-scale', savedScale);
    document.getElementById('font-size-slider').value = savedScale;
    document.getElementById('target-count-input').value = savedTarget;
    passTarget = parseInt(savedTarget);
}
loadSettings();

document.getElementById('btn-settings').onclick = () => document.getElementById('settings-panel').style.display = 'flex';
document.getElementById('save-settings-btn').onclick = () => {
    let scale = document.getElementById('font-size-slider').value;
    let target = document.getElementById('target-count-input').value;
    localStorage.setItem('fontScale', scale);
    localStorage.setItem('passTarget', target);
    document.documentElement.style.setProperty('--font-scale', scale);
    passTarget = parseInt(target);
    document.getElementById('settings-panel').style.display = 'none';
    alert("設定已儲存！過關次數將在下次測驗生效。");
};

// 語音設定
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
}

// --- 首頁導航 ---
document.getElementById('start-btn').onclick = () => initSession('test');
document.getElementById('view-cards-btn').onclick = () => initSession('flashcard');
document.querySelectorAll('.go-home-btn').forEach(btn => {
    btn.onclick = () => {
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('flashcard-container').style.display = 'none';
        document.getElementById('home-menu').style.display = 'flex';
    };
});

function initSession(type) {
    const themeKey = document.getElementById('theme-select').value;
    const themeData = window.appData[themeKey].items || [];
    const selectedLevels = Array.from(document.querySelectorAll('#level-checkboxes input:checked')).map(cb => cb.value);

    if (selectedLevels.length === 0) return alert("請至少選擇一個難度！");

    currentPool = themeData.filter(item => selectedLevels.includes(item.level)).map(item => ({
        ...item,
        progress: { voice: 0, audioMatch: 0, listen: 0 } 
    }));

    if (currentPool.length === 0) return alert("該難度下沒有題目！");

    document.getElementById('home-menu').style.display = 'none';

    if (type === 'flashcard') {
        document.getElementById('flashcard-container').style.display = 'flex';
        initFlashcards();
    } else {
        document.getElementById('game-container').style.display = 'flex';
        totalTargetPoints = currentPool.length * 3 * passTarget; 
        currentPoints = 0;
        nextTestQuestion();
    }
}

// --- 單字卡系統 ---
let cardIndex = 0;
function initFlashcards() { cardIndex = 0; renderCard(); }
function renderCard() {
    const item = currentPool[cardIndex];
    document.getElementById('card-progress').innerText = `${cardIndex + 1} / ${currentPool.length}`;
    document.getElementById('card-front').style.display = 'flex';
    document.getElementById('card-back').style.display = 'none';
    
    let frontText = item.type === 'grammar' ? item.q.replace("( ____ )", "___") : item.jp;
    document.getElementById('card-jp-front').innerText = frontText;
    document.getElementById('card-pos-front').innerText = item.pos || "單字";

    // 背面資料
    document.getElementById('card-jp-back').innerText = item.jp;
    document.getElementById('card-pos-back').innerText = item.pos || "單字";
    document.getElementById('card-kana').innerText = item.kana;
    document.getElementById('card-romaji').innerText = item.romaji;
    document.getElementById('card-zh').innerText = item.zh;
    document.getElementById('card-note').innerText = item.note ? `💡 補充：${item.note}` : "";
    document.getElementById('card-note').style.display = item.note ? 'block' : 'none';

    document.getElementById('card-audio-btn').onclick = (e) => { e.stopPropagation(); speakJapanese(item.kana); };

    document.getElementById('card-zh').innerText = item.zh;

    // 處理例句顯示與播音
    const exBox = document.getElementById('card-example-box');
    if (item.example) {
        exBox.style.display = 'block';
        document.getElementById('card-ex-jp').innerText = item.example.jp;
        document.getElementById('card-ex-kana').innerText = item.example.kana;
        document.getElementById('card-ex-romaji').innerText = item.example.romaji;
        document.getElementById('card-ex-zh').innerText = item.example.zh;
        
        document.getElementById('card-ex-audio-btn').onclick = (e) => {
            e.stopPropagation(); // 防止點擊按鈕時卡片跟著翻轉
            speakJapanese(item.example.kana);
        };
    } else {
        exBox.style.display = 'none';
    }

    // 文法解析處理
    document.getElementById('card-note').innerText = item.explain ? `💡 解析：${item.explain}` : "";
    document.getElementById('card-note').style.display = item.explain ? 'block' : 'none';
}
function flipCard() {
    const front = document.getElementById('card-front');
    const back = document.getElementById('card-back');
    if (front.style.display === 'none') {
        front.style.display = 'flex'; back.style.display = 'none';
    } else {
        front.style.display = 'none'; back.style.display = 'flex';
        speakJapanese(currentPool[cardIndex].kana);
    }
}
document.getElementById('next-card').onclick = () => { if (cardIndex < currentPool.length - 1) { cardIndex++; renderCard(); } };
document.getElementById('prev-card').onclick = () => { if (cardIndex > 0) { cardIndex--; renderCard(); } };

// --- 測驗系統 ---
function nextTestQuestion() {
    let pendingItems = currentPool.filter(item => 
        item.progress.voice < passTarget || item.progress.audioMatch < passTarget || item.progress.listen < passTarget
    );

    document.getElementById('progress').innerText = `${totalTargetPoints - currentPoints}`;

    if (pendingItems.length === 0) {
        alert("🎉 恭喜！本次特訓目標已全數達成！");
        document.querySelector('.go-home-btn').click();
        return;
    }

    activeItem = pendingItems[Math.floor(Math.random() * pendingItems.length)];
    let availableModes = [];
    if (activeItem.progress.voice < passTarget) availableModes.push('voice');
    if (activeItem.progress.audioMatch < passTarget) availableModes.push('audioMatch');
    if (activeItem.progress.listen < passTarget) availableModes.push('listen');

    currentMode = availableModes[Math.floor(Math.random() * availableModes.length)];
    renderTestUI();
}

// 跳過功能：將當前題目的進度直接補滿
document.getElementById('skip-btn').onclick = () => {
    let remainingVoice = passTarget - activeItem.progress.voice;
    let remainingAudio = passTarget - activeItem.progress.audioMatch;
    let remainingListen = passTarget - activeItem.progress.listen;
    
    activeItem.progress.voice = passTarget;
    activeItem.progress.audioMatch = passTarget;
    activeItem.progress.listen = passTarget;
    
    currentPoints += (remainingVoice + remainingAudio + remainingListen);
    nextTestQuestion();
};

function renderTestUI() {
    document.getElementById('question-area').style.display = 'flex';
    document.getElementById('explanation-area').style.display = 'none';
    const wordDisplay = document.getElementById('enemy-word');
    const optionsArea = document.getElementById('options-area');
    const micBtn = document.getElementById('mic-btn');
    const audioBtn = document.getElementById('replay-audio');
    
    optionsArea.innerHTML = '';
    micBtn.style.display = 'none';
    audioBtn.style.display = 'none';
    document.getElementById('mic-status').innerText = '';

    let displayWord = activeItem.type === 'grammar' ? activeItem.q.replace("( ____ )", "___") : activeItem.jp;

    if (currentMode === 'voice') {
        document.getElementById('question-mode-label').innerText = "🎤 語音特訓 (請唸出完整日文)";
        wordDisplay.innerText = displayWord;
        
        if (!recognition) {
            document.getElementById('mic-status').innerText = "瀏覽器不支援，自動送分。";
            setTimeout(() => processResult(true, null), 1500);
            return;
        }

        micBtn.style.display = 'block';
        micBtn.onclick = () => {
            micBtn.innerText = "聽取中...";
            recognition.start();
        };

        recognition.onresult = (e) => {
            micBtn.innerText = "🎤 按住說話";
            let trans = e.results[0][0].transcript.trim();
            let isCorrect = trans.includes(activeItem.jp) || trans.includes(activeItem.kana) || trans.replace(/\s/g, '') === activeItem.kana;
            processResult(isCorrect, { type: 'text', value: trans });
        };

    } else if (currentMode === 'audioMatch') {
        document.getElementById('question-mode-label').innerText = "🎧 盲聽配對 (找出正確發音)";
        wordDisplay.innerText = displayWord;

        let options = [{ item: activeItem, isCorrect: true }];
        let others = currentPool.filter(w => w !== activeItem).sort(() => 0.5 - Math.random()).slice(0, 3);
        others.forEach(o => options.push({ item: o, isCorrect: false }));
        options.sort(() => 0.5 - Math.random());

        // 雙按鈕介面實作
        options.forEach((opt, index) => {
            let row = document.createElement('div');
            row.className = 'audio-option-row';
            
            let playBtn = document.createElement('button');
            playBtn.className = 'play-audio-btn';
            playBtn.innerHTML = "🔊";
            playBtn.onclick = () => speakJapanese(opt.item.kana);

            let selectBtn = document.createElement('button');
            selectBtn.className = 'select-ans-btn';
            selectBtn.innerText = "選擇此發音";
            selectBtn.onclick = () => processResult(opt.isCorrect, { type: 'item', value: opt.item });

            row.appendChild(playBtn);
            row.appendChild(selectBtn);
            optionsArea.appendChild(row);
        });

    } else if (currentMode === 'listen') {
        document.getElementById('question-mode-label').innerText = "👂 純聽力測驗 (選出中文意思)";
        wordDisplay.innerText = "🔊";
        audioBtn.style.display = 'inline-block';
        
        audioBtn.onclick = () => speakJapanese(activeItem.kana);
        speakJapanese(activeItem.kana); 

        let options = [{ item: activeItem, isCorrect: true }];
        let others = currentPool.filter(w => w !== activeItem).sort(() => 0.5 - Math.random()).slice(0, 3);
        others.forEach(o => options.push({ item: o, isCorrect: false }));
        options.sort(() => 0.5 - Math.random());

        options.forEach(opt => {
            let btn = document.createElement('button');
            btn.className = 'select-ans-btn';
            btn.innerText = opt.item.zh;
            btn.onclick = () => processResult(opt.isCorrect, { type: 'item', value: opt.item });
            optionsArea.appendChild(btn);
        });
    }
}

function processResult(isCorrect, userChoice) {
    document.getElementById('question-area').style.display = 'none';
    const expArea = document.getElementById('explanation-area');
    expArea.style.display = 'flex';

    if (isCorrect) {
        activeItem.progress[currentMode]++;
        currentPoints++;
        document.getElementById('result-title').innerText = "⭕ 完美命中！";
        document.getElementById('wrong-feedback-box').style.display = 'none';
    } else {
        document.getElementById('result-title').innerText = "❌ 答錯了！";
        document.getElementById('wrong-feedback-box').style.display = 'block';
        const wrongText = document.getElementById('user-wrong-ans');
        
        if (userChoice.type === 'text') {
            wrongText.innerText = `語音辨識為：「${userChoice.value}」`;
        } else if (userChoice.type === 'item') {
            wrongText.innerText = `${userChoice.value.jp} (${userChoice.value.kana}) - ${userChoice.value.zh}`;
        }
    }

    let fullJp = activeItem.type === 'grammar' ? activeItem.q.replace("( ____ )", activeItem.ans) : activeItem.jp;
    document.getElementById('ex-jp').innerText = fullJp;
    document.getElementById('ex-kana').innerText = activeItem.kana;
    document.getElementById('ex-zh').innerText = activeItem.zh;

    const noteEl = document.getElementById('ex-note');
    if (activeItem.note || activeItem.explain) {
        let noteText = activeItem.note || activeItem.explain;
        noteEl.innerText = `💡 補充：${noteText}`;
        noteEl.style.display = "block";
    } else {
        noteEl.style.display = "none";
    }

    document.getElementById('ex-audio-btn').onclick = () => speakJapanese(activeItem.kana);
    speakJapanese(activeItem.kana); 

    document.getElementById('next-btn').onclick = () => nextTestQuestion();

    // ... (保留原本的解析區賦值)
    document.getElementById('ex-zh').innerText = activeItem.zh;

    // 處理測驗解析區的例句
    const testExBox = document.getElementById('test-example-box');
    if (activeItem.example) {
        testExBox.style.display = 'block';
        document.getElementById('test-ex-jp').innerText = activeItem.example.jp;
        document.getElementById('test-ex-kana').innerText = activeItem.example.kana;
        document.getElementById('test-ex-romaji').innerText = activeItem.example.romaji;
        document.getElementById('test-ex-zh').innerText = activeItem.example.zh;
        
        document.getElementById('test-ex-audio-btn').onclick = () => speakJapanese(activeItem.example.kana);
    } else {
        testExBox.style.display = 'none';
    }

    // 文法解析處理
    noteEl = document.getElementById('ex-note');
    if (activeItem.explain) {
        noteEl.innerText = `💡 解析：${activeItem.explain}`;
        noteEl.style.display = "block";
    } else {
        noteEl.style.display = "none";
    }
}

function speakJapanese(text) {
    let msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'ja-JP';
    window.speechSynthesis.speak(msg);
}