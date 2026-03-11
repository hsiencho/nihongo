// --- 核心變數 ---
let currentPool = []; 
let sessionPool = []; 
let activeItem = null;
let currentMode = ''; 
let passTarget = 2; 
let totalTargetPoints = 0; 
let currentPoints = 0; 

let isDailyChallenge = false;
let originalPassTarget = 2;
let dailyTimerId = null;

// 儲存原始設定
window.originalModesConfig = null;

// --- 模式設定狀態 ---
let activeModesConfig = {
    voice: true,
    audioMatch: true,
    listen: true,
    zhToJp: false
};

const tagMap = {
    "people_and_identity": "人物、稱呼與身分",
    "time_and_date": "時間與日期",
    "objects_and_clothing": "物品與服飾",
    "adjectives": "形容詞 (狀態與感覺)",
    "food_and_drink": "飲食",
    "places_and_buildings": "地點與建築",
    "directions_and_positions": "方位與位置",
    "verbs": "核心動詞",
    "pronouns_and_interrogatives": "指示詞與疑問詞",
    "nature_and_weather": "自然與天氣",
    "transportation_and_movement": "交通與移動"
};

function getFullJp(item) {
    if (!item) return "";
    return item.type === 'grammar' ? item.q.replace("( ____ )", item.ans) : item.jp;
}

function getSpokenWord(item) {
    let fullJp = getFullJp(item);
    // 如果這個字有在修正清單中，就回傳它的 kana；否則回傳原本的日文
    if (item.type === 'vocab' && window.ttsFixes && window.ttsFixes.includes(fullJp)) {
        return item.kana; 
    }
    return fullJp;
}

function getGMT8Date() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const nd = new Date(utc + (3600000 * 8));
    const yyyy = nd.getFullYear();
    const mm = String(nd.getMonth() + 1).padStart(2, '0');
    const dd = String(nd.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function getGMT8DateTime() {
    const d = new Date();
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * 8));
}

// 動態計算需要完成的點數
function calculatePoints(pool) {
    let total = 0;
    let current = 0;
    pool.forEach(item => {
        // 文法題排除語音特訓
        if (item.type !== 'grammar' && activeModesConfig.voice) {
            total += passTarget;
            current += Math.min(item.progress.voice, passTarget);
        }
        if (activeModesConfig.audioMatch) {
            total += passTarget;
            current += Math.min(item.progress.audioMatch, passTarget);
        }
        if (activeModesConfig.listen) {
            total += passTarget;
            current += Math.min(item.progress.listen, passTarget);
        }
        if (activeModesConfig.zhToJp) {
            total += passTarget;
            current += Math.min(item.progress.zhToJp, passTarget);
        }
    });
    return { total, current };
}

// --- 設定與本地儲存 ---
function loadSettings() {
    let savedScale = localStorage.getItem('fontScale') || 1;
    let savedTarget = localStorage.getItem('passTarget') || 2;
    document.documentElement.style.setProperty('--font-scale', savedScale);
    document.getElementById('font-scale-slider').value = savedScale;
    document.getElementById('target-count-input').value = savedTarget;
    passTarget = parseInt(savedTarget);

    activeModesConfig.voice = localStorage.getItem('modeVoice') !== 'false';
    activeModesConfig.audioMatch = localStorage.getItem('modeAudioMatch') !== 'false';
    activeModesConfig.listen = localStorage.getItem('modeListen') !== 'false';
    activeModesConfig.zhToJp = localStorage.getItem('modeZhToJp') === 'true';

    const v = document.getElementById('setting-mode-voice'); if(v) v.checked = activeModesConfig.voice;
    const a = document.getElementById('setting-mode-audioMatch'); if(a) a.checked = activeModesConfig.audioMatch;
    const l = document.getElementById('setting-mode-listen'); if(l) l.checked = activeModesConfig.listen;
    const z = document.getElementById('setting-mode-zhToJp'); if(z) z.checked = activeModesConfig.zhToJp;

    updateDailyStatus();
}
loadSettings();

function updateDailyStatus() {
    const doneDate = localStorage.getItem('dailyChallengeDoneDate');
    const today = getGMT8Date();
    const statusIcon = document.getElementById('daily-status');
    if (statusIcon) {
        statusIcon.innerText = (doneDate === today) ? "✅" : "❌";
    }
}

const fontSlider = document.getElementById('font-scale-slider');
fontSlider.addEventListener('input', (e) => {
    document.documentElement.style.setProperty('--font-scale', e.target.value);
    localStorage.setItem('fontScale', e.target.value);
});

document.getElementById('btn-settings').onclick = (e) => {
    if(e) e.currentTarget.blur(); // 清除焦點防止殘影
    document.getElementById('settings-panel').style.display = 'flex';
};
document.getElementById('save-settings-btn').onclick = () => {
    let target = document.getElementById('target-count-input').value;
    localStorage.setItem('passTarget', target);
    passTarget = parseInt(target);

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

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
}

// --- 首頁導航與選單互動 ---
document.getElementById('start-btn').onclick = () => initSession('test');
document.getElementById('view-cards-btn').onclick = () => initSession('flashcard');
document.getElementById('daily-btn').onclick = (e) => {
    if(e) e.currentTarget.blur(); // 清除焦點防止殘影
    openDailyModal();
};

document.querySelectorAll('.go-home-btn').forEach(btn => {
    btn.onclick = () => {
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('flashcard-container').style.display = 'none';
        document.getElementById('home-menu').style.display = 'flex';
        window.speechSynthesis.cancel();
        
        // 退出挑戰時還原本來的設定
        if (isDailyChallenge) {
            isDailyChallenge = false;
            passTarget = originalPassTarget; 
            if(window.originalModesConfig) {
                activeModesConfig = { ...window.originalModesConfig };
                window.originalModesConfig = null;
            }
        }
        updateDailyStatus();
    };
});

function updateHomeTags() {
    const themeKey = document.getElementById('theme-select').value;
    const themeData = window.appData && window.appData[themeKey] ? window.appData[themeKey].items : [];
    const selectedLevels = Array.from(document.querySelectorAll('#level-checkboxes input:checked')).map(cb => cb.value);
    
    const tags = new Set();
    themeData.forEach(item => { 
        if (selectedLevels.includes(item.level) && item.tag) tags.add(item.tag); 
    });

    const tagSelect = document.getElementById('home-tag-select');
    if (tags.size > 0) {
        tagSelect.style.display = 'block';
        tagSelect.innerHTML = '<option value="all">全部</option>';
        tags.forEach(tag => {
            const opt = document.createElement('option');
            opt.value = tag;
            opt.innerText = tagMap[tag] || tag;
            tagSelect.appendChild(opt);
        });
    } else {
        tagSelect.style.display = 'none';
        tagSelect.innerHTML = '<option value="all">全部</option>';
    }
}

document.getElementById('theme-select').addEventListener('change', updateHomeTags);
document.querySelectorAll('#level-checkboxes input').forEach(cb => cb.addEventListener('change', updateHomeTags));

// --- 每日挑戰邏輯 ---
function openDailyModal() {
    initDailyPool();
    document.getElementById('daily-panel').style.display = 'flex';
    document.getElementById('daily-date-text').innerText = getGMT8Date();
    
    dailyTimerId = setInterval(updateDailyTimer, 1000);
    updateDailyTimer();
    updateDailyModalUI();
}

function closeDailyModal() {
    document.getElementById('daily-panel').style.display = 'none';
    clearInterval(dailyTimerId);
}

function updateDailyTimer() {
    const now = getGMT8DateTime();
    const currentStr = now.toTimeString().split(' ')[0]; 
    document.getElementById('daily-current-time').innerText = currentStr;
    
    const eod = new Date(now);
    eod.setHours(23, 59, 59, 999);
    const diff = Math.floor((eod - now) / 1000);
    
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    document.getElementById('daily-time-left').innerText = `${h}:${m}:${s}`;
}

function updateDailyModalUI() {
    const doneDate = localStorage.getItem('dailyChallengeDoneDate');
    const today = getGMT8Date();
    const isDone = (doneDate === today);
    
    document.getElementById('daily-congratulations').style.display = isDone ? 'block' : 'none';
    document.getElementById('daily-start-btn').innerText = isDone ? '⚔️ 再次挑戰(不計分)' : '⚔️ 開始挑戰';
}

function initDailyPool(forceRefresh = false) {
    const today = getGMT8Date();
    let savedDate = localStorage.getItem('dailyDate');
    let savedPool = localStorage.getItem('dailyPool');
    
    if (savedDate !== today || !savedPool || forceRefresh) {
        let allItems = [];
        Object.values(window.appData).forEach(theme => {
            if (theme.items) {
                // 排除文法題，只抓單字
                allItems = allItems.concat(theme.items.filter(i => i.type !== 'grammar'));
            }
        });
        
        allItems.sort(() => 0.5 - Math.random());
        let newPool = allItems.slice(0, 30).map(item => ({
            ...item, progress: { voice: 0, audioMatch: 0, listen: 0, zhToJp: 0 }
        }));
        
        localStorage.setItem('dailyDate', today);
        localStorage.setItem('dailyPool', JSON.stringify(newPool));
        if (savedDate !== today || forceRefresh) {
            localStorage.removeItem('dailyChallengeDoneDate');
        }
        return newPool;
    } else {
        return JSON.parse(savedPool);
    }
}

let dailyRefreshClicks = 0;
const refreshBtn = document.getElementById('daily-refresh-btn');
refreshBtn.onclick = () => {
    if (dailyRefreshClicks === 0) {
        refreshBtn.innerText = "⚠️ 確定刷新?";
        refreshBtn.style.color = "var(--danger)";
        dailyRefreshClicks++;
        setTimeout(() => {
            if(dailyRefreshClicks === 1) { 
                refreshBtn.innerText = "🔄 刷新挑戰";
                refreshBtn.style.color = "var(--text-muted)";
                dailyRefreshClicks = 0;
            }
        }, 3000);
    } else {
        initDailyPool(true); 
        refreshBtn.innerText = "🔄 刷新挑戰";
        refreshBtn.style.color = "var(--text-muted)";
        dailyRefreshClicks = 0;
        alert("已為您刷新本日題庫與進度！");
        updateDailyModalUI();
    }
};

document.getElementById('daily-preview-btn').onclick = () => startDaily('flashcard');
document.getElementById('daily-start-btn').onclick = () => startDaily('test');

function startDaily(type) {
    closeDailyModal();
    isDailyChallenge = true;
    originalPassTarget = passTarget;
    passTarget = 2; // 挑戰模式強制要求每種完成2次

    // 強制全部模式開啟
    window.originalModesConfig = { ...activeModesConfig };
    activeModesConfig = { voice: true, audioMatch: true, listen: true, zhToJp: true };

    document.getElementById('home-menu').style.display = 'none';
    currentPool = JSON.parse(localStorage.getItem('dailyPool'));

    const today = getGMT8Date();
    const isDone = localStorage.getItem('dailyChallengeDoneDate') === today;

    if (type === 'flashcard') {
        document.getElementById('flashcard-container').style.display = 'flex';
        sessionPool = currentPool.map(item => ({ ...item }));
        populateFlashcardTags(sessionPool);
        filterFlashcards('all');
    } else {
        // ✨ 如果今天已經完成，將記憶體中的挑戰進度歸零以供再次遊玩 (不影響已完成狀態)
        if (isDone) {
            currentPool.forEach(item => {
                item.progress = { voice: 0, audioMatch: 0, listen: 0, zhToJp: 0 };
            });
        }

        document.getElementById('game-container').style.display = 'flex';
        document.getElementById('skip-btn').style.display = 'none'; 
        
        const pts = calculatePoints(currentPool);
        totalTargetPoints = pts.total;
        currentPoints = pts.current;

        nextTestQuestion();
    }
}


function initSession(type) {
    const themeKey = document.getElementById('theme-select').value;
    const themeData = window.appData && window.appData[themeKey] ? window.appData[themeKey].items : [];
    const selectedLevels = Array.from(document.querySelectorAll('#level-checkboxes input:checked')).map(cb => cb.value);
    const selectedTag = document.getElementById('home-tag-select').value;

    let activeModesCount = Object.values(activeModesConfig).filter(v => v).length;

    if (selectedLevels.length === 0) return alert("請至少選擇一個難度！");
    if (type === 'test' && activeModesCount === 0) return alert("請至設定中至少開啟一種測驗模式！");

    let basePool = themeData.filter(item => selectedLevels.includes(item.level));
    if (basePool.length === 0) return alert("抱歉，該難度下目前沒有題目資料喔！");

    document.getElementById('home-menu').style.display = 'none';

    if (type === 'flashcard') {
        document.getElementById('flashcard-container').style.display = 'flex';
        sessionPool = basePool.map(item => ({ ...item }));
        populateFlashcardTags(sessionPool);
        filterFlashcards(selectedTag && selectedTag !== 'all' ? selectedTag : 'all'); 
    } else {
        if (selectedTag && selectedTag !== 'all') {
            basePool = basePool.filter(item => item.tag === selectedTag);
        }
        if (basePool.length === 0) {
            document.querySelector('.go-home-btn').click();
            return alert("抱歉，該標籤分類下沒有題目喔！");
        }

        currentPool = basePool.map(item => ({
            ...item, progress: { voice: 0, audioMatch: 0, listen: 0, zhToJp: 0 } 
        }));

        document.getElementById('game-container').style.display = 'flex';
        document.getElementById('skip-btn').style.display = 'block'; 
        
        const pts = calculatePoints(currentPool);
        totalTargetPoints = pts.total;
        currentPoints = pts.current;

        nextTestQuestion();
    }
}

// --- 單字卡系統 ---
let cardIndex = 0;

function populateFlashcardTags(pool) {
    const selectEl = document.getElementById('flashcard-tag-select');
    
    // ✨ 每日挑戰模式下強制隱藏 Tag 下拉選單
    if (isDailyChallenge) {
        selectEl.style.display = 'none';
        selectEl.innerHTML = '<option value="all">全部</option>';
        return;
    }

    const tags = new Set();
    pool.forEach(item => { if (item.tag) tags.add(item.tag); });
    
    if (tags.size > 0) {
        selectEl.style.display = 'inline-block';
        selectEl.innerHTML = '<option value="all">全部</option>';
        tags.forEach(tag => {
            const opt = document.createElement('option');
            opt.value = tag;
            opt.innerText = tagMap[tag] || tag;
            selectEl.appendChild(opt);
        });
        selectEl.value = 'all'; 
    } else {
        selectEl.style.display = 'none';
        selectEl.innerHTML = '';
    }
}

document.getElementById('flashcard-tag-select').addEventListener('change', (e) => { filterFlashcards(e.target.value); });

function filterFlashcards(tag) {
    if (tag === 'all') {
        currentPool = [...sessionPool];
    } else {
        currentPool = sessionPool.filter(item => item.tag === tag);
    }
    const tagSelect = document.getElementById('flashcard-tag-select');
    if (tagSelect.querySelector(`option[value="${tag}"]`)) {
        tagSelect.value = tag; 
    }
    cardIndex = 0;
    if (currentPool.length > 0) {
        renderCard();
    } else {
        document.getElementById('card-jp-front').innerText = "無符合標籤之單字";
        document.getElementById('card-progress').innerText = "0 / 0";
    }
}

function renderCard() {
    if(currentPool.length === 0) return;
    const item = currentPool[cardIndex];
    document.getElementById('card-progress').innerText = `${cardIndex + 1} / ${currentPool.length}`;
    
    resetCardToFront();
    
    let frontText = item.type === 'grammar' ? item.q.replace("( ____ )", "___") : item.jp;
    document.getElementById('card-jp-front').innerText = frontText;
    
    let backJpText = getFullJp(item);
    let cardJpBack = document.getElementById('card-jp-back');
    
    // 套用 Ruby 標籤
    if (item.type !== 'grammar') {
        cardJpBack.innerHTML = createRubyHTML(backJpText, item.kana);
    } else {
        cardJpBack.innerText = backJpText;
    }
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
    if(currentPool.length === 0) return;
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

document.getElementById('next-card').onclick = (e) => { e.stopPropagation(); if (cardIndex < currentPool.length - 1) { cardIndex++; renderCard(); } };
document.getElementById('prev-card').onclick = (e) => { e.stopPropagation(); if (cardIndex > 0) { cardIndex--; renderCard(); } };

function playAudioCard(type, event) {
    if (event) event.stopPropagation(); 
    const item = (activeItem && document.getElementById('game-container').style.display === 'flex') 
                 ? activeItem : currentPool[cardIndex];
                 
    if ((type === 'word' || type === 'test-word') && getFullJp(item)) {
        // ✨ 單字發音：套用修正邏輯
        playTTS(getSpokenWord(item)); 
    } else if ((type === 'example' || type === 'test-example') && item.example && item.example.jp) {
        // ✨ 例句發音：直接唸原本的字串，不處理修正
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

// --- 測驗系統 ---
function nextTestQuestion() {
    let pendingItems = currentPool.filter(item => 
        (item.type !== 'grammar' && activeModesConfig.voice && item.progress.voice < passTarget) || 
        (activeModesConfig.audioMatch && item.progress.audioMatch < passTarget) || 
        (activeModesConfig.listen && item.progress.listen < passTarget) ||
        (activeModesConfig.zhToJp && item.progress.zhToJp < passTarget)
    );

    document.getElementById('progress').innerText = `${totalTargetPoints - currentPoints}`;

    if (pendingItems.length === 0) {
        if (isDailyChallenge) {
            localStorage.setItem('dailyChallengeDoneDate', getGMT8Date());
            alert("🎉 恭喜！您已完成今天的每日挑戰！");
        } else {
            alert("🎉 恭喜！本次特訓目標已全數達成！");
        }
        document.querySelector('.go-home-btn').click();
        return;
    }

    activeItem = pendingItems[Math.floor(Math.random() * pendingItems.length)];
    
    let availableModes = [];
    // 嚴格排除文法題的語音模式
    if (activeItem.type !== 'grammar' && activeModesConfig.voice && activeItem.progress.voice < passTarget) availableModes.push('voice');
    if (activeModesConfig.audioMatch && activeItem.progress.audioMatch < passTarget) availableModes.push('audioMatch');
    if (activeModesConfig.listen && activeItem.progress.listen < passTarget) availableModes.push('listen');
    if (activeModesConfig.zhToJp && activeItem.progress.zhToJp < passTarget) availableModes.push('zhToJp');

    currentMode = availableModes[Math.floor(Math.random() * availableModes.length)];
    renderTestUI();
}

document.getElementById('skip-btn').onclick = () => {
    let remaining = passTarget - activeItem.progress[currentMode];
    activeItem.progress[currentMode] = passTarget;
    currentPoints += remaining;
    nextTestQuestion();
};

const toggleRomajiBtn = document.getElementById('toggle-romaji-btn');
const romajiInputArea = document.getElementById('romaji-input-area');
const romajiInput = document.getElementById('romaji-input');
const romajiSubmit = document.getElementById('romaji-submit');
const micBtn = document.getElementById('mic-btn');

toggleRomajiBtn.onclick = () => {
    if(romajiInputArea.style.display === 'none') {
        romajiInputArea.style.display = 'block';
        micBtn.style.display = 'none';
        toggleRomajiBtn.innerText = "🎤 切換語音輸入";
        romajiInput.focus();
    } else {
        romajiInputArea.style.display = 'none';
        micBtn.style.display = 'inline-block';
        toggleRomajiBtn.innerText = "⌨️ 切換鍵盤輸入";
    }
};

romajiInput.onkeypress = (e) => {
    if (e.key === 'Enter') romajiSubmit.click();
};

romajiSubmit.onclick = () => {
    let val = romajiInput.value.trim();
    if(!val) return;
    let targetStr = activeItem.romaji.replace(/[^a-z]/gi, '').toLowerCase();
    let inputStr = val.replace(/[^a-z]/gi, '').toLowerCase();
    
    let isCorrect = (targetStr === inputStr);
    processResult(isCorrect, { type: 'text', value: val });
};

// 輔助函式：取得過濾後的選項陣列
function getOptionsFor(activeItem) {
    let options = [{ item: activeItem, isCorrect: true }];
    let isGrammar = activeItem.type === 'grammar';
    // 嚴格分類：文法題只抓文法，單字題只抓單字
    let others = currentPool.filter(w => w !== activeItem && (w.type === 'grammar') === isGrammar)
                            .sort(() => 0.5 - Math.random())
                            .slice(0, 3);
    others.forEach(o => options.push({ item: o, isCorrect: false }));
    options.sort(() => 0.5 - Math.random());
    return options;
}

function renderTestUI() {
    document.getElementById('question-area').style.display = 'flex';
    document.getElementById('explanation-area').style.display = 'none';
    const wordDisplay = document.getElementById('enemy-word');
    const optionsArea = document.getElementById('options-area');
    const voiceInputContainer = document.getElementById('voice-input-container');
    const audioBtn = document.getElementById('replay-audio');
    
    optionsArea.innerHTML = '';
    voiceInputContainer.style.display = 'none';
    audioBtn.style.display = 'none';
    document.getElementById('mic-status').innerText = '';

    let displayWord = activeItem.type === 'grammar' ? activeItem.q.replace("( ____ )", "___") : activeItem.jp;
    wordDisplay.style.fontSize = "3rem"; 

    if (currentMode === 'voice') {
        document.getElementById('question-mode-label').innerText = "🎤 語音特訓 (請唸出完整日文)";
        wordDisplay.innerText = displayWord;
        wordDisplay.style.fontSize = displayWord.length > 10 ? "2rem" : "3rem";
        
        voiceInputContainer.style.display = 'flex';
        micBtn.style.display = 'inline-block';
        romajiInputArea.style.display = 'none';
        toggleRomajiBtn.innerText = "⌨️ 切換鍵盤輸入";
        romajiInput.value = '';
        
        if (!recognition) {
            document.getElementById('mic-status').innerText = "瀏覽器不支援麥克風，您可以切換至鍵盤輸入。";
        }

        micBtn.onclick = () => {
            if(!recognition) return;
            micBtn.innerText = "聽取中...";
            try { recognition.start(); } catch(e) {} 
        };

        if (recognition) {
            recognition.onresult = (e) => {
                micBtn.innerText = "🎤 按住說話";
                
                // 1. 取得辨識結果與標準答案，並移除所有空格
                let originalTrans = e.results[0][0].transcript.trim();
                let trans = originalTrans.replace(/\s/g, ''); 
                let targetJp = getFullJp(activeItem).replace(/\s/g, '');
                let targetKana = activeItem.kana.replace(/\s/g, '');

                // 2. 建立一個小工具：把字串裡面的「片假名」全部轉成「平假名」
                const toHira = (str) => {
                    return str.replace(/[\u30a1-\u30f6]/g, match => 
                        String.fromCharCode(match.charCodeAt(0) - 0x60)
                    );
                };

                // 3. 雙重比對邏輯
                // 第一層：原汁原味比對（命中漢字，或本來就是片假名的外來語如 パン）
                let isCorrect = trans.includes(targetJp) || trans.includes(targetKana);

                // 第二層：如果第一層沒中，就把雙方都轉成平假名再比對一次（救援タベル -> たべる的情況）
                if (!isCorrect) {
                    let hiraTrans = toHira(trans);
                    let hiraJp = toHira(targetJp);
                    let hiraKana = toHira(targetKana);
                    
                    isCorrect = hiraTrans.includes(hiraJp) || hiraTrans.includes(hiraKana);
                }
                
                // 4. 傳送結果 (把最原始的 originalTrans 傳進去，這樣畫面上才會顯示系統原本聽到什麼)
                processResult(isCorrect, { type: 'text', value: originalTrans });
            };
            recognition.onerror = () => { micBtn.innerText = "🎤 按住說話"; };
            recognition.onend = () => { micBtn.innerText = "🎤 按住說話"; };
        }

    } else if (currentMode === 'audioMatch') {
        document.getElementById('question-mode-label').innerText = "🎧 盲聽配對 (找出正確發音)";
        wordDisplay.innerText = displayWord;
        wordDisplay.style.fontSize = displayWord.length > 10 ? "2rem" : "3rem";

        let options = getOptionsFor(activeItem);

        options.forEach((opt) => {
            let row = document.createElement('div');
            row.className = 'audio-option-row';
            
            let playBtn = document.createElement('button');
            playBtn.className = 'play-audio-btn';
            playBtn.innerHTML = "🔊";
            playBtn.onclick = () => playTTS(getSpokenWord(opt.item));

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
        
        audioBtn.onclick = () => playTTS(getSpokenWord(activeItem));
        playTTS(getSpokenWord(activeItem));

        let options = getOptionsFor(activeItem);

        options.forEach(opt => {
            let btn = document.createElement('button');
            btn.className = 'select-ans-btn';
            btn.style.width = '100%';
            btn.innerText = opt.item.zh;
            btn.onclick = () => processResult(opt.isCorrect, { type: 'item', value: opt.item });
            optionsArea.appendChild(btn);
        });

    } else if (currentMode === 'zhToJp') {
        document.getElementById('question-mode-label').innerText = "📃 中翻日測驗 (選出正確日文)";
        wordDisplay.innerText = activeItem.zh;
        wordDisplay.style.fontSize = activeItem.zh.length > 10 ? "2rem" : "3rem";

        let options = getOptionsFor(activeItem);

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
        
        if (isDailyChallenge) {
            localStorage.setItem('dailyPool', JSON.stringify(currentPool));
        }
    } else {
        document.getElementById('result-title').innerText = "❌ 答錯了！";
        document.getElementById('wrong-feedback-box').style.display = 'block';
        const wrongText = document.getElementById('user-wrong-ans');
        
        if (userChoice.type === 'text') {
            wrongText.innerText = `辨識/輸入結果為：「${userChoice.value}」`;
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

    playTTS(getSpokenWord(activeItem));
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
        initThemeSelect(); 
    } else if (retryCount < maxRetries) {
        setTimeout(() => checkDataAndInit(retryCount + 1), 100);
    } else {
        initThemeSelect(); 
    }
}

document.addEventListener('DOMContentLoaded', () => {
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
    
    updateHomeTags();
}

function createRubyHTML(jp, kana) {
    if (!jp || !kana) return jp || '';
    if (jp === kana) return jp; // 純假名直接回傳

    try {
        // 1. 拆分漢字與假名
        // 🛠️ 關鍵修正：加上 .filter(Boolean) 徹底清除空字串，防止陣列索引錯位！
        let parts = jp.split(/([\u3040-\u30FF\u30FC]+)/).filter(Boolean);
        
        let regexPattern = "^";
        let isKanjiBlock = [];
        
        // 2. 自動生成對比模板
        for (let i = 0; i < parts.length; i++) {
            if (/^[\u3040-\u30FF\u30FC]+$/.test(parts[i])) {
                regexPattern += parts[i];
                isKanjiBlock.push(false);
            } else {
                regexPattern += "(.*?)";
                isKanjiBlock.push(true);
            }
        }
        regexPattern += "$"; 
        
        // 3. 拿模板去套用標準答案的 Kana
        let regex = new RegExp(regexPattern);
        let match = kana.match(regex);
        
        // 4. 完美吻合時，填入標準 Ruby 標籤
        if (match) {
            let html = "";
            let captureIndex = 1; 
            
            for (let i = 0; i < parts.length; i++) {
                if (isKanjiBlock[i]) {
                    let reading = match[captureIndex];
                    captureIndex++;
                    if (reading) {
                        html += `<ruby>${parts[i]}<rt style="font-size: 0.4em; color: var(--text-muted); font-weight: bold;">${reading}</rt></ruby>`;
                    } else {
                        html += parts[i];
                    }
                } else {
                    html += parts[i]; 
                }
            }
            return html;
        }
    } catch(e) {
        console.error("Ruby標籤生成失敗，退回預設顯示:", e);
    }

    // 5. 例外情況防呆：退回整包標註
    return `<ruby>${jp}<rt style="font-size: 0.4em; color: var(--text-muted); font-weight: bold;">${kana}</rt></ruby>`;
}
