// グローバル変数
let timerInterval = null;
let timerEndTime = null;
let notificationPermission = 'default';

function updateClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeString = `${hours}:${minutes}:${seconds}`;
    document.getElementById('digital-clock').textContent = timeString;

    // 毎時0分0秒に鳩が鳴く（時報通知がONの場合）
    if (minutes === '00' && seconds === '00') {
        const hourlyToggle = document.getElementById('hourly-notification-toggle');
        if (hourlyToggle && hourlyToggle.checked) {
            playPigeonCry();
            changePigeonColor();
            // Service Workerがバックグラウンドで通知を送るため、ここでは送らない
        }
    }

    // タイマーのカウントダウン更新
    updateTimerDisplay();
}

function playPigeonCry() {
    const pigeonCry = document.getElementById('pigeon-cry');
    if (pigeonCry) {
        pigeonCry.play().catch(e => {
            console.log('音声再生に失敗しました:', e);
            // 音声ファイルがない場合の代替音
            playAlternativeSound();
        });
    } else {
        playAlternativeSound();
    }
}

// Web Audio APIで代替音を生成
function playAlternativeSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {
        console.log('代替音声再生に失敗しました:', e);
    }
}

function changePigeonColor() {
    const pigeonWindow = document.getElementById('pigeon-character');
    pigeonWindow.classList.remove("pigeon-character");
    pigeonWindow.classList.add("pigeon-character-appear");

    setTimeout(() => {
        pigeonWindow.classList.remove("pigeon-character-appear");
        pigeonWindow.classList.add("pigeon-character");
    }, 10000); 
}

// iOSかどうかを判定
function isIOS() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

// スタンドアロンモード（PWA）かどうかを判定
function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true;
}

// 通知許可をリクエスト（ユーザー操作が必要）
function requestNotificationPermission() {
    if (!('Notification' in window)) {
        updateNotificationStatus('not-supported');
        return;
    }

    // iOSでSafariブラウザから開いている場合（PWAではない）
    if (isIOS() && !isStandalone()) {
        updateNotificationStatus('ios-browser-limitation');
        return;
    }

    // 通知許可をリクエスト
    Notification.requestPermission().then(permission => {
        updateNotificationStatus(permission);
        // 許可が得られた場合、設定を保存
        if (permission === 'granted') {
            localStorage.setItem('notification-requested', 'true');
        }
    }).catch(error => {
        console.error('通知許可リクエストエラー:', error);
        updateNotificationStatus('error');
    });
}

// 通知ステータスの更新
function updateNotificationStatus(permission) {
    notificationPermission = permission || Notification.permission;
    const statusElement = document.getElementById('notification-status');
    if (!statusElement) return;
    
    // iOSブラウザの場合の特別な処理
    if (permission === 'ios-browser-limitation') {
        statusElement.innerHTML = `
            <div style="font-size: 12px; line-height: 1.4;">
                ℹ️ iOSのSafariでは通知を使用できません<br>
                <small>ホーム画面に追加してPWAとして使用してください</small><br>
                <small>共有ボタン → ホーム画面に追加</small>
            </div>
        `;
        statusElement.style.color = '#666';
        return;
    }
    
    if (permission === 'not-supported') {
        statusElement.textContent = '⚠️ このブラウザは通知をサポートしていません';
        statusElement.style.color = '#ff9800';
        return;
    }
    
    if (permission === 'error') {
        statusElement.textContent = '⚠️ 通知設定でエラーが発生しました';
        statusElement.style.color = '#ff9800';
        return;
    }
    
    switch (notificationPermission) {
        case 'granted':
            statusElement.innerHTML = `
                <div style="font-size: 12px;">
                    ✅ 通知許可済み<br>
                    <small>アプリを閉じても通知が届きます</small>
                </div>
            `;
            statusElement.style.color = '#4CAF50';
            break;
        case 'denied':
            statusElement.innerHTML = `
                <div style="font-size: 12px; line-height: 1.4;">
                    ❌ 通知が拒否されています<br>
                    <small>設定アプリから通知を許可してください</small>
                </div>
            `;
            statusElement.style.color = '#f44336';
            break;
        default:
            // 通知許可ボタンを表示
            statusElement.innerHTML = `
                <button onclick="requestNotificationPermission()" class="button" style="margin-top: 10px;">
                    🔔 通知を許可する
                </button>
                <div style="font-size: 11px; color: #666; margin-top: 5px;">
                    iOS 16.4以降でPWAとして使用時のみ利用可能
                </div>
            `;
            statusElement.style.color = '#ff9800';
            break;
    }
}

// タイマー設定（バックグラウンド対応版）
function setTimer() {
    const hoursInput = document.getElementById('timer-hours');
    const minutesInput = document.getElementById('timer-minutes');
    
    if (!hoursInput || !minutesInput) return;
    
    const hours = parseInt(hoursInput.value) || 0;
    const minutes = parseInt(minutesInput.value) || 0;
    
    if (hours === 0 && minutes === 0) {
        alert('タイマー時間を設定してください');
        return;
    }

    // Service Workerにタイマーを設定
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const channel = new MessageChannel();
        
        channel.port1.onmessage = (event) => {
            if (event.data && event.data.success) {
                // 現在時刻から指定時間後を計算（UI表示用）
                const now = new Date();
                timerEndTime = new Date(now.getTime() + (hours * 60 + minutes) * 60 * 1000);
                
                // タイマー表示を表示
                const timerDisplay = document.getElementById('timer-display');
                if (timerDisplay) {
                    timerDisplay.style.display = 'block';
                }
                
                alert(`タイマーを${hours}時間${minutes}分後に設定しました\n（アプリを閉じても通知されます）`);
            }
        };
        
        navigator.serviceWorker.controller.postMessage({
            type: 'SET_TIMER',
            hours: hours,
            minutes: minutes
        }, [channel.port2]);
    } else {
        // Service Workerが利用できない場合は従来の処理
        const now = new Date();
        timerEndTime = new Date(now.getTime() + (hours * 60 + minutes) * 60 * 1000);
        
        const timerDisplay = document.getElementById('timer-display');
        if (timerDisplay) {
            timerDisplay.style.display = 'block';
        }
        
        alert(`タイマーを${hours}時間${minutes}分後に設定しました`);
    }
}

// タイマーキャンセル
function cancelTimer() {
    timerEndTime = null;
    const timerDisplay = document.getElementById('timer-display');
    const timerCountdown = document.getElementById('timer-countdown');
    
    if (timerDisplay) {
        timerDisplay.style.display = 'none';
    }
    if (timerCountdown) {
        timerCountdown.textContent = '';
    }
    
    // TODO: Service Worker側のタイマーもキャンセルする処理を追加
}

// タイマー表示更新
function updateTimerDisplay() {
    if (!timerEndTime) return;

    const now = new Date();
    const remaining = timerEndTime - now;

    if (remaining <= 0) {
        // タイマー終了（アプリが開いている場合の処理）
        playPigeonCry();
        changePigeonColor();
        cancelTimer();
        // Service Workerが通知を送るので、ここでは送らない
        return;
    }

    // 残り時間を表示
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    const timerCountdown = document.getElementById('timer-countdown');
    if (timerCountdown) {
        timerCountdown.textContent = 
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

// PWA のオフライン状態を監視
function updateOnlineStatus() {
    const statusElement = document.getElementById('connection-status');
    if (navigator.onLine) {
        if (statusElement) statusElement.textContent = '';
    } else {
        if (!statusElement) {
            const status = document.createElement('div');
            status.id = 'connection-status';
            status.textContent = 'オフライン';
            status.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: #ff4444;
                color: white;
                padding: 5px 10px;
                border-radius: 5px;
                font-size: 12px;
                z-index: 1000;
            `;
            document.body.appendChild(status);
        }
    }
}

// 設定の保存と復元
function initializeSettings() {
    const hourlyToggle = document.getElementById('hourly-notification-toggle');
    if (hourlyToggle) {
        // 保存された設定を復元
        const savedHourlyState = localStorage.getItem('hourly-notification');
        if (savedHourlyState !== null) {
            hourlyToggle.checked = savedHourlyState === 'true';
        }
        
        // 設定変更時に保存
        hourlyToggle.addEventListener('change', () => {
            localStorage.setItem('hourly-notification', hourlyToggle.checked);
        });
    }
}

// Service Workerとの通信を設定（重要：これを追加）
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'GET_SETTINGS') {
            // Service Workerに設定を返信
            const hourlyToggle = document.getElementById('hourly-notification-toggle');
            const hourlyEnabled = hourlyToggle ? hourlyToggle.checked : true;
            event.ports[0].postMessage({ hourlyEnabled: hourlyEnabled });
        }
    });
}

// イベントリスナーの設定
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// 初期化処理
window.addEventListener('load', () => {
    // 通知許可状態を更新（自動リクエストはしない）
    updateNotificationStatus();
    
    // 設定を初期化
    initializeSettings();
    
    // 初期状態のオンライン状態をチェック
    updateOnlineStatus();
});

// 時計の更新を開始
setInterval(updateClock, 1000);
updateClock();