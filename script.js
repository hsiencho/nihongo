// --- 核心變數 ---
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
    document.getElementById('font-scale-slider').value = savedScale;
    document.getElementById('target-count-input').value = savedTarget;
    passTarget = parseInt(savedTarget);
}
loadSettings();

const fontSlider = document.getElementById('font-scale-slider');
fontSlider.addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--font-scale', e.target.value);
    localStorage.setItem('fontScale', e.target.value);
});

document.getElementById('btn-settings').onclick = () => document.getElementById('settings-panel').style.display = 'flex';
document.getElementById('save-settings-btn').onclick = () => {
    let target = document.getElementById('target-count-input').value;
    localStorage.setItem('passTarget', target);
    passTarget = parseInt(target);
    document.getElementById('settings-panel').style.display = 'none';
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
        window.speechSynthesis.cancel();
    };
});

function initSession(type) {
    const themeKey = document.getElementById('theme-select').value;
    const themeData = window.appData && window.appData[themeKey] ? window.appData[themeKey].items : [];
    const selectedLevels = Array.from(document.querySelectorAll('#level-checkboxes input:checked')).map(cb => cb.value);

    if (selectedLevels.length === 0) return alert("請至少選擇一個難度！");

    currentPool = themeData.filter(item => selectedLevels.includes(item.level)).map(item => ({
        ...item,
        progress: { voice: 0, audioMatch: 0, listen: 0 } 
    }));

    if (currentPool.length === 0) return alert("抱歉，該難度下目前沒有題目資料喔！");

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

// --- 詞性顏色與重音生成器 ---

// 根據詞性回傳顏色
function getPosColor(pos) {
    if (!pos) return '#636e72';
    if (pos.includes('動詞')) return '#ff7675'; // 紅色
    if (pos.includes('名詞')) return '#74b9ff'; // 藍色
    if (pos.includes('形容詞')) return '#55efc4'; // 綠色
    if (pos.includes('副詞')) return '#ffeaa7'; // 黃色
    return '#a29bfe'; // 預設紫色
}

// 動態生成帶有重音線條的 HTML
function generatePitchHTML(kana, pitchStr) {
    if (!kana) return "";
    if (!pitchStr) return `<span class="mora">${kana}</span>`;

    let pitchNum = parseInt(pitchStr.replace(/[^0-9]/g, ''), 10);
    if (isNaN(pitchNum)) return `<span class="mora">${kana}</span>`;

    // 1. 切割音拍 (Mora) - 處理拗音和長音
    let moras = [];
    for (let i = 0; i < kana.length; i++) {
        let char = kana[i];
        if (/[ゃゅょぁぃぅぇぉャュョァィゥェォー]/.test(char) && moras.length > 0) {
            moras[moras.length - 1] += char;
        } else {
            moras.push(char);
        }
    }

    // 2. 判斷每一個音拍的高低並生成 HTML
    let html = '';
    for (let i = 0; i < moras.length; i++) {
        let isHigh = false;
        let isDrop = false;
        let m = i + 1; // 這是第幾個音拍 (1-based)

        if (pitchNum === 0) {
            // 平板型 (0): 第1拍低，第2拍起全高
            if (m > 1) isHigh = true;
        } else if (pitchNum === 1) {
            // 頭高型 (1): 第1拍高，之後全低，且第1拍後下降
            if (m === 1) { isHigh = true; isDrop = true; }
        } else {
            // 中高/尾高型: 第1拍低，第2拍到第N拍高，第N拍後下降
            if (m > 1 && m <= pitchNum) isHigh = true;
            if (m === pitchNum) isDrop = true;
        }

        let classes = ['mora'];
        if (isHigh) classes.push('pitch-high');
        if (isDrop) classes.push('pitch-drop');

        html += `<span class="${classes.join(' ')}">${moras[i]}</span>`;
    }
    
    return html;
}

// --- 單字卡系統 ---
let cardIndex = 0;
function initFlashcards() { cardIndex = 0; renderCard(); }

function renderCard() {
    const item = currentPool[cardIndex];
    document.getElementById('card-progress').innerText = `${cardIndex + 1} / ${currentPool.length}`;
    
    resetCardToFront();
    
    let frontText = item.type === 'grammar' ? item.q.replace("( ____ )", "___") : item.jp;
    document.getElementById('card-jp-front').innerText = frontText;
    document.getElementById('card-jp-back').innerText = item.jp;
    
    // 詞性標籤與顏色
    const posBadge = document.getElementById('card-pos-back');
    if (item.pos) {
        posBadge.innerText = item.pos;
        posBadge.style.backgroundColor = getPosColor(item.pos); 
        posBadge.style.display = 'inline-block';
    } else {
        posBadge.style.display = 'none';
    }

    // 隱藏舊版重音標籤，並將讀音換成辭典風 HTML
    document.getElementById('card-pitch').style.display = 'none';
    document.getElementById('card-kana').innerHTML = generatePitchHTML(item.kana, item.pitch);

    document.getElementById('card-romaji').innerText = item.romaji;
    document.getElementById('card-zh').innerText = item.zh;

    const noteEl = document.getElementById('card-note');
    if (item.note || item.explain) {
        noteEl.innerText = item.note ? `💡 補充：${item.note}` : `💡 解析：${item.explain}`;
        noteEl.style.display = 'block';
    } else {
        noteEl.style.display = 'none';
    }

    const exBox = document.getElementById('card-example-box');
    if (item.example) {
        exBox.style.display = 'flex';
        document.getElementById('card-ex-jp').innerText = item.example.jp;
        document.getElementById('card-ex-kana').innerText = item.example.kana;
        document.getElementById('card-ex-romaji').innerText = item.example.romaji;
        document.getElementById('card-ex-zh').innerText = item.example.zh;
    } else {
        exBox.style.display = 'none';
    }

    document.getElementById('prev-card').disabled = cardIndex === 0;
    document.getElementById('next-card').disabled = cardIndex === currentPool.length - 1;
}

function flipCard() {
    const front = document.getElementById('card-front');
    const back = document.getElementById('card-back');
    const flipBackBtn = document.getElementById('flip-back-btn');
    const cardContent = document.querySelector('#flashcard .card-content');
    
    if (front.style.display !== 'none') {
        front.style.display = 'none';
        back.style.display = 'flex';
        flipBackBtn.style.display = 'block'; 
        if(cardContent) {
            cardContent.scrollTop = 0; 
            cardContent.style.cursor = 'default';
        }
        playAudioCard('word'); 
    }
}

function resetCardToFront() {
    const front = document.getElementById('card-front');
    const back = document.getElementById('card-back');
    const flipBackBtn = document.getElementById('flip-back-btn');
    const cardContent = document.querySelector('#flashcard .card-content');
    
    front.style.display = 'flex';
    back.style.display = 'none';
    flipBackBtn.style.display = 'none'; 
    if(cardContent) {
        cardContent.scrollTop = 0;
        cardContent.style.cursor = 'pointer';
    }
    window.speechSynthesis.cancel(); 
}

document.getElementById('next-card').onclick = (e) => {
    e.stopPropagation();
    if (cardIndex < currentPool.length - 1) { cardIndex++; renderCard(); }
};
document.getElementById('prev-card').onclick = (e) => {
    e.stopPropagation();
    if (cardIndex > 0) { cardIndex--; renderCard(); }
};

function playAudioCard(type, event) {
    if (event) event.stopPropagation(); 
    const item = (activeItem && document.getElementById('game-container').style.display === 'flex') 
                 ? activeItem : currentPool[cardIndex];
                 
    // 改成唸 item.jp (讓語音引擎看漢字發音)
    if ((type === 'word' || type === 'test-word') && item.jp) {
        playTTS(item.jp); 
    } else if ((type === 'example' || type === 'test-example') && item.example && item.example.jp) {
        playTTS(item.example.jp); // 例句也改成唸包含漢字的 jp
    }
}

function playTTS(text) {
    window.speechSynthesis.cancel();
    let msg = new SpeechSynthesisUtterance(text);
    msg.lang = 'ja-JP';
    msg.rate = 0.9; 
    window.speechSynthesis.speak(msg);
}

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
            document.getElementById('mic-status').innerText = "瀏覽器不支援麥克風，此題自動送分。";
            setTimeout(() => processResult(true, null), 1500);
            return;
        }

        micBtn.style.display = 'inline-block';
        micBtn.onclick = () => {
            micBtn.innerText = "聽取中...";
            try { recognition.start(); } catch(e) {} 
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

        options.forEach((opt) => {
            let row = document.createElement('div');
            row.className = 'audio-option-row';
            
            let playBtn = document.createElement('button');
            playBtn.className = 'play-audio-btn';
            playBtn.innerHTML = "🔊";
            playBtn.onclick = () => playTTS(opt.item.jp);

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
        wordDisplay.innerText = "";
        audioBtn.style.display = 'block';
        
        audioBtn.onclick = () => playTTS(activeItem.jp);
        playTTS(activeItem.jp);

        let options = [{ item: activeItem, isCorrect: true }];
        let others = currentPool.filter(w => w !== activeItem).sort(() => 0.5 - Math.random()).slice(0, 3);
        others.forEach(o => options.push({ item: o, isCorrect: false }));
        options.sort(() => 0.5 - Math.random());

        options.forEach(opt => {
            let btn = document.createElement('button');
            btn.className = 'select-ans-btn';
            btn.style.width = '100%';
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
    
    // 隱藏舊版重音標籤，並套用辭典風 HTML 於讀音區塊
    document.getElementById('ex-pitch').style.display = 'none';
    document.getElementById('ex-kana').innerHTML = generatePitchHTML(activeItem.kana, activeItem.pitch);
    
    document.getElementById('ex-zh').innerText = activeItem.zh;

    const noteEl = document.getElementById('ex-note');
    if (activeItem.note || activeItem.explain) {
        noteEl.innerText = activeItem.note ? `💡 補充：${activeItem.note}` : `💡 解析：${activeItem.explain}`;
        noteEl.style.display = "block";
    } else {
        noteEl.style.display = "none";
    }

    const testExBox = document.getElementById('test-example-box');
    if (activeItem.example) {
        testExBox.style.display = 'flex';
        document.getElementById('test-ex-jp').innerText = activeItem.example.jp;
        document.getElementById('test-ex-kana').innerText = activeItem.example.kana;
        document.getElementById('test-ex-romaji').innerText = activeItem.example.romaji;
        document.getElementById('test-ex-zh').innerText = activeItem.example.zh;
    } else {
        testExBox.style.display = 'none';
    }

    // 解析區的詞性與顏色標籤
    const exPos = document.getElementById('ex-pos');
    if (activeItem.pos) {
        exPos.innerText = activeItem.pos;
        exPos.style.backgroundColor = getPosColor(activeItem.pos);
        exPos.style.display = 'inline-block';
    } else {
        exPos.style.display = 'none';
    }

    playTTS(activeItem.jp);

    document.getElementById('next-btn').onclick = () => nextTestQuestion();
}

document.addEventListener('keydown', function(event) {
    if (document.getElementById('flashcard-container').style.display === 'flex') {
        if (event.key === 'ArrowRight' && !document.getElementById('next-card').disabled) {
            document.getElementById('next-card').click();
        } else if (event.key === 'ArrowLeft' && !document.getElementById('prev-card').disabled) {
            document.getElementById('prev-card').click();
        } else if (event.key === ' ' || event.key === 'Enter') {
            flipCard();
            event.preventDefault(); 
        }
    }
});

function initThemeSelect() {
    const themeSelect = document.getElementById('theme-select');
    if (!window.appData) return;

    // 清空舊選項
    themeSelect.innerHTML = '';

    // 自動抓取 window.appData 裡面的所有 Key
    Object.keys(window.appData).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        // 優先顯示資料內定義的 title，若無則顯示 key
        option.innerText = window.appData[key].title || key;
        themeSelect.appendChild(option);
    });
}

// --- 2. 在頁面載入時執行 ---
window.onload = () => {
    loadSettings();
    initThemeSelect(); // 執行動態加載
};
