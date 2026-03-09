// --- 核心變數 ---
let currentPool = []; 
let activeItem = null;
let currentMode = ''; 
let passTarget = 2; // 動態過關次數
let totalTargetPoints = 0; 
let currentPoints = 0; 

// --- 新增：模式設定狀態 ---
let activeModesConfig = {
    voice: true,
    audioMatch: true,
    listen: true,
    zhToJp: false // 預設關閉
};

// 輔助函式：取得完整的日文（處理文法題沒有 jp 屬性的問題）
function getFullJp(item) {
    if (!item) return "";
    return item.type === 'grammar' ? item.q.replace("( ____ )", item.ans) : item.jp;
}

// --- 設定與本地儲存 ---
function loadSettings() {
    let savedScale = localStorage.getItem('fontScale') || 1;
    let savedTarget = localStorage.getItem('passTarget') || 2;
    document.documentElement.style.setProperty('--font-scale', savedScale);
    document.getElementById('font-scale-slider').value = savedScale;
    document.getElementById('target-count-input').value = savedTarget;
    passTarget = parseInt(savedTarget);

    // 讀取模式設定
    activeModesConfig.voice = localStorage.getItem('modeVoice') !== 'false';
    activeModesConfig.audioMatch = localStorage.getItem('modeAudioMatch') !== 'false';
    activeModesConfig.listen = localStorage.getItem('modeListen') !== 'false';
    activeModesConfig.zhToJp = localStorage.getItem('modeZhToJp') === 'true';

    // 更新 UI Checkbox
    const v = document.getElementById('setting-mode-voice');
    if(v) v.checked = activeModesConfig.voice;
    const a = document.getElementById('setting-mode-audioMatch');
    if(a) a.checked = activeModesConfig.audioMatch;
    const l = document.getElementById('setting-mode-listen');
    if(l) l.checked = activeModesConfig.listen;
    const z = document.getElementById('setting-mode-zhToJp');
    if(z) z.checked = activeModesConfig.zhToJp;
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

    // 儲存模式設定
    activeModesConfig.voice = document.getElementById('setting-mode-voice').checked;
    activeModesConfig.audioMatch = document.getElementById('setting-mode-audioMatch').checked;
    activeModesConfig.listen = document.getElementById('setting-mode-listen').checked;
    activeModesConfig.zhToJp = document.getElementById('setting-mode-zhToJp').checked;

    localStorage.setItem('modeVoice', activeModesConfig.voice);
    localStorage.setItem('modeAudioMatch', activeModesConfig.audioMatch);
    localStorage.setItem('modeListen', activeModesConfig.listen);
    localStorage.setItem('modeZhToJp', activeModesConfig.zhToJp);

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

    // 計算啟用了幾個模式
    let activeModesCount = Object.values(activeModesConfig).filter(v => v).length;
    if (type === 'test' && activeModesCount === 0) return alert("請至設定中至少開啟一種測驗模式！");

    currentPool = themeData.filter(item => selectedLevels.includes(item.level)).map(item => ({
        ...item,
        progress: { voice: 0, audioMatch: 0, listen: 0, zhToJp: 0 } 
    }));

    if (currentPool.length === 0) return alert("抱歉，該難度下目前沒有題目資料喔！");

    document.getElementById('home-menu').style.display = 'none';

    if (type === 'flashcard') {
        document.getElementById('flashcard-container').style.display = 'flex';
        initFlashcards();
    } else {
        document.getElementById('game-container').style.display = 'flex';
        // 目標總分 = 題目數 * 啟用的模式數量 * 過關次數
        totalTargetPoints = currentPool.length * activeModesCount * passTarget; 
        currentPoints = 0;
        nextTestQuestion();
    }
}

// --- 詞性顏色與重音生成器 ---
function getPosColor(pos) {
    if (!pos) return '#636e72';
    if (pos.includes('動詞')) return '#ff7675'; 
    if (pos.includes('名詞')) return '#74b9ff'; 
    if (pos.includes('形容詞')) return '#55efc4'; 
    if (pos.includes('副詞')) return '#ffeaa7'; 
    return '#a29bfe'; 
}

function generatePitchHTML(kana, pitchStr) {
    if (!kana) return "";
    if (!pitchStr) return `<span class="mora">${kana}</span>`;

    let pitchNum = parseInt(pitchStr.replace(/[^0-9]/g, ''), 10);
    if (isNaN(pitchNum)) return `<span class="mora">${kana}</span>`;

    let moras = [];
    for (let i = 0; i < kana.length; i++) {
        let char = kana[i];
        if (/[ゃゅょぁぃぅぇぉャュョァィゥェォー]/.test(char) && moras.length > 0) {
            moras[moras.length - 1] += char;
        } else {
            moras.push(char);
        }
    }

    let html = '';
    for (let i = 0; i < moras.length; i++) {
        let isHigh = false;
        let isDrop = false;
        let m = i + 1; 

        if (pitchNum === 0) {
            if (m > 1) isHigh = true;
        } else if (pitchNum === 1) {
            if (m === 1) { isHigh = true; isDrop = true; }
        } else {
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
    
    // 解決文法字太多跑版的問題
    let backJpText = getFullJp(item);
    let cardJpBack = document.getElementById('card-jp-back');
    cardJpBack.innerText = backJpText;
    cardJpBack.style.fontSize = backJpText.length > 8 ? "2.2rem" : "3.5rem";
    
    const posBadge = document.getElementById('card-pos-back');
    if (item.pos) {
        posBadge.innerText = item.pos;
        posBadge.style.backgroundColor = getPosColor(item.pos); 
        posBadge.style.display = 'inline-block';
    } else {
        posBadge.style.display = 'none';
    }

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
                 
    // 改回使用 getFullJp(item) 與 example.jp 讓系統讀漢字
    if ((type === 'word' || type === 'test-word') && getFullJp(item)) {
        playTTS(getFullJp(item)); 
    } else if ((type === 'example' || type === 'test-example') && item.example && item.example.jp) {
        playTTS(item.example.jp); 
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
    // 依據啟用的模式篩選還有任務未完成的單字
    let pendingItems = currentPool.filter(item => 
        (activeModesConfig.voice && item.progress.voice < passTarget) || 
        (activeModesConfig.audioMatch && item.progress.audioMatch < passTarget) || 
        (activeModesConfig.listen && item.progress.listen < passTarget) ||
        (activeModesConfig.zhToJp && item.progress.zhToJp < passTarget)
    );

    document.getElementById('progress').innerText = `${totalTargetPoints - currentPoints}`;

    if (pendingItems.length === 0) {
        alert("🎉 恭喜！本次特訓目標已全數達成！");
        document.querySelector('.go-home-btn').click();
        return;
    }

    activeItem = pendingItems[Math.floor(Math.random() * pendingItems.length)];
    
    // 決定這次要考哪個模式
    let availableModes = [];
    if (activeModesConfig.voice && activeItem.progress.voice < passTarget) availableModes.push('voice');
    if (activeModesConfig.audioMatch && activeItem.progress.audioMatch < passTarget) availableModes.push('audioMatch');
    if (activeModesConfig.listen && activeItem.progress.listen < passTarget) availableModes.push('listen');
    if (activeModesConfig.zhToJp && activeItem.progress.zhToJp < passTarget) availableModes.push('zhToJp');

    currentMode = availableModes[Math.floor(Math.random() * availableModes.length)];
    renderTestUI();
}

// 修改：跳過按鈕只跳過目前的單字+目前的模式
document.getElementById('skip-btn').onclick = () => {
    let remaining = passTarget - activeItem.progress[currentMode];
    activeItem.progress[currentMode] = passTarget;
    currentPoints += remaining;
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
    wordDisplay.style.fontSize = "3rem"; // 重置大小

    if (currentMode === 'voice') {
        document.getElementById('question-mode-label').innerText = "🎤 語音特訓 (請唸出完整日文)";
        wordDisplay.innerText = displayWord;
        wordDisplay.style.fontSize = displayWord.length > 10 ? "2rem" : "3rem";
        
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
            let targetJp = getFullJp(activeItem);
            // 辨識只要包含日文漢字、或假名，就給過
            let isCorrect = trans.includes(targetJp) || trans.includes(activeItem.kana) || trans.replace(/\s/g, '') === activeItem.kana;
            processResult(isCorrect, { type: 'text', value: trans });
        };

    } else if (currentMode === 'audioMatch') {
        document.getElementById('question-mode-label').innerText = "🎧 盲聽配對 (找出正確發音)";
        wordDisplay.innerText = displayWord;
        wordDisplay.style.fontSize = displayWord.length > 10 ? "2rem" : "3rem";

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
            // 改回讀取原文
            playBtn.onclick = () => playTTS(getFullJp(opt.item));

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
        
        // 改回讀取原文
        audioBtn.onclick = () => playTTS(getFullJp(activeItem));
        playTTS(getFullJp(activeItem));

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

    } else if (currentMode === 'zhToJp') { // --- 新增：中翻日模式 ---
        document.getElementById('question-mode-label').innerText = "🇹🇼 中翻日測驗 (選出正確日文)";
        wordDisplay.innerText = activeItem.zh;
        // 如果中文太長稍微縮小
        wordDisplay.style.fontSize = activeItem.zh.length > 10 ? "2rem" : "3rem";

        let options = [{ item: activeItem, isCorrect: true }];
        let others = currentPool.filter(w => w !== activeItem).sort(() => 0.5 - Math.random()).slice(0, 3);
        others.forEach(o => options.push({ item: o, isCorrect: false }));
        options.sort(() => 0.5 - Math.random());

        options.forEach(opt => {
            let btn = document.createElement('button');
            btn.className = 'select-ans-btn';
            btn.style.width = '100%';
            btn.innerText = getFullJp(opt.item);
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
            wrongText.innerText = `${getFullJp(userChoice.value)} (${userChoice.value.kana}) - ${userChoice.value.zh}`;
        }
    }

    let fullJp = getFullJp(activeItem);
    let exJpEl = document.getElementById('ex-jp');
    exJpEl.innerText = fullJp;
    exJpEl.style.fontSize = fullJp.length > 8 ? "2rem" : "2.8rem";
    
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

    const exPos = document.getElementById('ex-pos');
    if (activeItem.pos) {
        exPos.innerText = activeItem.pos;
        exPos.style.backgroundColor = getPosColor(activeItem.pos);
        exPos.style.display = 'inline-block';
    } else {
        exPos.style.display = 'none';
    }

    // 解析頁也統一唸 kana 保證發音正確
    playTTS(getFullJp(activeItem));

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

function checkDataAndInit(retryCount = 0) {
    const maxRetries = 50; 
    
    if (window.appData && Object.keys(window.appData).length > 0) {
        console.log(`課程資料載入成功，共 ${Object.keys(window.appData).length} 個課程。`);
        initThemeSelect(); 
    } else if (retryCount < maxRetries) {
        setTimeout(() => checkDataAndInit(retryCount + 1), 100);
    } else {
        console.error("逾時：無法載入課程資料。請檢查檔案路徑或 manifest.js 設定。");
        initThemeSelect(); 
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadSettings(); 
    checkDataAndInit(); 
});

function initThemeSelect() {
    const themeSelect = document.getElementById('theme-select');
    if (!themeSelect) return;

    if (!window.appData || Object.keys(window.appData).length === 0) {
        themeSelect.innerHTML = '<option value="">❌ 找不到課程資料</option>';
        return;
    }

    themeSelect.innerHTML = ''; 

    Object.keys(window.appData).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        option.innerText = window.appData[key].title || key;
        themeSelect.appendChild(option);
    });
}
