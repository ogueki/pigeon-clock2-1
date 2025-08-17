const CACHE_NAME = 'pigeon-clock-v4';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './pigeon-clock.js',
  './manifest.json'
];

// Service Worker のインストール
self.addEventListener('install', (event) => {
  console.log('[SW] インストール開始');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] キャッシュを開いています');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('[SW] インストール完了');
      })
      .catch((error) => {
        console.error('[SW] インストールエラー:', error);
      })
  );
});

// Service Worker の起動
self.addEventListener('activate', (event) => {
  console.log('[SW] アクティベート開始');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] 古いキャッシュを削除:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] アクティベート完了');
      // バックグラウンド時報の開始
      startHourlyCheck();
    })
  );
});

// ネットワークリクエストの処理
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });
          return response;
        });
      })
  );
});

// タイマーを保存するための配列
let activeTimers = [];

// メッセージハンドラー
self.addEventListener('message', (event) => {
  console.log('[SW] メッセージ受信:', event.data);
  
  if (event.data && event.data.type === 'SET_TIMER') {
    // タイマーを設定
    const { hours, minutes } = event.data;
    const timerMs = (hours * 60 + minutes) * 60 * 1000;
    
    console.log(`[SW] タイマー設定: ${hours}時間${minutes}分後`);
    
    const timerId = setTimeout(() => {
      console.log('[SW] タイマー終了、通知を送信');
      showNotification('⏰ 鳩時計 - タイマー', 'タイマーが終了しました！', 'timer');
      // タイマーを配列から削除
      activeTimers = activeTimers.filter(t => t.id !== timerId);
    }, timerMs);
    
    // タイマーを保存
    activeTimers.push({
      id: timerId,
      endTime: Date.now() + timerMs
    });
    
    // クライアントに設定完了を通知
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ success: true });
    }
  }
});

// 時報チェック機能
let hourlyCheckInterval;
let lastHourNotified = -1; // 最後に通知した時刻を記録

function startHourlyCheck() {
  console.log('[SW] 時報チェック開始');
  
  // 既存のインターバルをクリア
  if (hourlyCheckInterval) {
    clearInterval(hourlyCheckInterval);
  }
  
  // 30秒ごとにチェック（より正確に時刻を捉えるため）
  hourlyCheckInterval = setInterval(() => {
    checkAndSendHourlyNotification();
  }, 30000); // 30秒ごと
  
  // 初回チェック
  checkAndSendHourlyNotification();
}

// 時報通知の送信確認
async function checkAndSendHourlyNotification() {
  try {
    const now = new Date();
    const currentHour = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    // 毎時0分0-30秒の間で、まだこの時間に通知していない場合
    if (minutes === 0 && seconds < 30 && lastHourNotified !== currentHour) {
      console.log(`[SW] 時報チェック: ${currentHour}時の通知を準備`);
      
      // 通知許可を確認
      const permission = await self.registration.pushManager.permissionState({ userVisibleOnly: true });
      console.log('[SW] 通知許可状態:', permission);
      
      if (permission !== 'granted') {
        console.log('[SW] 通知が許可されていません');
        return;
      }
      
      // すべてのクライアントを取得
      const clients = await self.clients.matchAll({ type: 'window' });
      console.log('[SW] アクティブなクライアント数:', clients.length);
      
      // デフォルトで時報を有効にする
      let hourlyEnabled = true;
      
      if (clients.length > 0) {
        // アクティブなクライアントがあれば設定を問い合わせ
        try {
          const client = clients[0];
          const channel = new MessageChannel();
          
          const promise = new Promise((resolve) => {
            channel.port1.onmessage = (event) => {
              console.log('[SW] クライアントから設定受信:', event.data);
              if (event.data && typeof event.data.hourlyEnabled !== 'undefined') {
                hourlyEnabled = event.data.hourlyEnabled;
              }
              resolve();
            };
          });
          
          client.postMessage({ type: 'GET_SETTINGS' }, [channel.port2]);
          
          // タイムアウト設定（クライアントが応答しない場合）
          await Promise.race([
            promise,
            new Promise(resolve => setTimeout(resolve, 500))
          ]);
        } catch (error) {
          console.log('[SW] クライアントとの通信エラー:', error);
          // エラーが発生してもデフォルト設定で続行
        }
      } else {
        console.log('[SW] クライアントがないため、デフォルト設定を使用');
      }
      
      // 時報が有効なら通知を送信
      if (hourlyEnabled) {
        console.log(`[SW] ${currentHour}時の通知を送信`);
        showNotification(
          '🕊 鳩時計 - 時報',
          `${currentHour}時です！鳩が鳴きました`,
          'hourly'
        );
        lastHourNotified = currentHour;
      } else {
        console.log('[SW] 時報が無効になっています');
      }
    }
  } catch (error) {
    console.error('[SW] 時報通知エラー:', error);
  }
}

// 通知を表示
async function showNotification(title, body, tag) {
  try {
    console.log(`[SW] 通知を表示: ${title}`);
    
    const options = {
      body: body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: tag,
      requireInteraction: tag === 'timer', // タイマーは手動で閉じる必要あり
      silent: false,
      vibrate: tag === 'timer' ? [300, 100, 300, 100, 300] : [200, 100, 200],
      data: { 
        type: tag,
        timestamp: new Date().toISOString()
      }
    };
    
    await self.registration.showNotification(title, options);
    console.log('[SW] 通知を表示しました');
  } catch (error) {
    console.error('[SW] 通知表示エラー:', error);
  }
}

// 通知をクリックした時の処理
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] 通知がクリックされました');
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === self.registration.scope && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('./');
        }
      })
  );
});

// エラーハンドリング
self.addEventListener('error', (event) => {
  console.error('[SW] エラー:', event);
});

// 未処理のPromiseエラー
self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] 未処理のPromiseエラー:', event.reason);
});