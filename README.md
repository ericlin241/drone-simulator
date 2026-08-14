# Web Flight Lab 無人機模擬器

可直接部署到 GitHub Pages 的 Three.js 無人機飛行訓練平台。支援手機雙搖桿、Gamepad／航模遙控器與鍵盤備援，並整合 Rates 調校、環境物理、水平 8 字考照評分、彩色飛行軌跡與四種專業視角。完整操作方式請見 [GUIDE.md](GUIDE.md)。

## 核心功能

- `InputManager` 將手機、鍵盤與 Web Gamepad API 統一為 Throttle `0～1`、Yaw／Pitch／Roll `-1～1`
- Web Gamepad 即時輪詢，A／叉鍵解鎖或上鎖，B／圓圈鍵重設
- 鍵盤 `W/S` 油門、`A/D` 偏航、方向鍵俯仰／橫滾、`Space` 解鎖、`R` 重設
- 美國手 Mode 2／日本手 Mode 1，由手機調校面板切換並同步至模擬器
- 新手／標準／競速快速檔位，以及 10%～100% 速度、油門上限、RC Rate、Expo 與 Deadband
- Expo 使用 `(1 - Expo) × Input + Expo × Input³`，Deadband 會重新映射剩餘行程
- Angle 自穩、Acro 特技、Altitude Hold 定高模式，按 `M` 或 UI 切換
- 固定基礎風場、多頻亂流、相對風二次阻力、0.5 m 以下地面效應
- 每 50 ms 記錄軌跡、最多 1000 點；高度誤差小／中／大分別顯示綠／黃／紅
- P1～P7 寬鬆訓練評分、航線與高度即時扣分，完成後顯示時間、分數與 Pass／Fail
- 電腦端可下載含時間、座標、高度、誤差、分數、航點及解鎖狀態的 CSV 或 JSON
- 每次解鎖後必須先確實離地；離地後再次接觸地面才判定降落、速度歸零並自動鎖定馬達
- Chase、FPV（20° 仰角）、Pilot POV、Orbit 四視角，按 `C` 或 UI 無縫切換
- 手機分級震動：高輸出、命令、解鎖、航點、扣分、完成與墜機皆有不同節奏，可關閉
- 手機介面採緊湊尺寸，viewport 與手勢事件共同禁止頁面縮放
- PeerJS 點對點手機控制、QR Code 配對與雙向飛行／評分遙測
- 15 m × 15 m P1～P7 水平 8 字場地，以及機棚、樹木、訓練門、護欄碰撞

## 本機執行

ES6 模組必須透過 HTTP 載入：

```bash
python3 -m http.server 8000
```

開啟 `http://localhost:8000`。手機測試請用同一網路可存取的電腦 IP，或使用正式 GitHub Pages HTTPS 網址掃描 QR Code。

## 控制表

| 輸入 | Throttle | Yaw | Pitch | Roll | 命令 |
| --- | --- | --- | --- | --- | --- |
| 手機 Mode 2 | 左桿上下 | 左桿左右 | 右桿上下 | 右桿左右 | 畫面按鈕／內八 |
| 手機 Mode 1 | 右桿上下 | 左桿左右 | 左桿上下 | 右桿左右 | 畫面按鈕／內八 |
| 鍵盤 | `W/S` | `A/D` | `↑/↓` | `←/→` | `Space`、`R`、`M`、`C` |
| Gamepad | 左 Y（Mode 2）／右 Y（Mode 1） | 左 X | 右 Y／左 Y | 右 X | A 解鎖、B 重設 |

## 模組架構

- `index.html`：Three.js 場景、HUD、PeerJS 與模組協調
- `controller.html`：手機雙搖桿、調校同步、遙測與觸覺回饋
- `js/rate-config.js`：設定驗證、持久化、Expo／Deadband 曲線與 UI 綁定
- `js/input-manager.js`：手機、鍵盤與 Gamepad 的輸入仲裁
- `js/physics-engine.js`：姿態、速度、飛行模式、風場、阻力與地面效應
- `js/flight-assessor.js`：Ghost Trail、路徑誤差、航點、評分結算與資料匯出
- `js/camera-controller.js`：Chase／FPV／Pilot／Orbit 相機所有權與轉場
- `GUIDE.md`：操作、調校、評分、震動與疑難排解

## 部署與相容性

專案無須建置，推送分支根目錄即可由 GitHub Pages 發布。Three.js 固定使用已驗證的 classic global `0.160.1`；PeerJS、qrcode.js 與 nipplejs 同樣由 jsDelivr 載入，因此首次載入與 WebRTC signaling 需要網路。Gamepad 軸序可能因廠牌而異，本版採瀏覽器標準四軸配置。

正式高可靠度使用建議自行託管依賴、PeerServer 與 TURN。手機震動依賴 Vibration API；iOS Safari 等不支援的瀏覽器會安全略過，不影響控制。
